const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const aiService = require("./ai.service");

const EXECUTION_TIMEOUT_MS = 4000; // 4s maximum runtime execution time
const COMPILE_TIMEOUT_MS = 8000;   // 8s for compile step (javac, g++ can be CPU-intensive)
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB maximum stdout/stderr buffer to prevent memory exhaustion

/**
 * Isolated minimum environment variables for safe subprocess execution.
 * Prevents spawned processes from accessing sensitive server secrets (MONGODB_URI, JWT_SECRET, etc.)
 * while providing necessary OS-level runtime variables for Windows and Linux.
 */
function getSafeSubprocessEnv() {
  return {
    PATH: process.env.PATH || "",
    SystemRoot: process.env.SystemRoot || "C:\\Windows",
    WINDIR: process.env.WINDIR || "C:\\Windows",
    PATHEXT: process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD",
    TEMP: os.tmpdir(),
    TMP: os.tmpdir(),
    NODE_ENV: "production",
    LANG: "en_US.UTF-8",
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
    // Explicitly nullify access to all process secrets
    MONGODB_URI: "",
    JWT_SECRET: "",
    JWT_REFRESH_SECRET: "",
    GEMINI_API_KEY: "",
    GEMINI_API_KEYS: "",
    GITHUB_TOKEN: "",
    RESET_TOKEN_SECRET: "",
    SMTP_PASS: "",
  };
}

/**
 * Clean and sanitize stderr to remove internal temp paths
 */
function sanitizeStderr(stderr = "", tempDir = "", fileName = "solution") {
  if (!stderr) return "";
  let clean = stderr;
  if (tempDir) {
    const escapedTempDir = tempDir.replace(/\\/g, "[\\\\/]");
    clean = clean.replace(new RegExp(escapedTempDir + "[\\\\/]?", "gi"), "");
  }
  // Sanitize standard OS temp paths
  clean = clean.replace(/([A-Za-z]:)?(\\|\/)(?:[\w.-]+(\\|\/))*c2c-[a-z0-9_-]+(\\|\/)/gi, "");
  // Replace internal node/python wrapper prefixes if any
  clean = clean.replace(/^.*node:internal\/.*\n?/gm, "");
  return clean.trim();
}

/**
 * Check if the error message is a compilation / syntax error
 */
function isSyntaxOrCompileError(stderr = "", lang = "") {
  if (!stderr) return false;
  const lower = stderr.toLowerCase();
  if (
    lower.includes("syntaxerror:") ||
    lower.includes("indentationerror:") ||
    lower.includes("taberror:") ||
    lower.includes("invalid syntax") ||
    lower.includes("compileerror") ||
    lower.includes("error: ';' expected") ||
    lower.includes("error: cannot find symbol") ||
    lower.includes("error: reached end of file while parsing") ||
    lower.includes("error: illegal start of expression") ||
    lower.includes("fatal error:") ||
    lower.includes("compilation error")
  ) {
    return true;
  }
  return false;
}

/**
 * Robust JSON parser for AI evaluator responses
 */
function parseJsonSafely(raw) {
  if (!raw) return null;
  const content = raw?.data || raw?.text || raw;
  if (typeof content === "object") return content;
  try {
    const text = String(content).trim();
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    try {
      const match = String(content).match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch {}
  }
  return null;
}

/**
 * Static Security Analysis: Checks candidate code for dangerous system calls,
 * file system modifications, socket creation, or process spawning.
 */
function checkCodeSecurity(code = "", language = "python") {
  const lang = language.toLowerCase();
  const lowerCode = code.toLowerCase();

  const dangerousTokens = {
    python: [
      "import os",
      "from os",
      "import subprocess",
      "from subprocess",
      "import shutil",
      "from shutil",
      "import socket",
      "from socket",
      "import pty",
      "import ctypes",
      "import sys",
      "from sys",
      "import importlib",
      "from importlib",
      "import builtins",
      "from builtins",
      "import posix",
      "import urllib",
      "import requests",
      "import http",
      "__import__",
      "__builtins__",
      "__subclasses__",
      "__mro__",
      "__globals__",
      "__getattribute__",
      "open(",
      "eval(",
      "exec(",
      "compile(",
      "getattr(",
      "setattr(",
      "delattr(",
      "globals()",
      "locals()",
      "breakpoint()",
    ],
    javascript: [
      "require('child_process')",
      'require("child_process")',
      "require('net')",
      'require("net")',
      "require('http')",
      'require("http")',
      "require('https')",
      'require("https")',
      "require('fs')",
      'require("fs")',
      "require('path')",
      'require("path")',
      "require('os')",
      'require("os")',
      "require('crypto')",
      'require("crypto")',
      "require('cluster')",
      'require("cluster")',
      "require('worker_threads')",
      'require("worker_threads")',
      "require(",
      "import(",
      "process.exit",
      "process.kill",
      "process.env",
      "child_process",
      "globalthis",
      "eval(",
      "new function(",
      "new Function(",
      "websocket",
      "fetch(",
      "xmlhttprequest",
    ],
    java: [
      "runtime.getruntime",
      "processbuilder",
      "java.io.",
      "java.io.file",
      "java.net",
      "system.exit",
      "system.getenv",
      "system.getproperty",
      "securitymanager",
      "reflect.",
      "classloader",
    ],
    cpp: [
      "system(",
      "popen(",
      "fork(",
      "exec(",
      "execl(",
      "execv(",
      "<fstream>",
      "<filesystem>",
      "<sys/",
      "<windows.h>",
      "<unistd.h>",
      "<dirent.h>",
      "<arpa/inet.h>",
      "<netinet/in.h>",
      "<sys/socket.h>",
      "<curl/curl.h>",
      "remove(",
      "rename(",
    ],
  };

  const dangerousRegexes = {
    python: [
      /\bopen\s*\(/i,
      /\bexec\s*\(/i,
      /\beval\s*\(/i,
      /\bcompile\s*\(/i,
      /\b__import__\s*\(/i,
      /\bgetattr\s*\(/i,
    ],
    javascript: [
      /\brequire\s*\(/i,
      /\bimport\s*\(/i,
      /\beval\s*\(/i,
      /\bFunction\s*\(/i,
    ],
    java: [
      /\bRuntime\s*\.\s*getRuntime/i,
      /\bProcessBuilder\b/i,
      /\bSystem\s*\.\s*exit/i,
    ],
    cpp: [
      /\bsystem\s*\(/i,
      /\bpopen\s*\(/i,
      /\bfork\s*\(/i,
    ],
  };

  const tokens = dangerousTokens[lang] || [];
  for (const token of tokens) {
    if (lowerCode.includes(token.toLowerCase())) {
      return {
        safe: false,
        reason: `Restricted system operation or security token detected: '${token}'`,
      };
    }
  }

  const regexes = dangerousRegexes[lang] || [];
  for (const regex of regexes) {
    if (regex.test(code)) {
      return {
        safe: false,
        reason: `Restricted system pattern detected matching: ${regex.source}`,
      };
    }
  }

  return { safe: true };
}

/**
 * Execute Python 3 code with stdin and timeout in a secure minimal environment
 */
function runPython(code, input = "") {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-py-"));
    const filePath = path.join(tempDir, "solution.py");
    fs.writeFileSync(filePath, code, { encoding: "utf8", mode: 0o600 });

    const process = spawn("python", [filePath], {
      cwd: tempDir,
      env: getSafeSubprocessEnv(),
      timeout: EXECUTION_TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    if (input) {
      process.stdin.write(input);
      process.stdin.end();
    } else {
      process.stdin.end();
    }

    process.stdout.on("data", (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
        if (stdout.length >= MAX_OUTPUT_BYTES) {
          stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[Output truncated: Exceeded buffer limit]";
          try { process.kill(); } catch {}
        }
      }
    });

    process.stderr.on("data", (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
        if (stderr.length >= MAX_OUTPUT_BYTES) {
          stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[Error truncated: Exceeded buffer limit]";
          try { process.kill(); } catch {}
        }
      }
    });

    process.on("close", (exitCode) => {
      const elapsed = Date.now() - startTime;
      const cleanErr = sanitizeStderr(stderr, tempDir, "solution.py");
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      resolve({
        stdout: stdout.trim(),
        stderr: cleanErr,
        exitCode,
        executionTimeMs: elapsed,
        timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
        isCompileError: isSyntaxOrCompileError(cleanErr, "python"),
      });
    });

    process.on("error", (err) => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        timedOut: false,
        isCompileError: false,
      });
    });
  });
}

/**
 * Execute Node.js / JavaScript code with stdin and timeout in a secure minimal environment
 */
function runJavaScript(code, input = "") {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-js-"));
    const filePath = path.join(tempDir, "solution.js");
    fs.writeFileSync(filePath, code, { encoding: "utf8", mode: 0o600 });

    const process = spawn("node", ["--no-addons", "--disallow-code-generation-from-strings", filePath], {
      cwd: tempDir,
      env: getSafeSubprocessEnv(),
      timeout: EXECUTION_TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    if (input) {
      process.stdin.write(input);
      process.stdin.end();
    } else {
      process.stdin.end();
    }

    process.stdout.on("data", (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
        if (stdout.length >= MAX_OUTPUT_BYTES) {
          stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[Output truncated: Exceeded buffer limit]";
          try { process.kill(); } catch {}
        }
      }
    });

    process.stderr.on("data", (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
        if (stderr.length >= MAX_OUTPUT_BYTES) {
          stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[Error truncated: Exceeded buffer limit]";
          try { process.kill(); } catch {}
        }
      }
    });

    process.on("close", (exitCode) => {
      const elapsed = Date.now() - startTime;
      const cleanErr = sanitizeStderr(stderr, tempDir, "solution.js");
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      resolve({
        stdout: stdout.trim(),
        stderr: cleanErr,
        exitCode,
        executionTimeMs: elapsed,
        timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
        isCompileError: isSyntaxOrCompileError(cleanErr, "javascript"),
      });
    });

    process.on("error", (err) => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        timedOut: false,
        isCompileError: false,
      });
    });
  });
}

/**
 * Execute Java code with compilation and runtime execution in a secure minimal environment
 */
function runJava(code, input = "") {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-java-"));

    let className = "Solution";
    const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    if (classMatch && classMatch[1]) {
      className = classMatch[1];
    }

    const cleanedCode = code.replace(/package\s+[a-zA-Z0-9_.]+;/g, "");
    const filePath = path.join(tempDir, `${className}.java`);
    fs.writeFileSync(filePath, cleanedCode, { encoding: "utf8", mode: 0o600 });

    exec(`javac "${filePath}"`, { cwd: tempDir, env: getSafeSubprocessEnv(), timeout: COMPILE_TIMEOUT_MS }, (compileErr, _compileStdout, compileStderr) => {
      const rawCompileErr = compileStderr || compileErr?.message || "";
      if (compileErr || compileStderr) {
        const cleanErr = sanitizeStderr(rawCompileErr, tempDir, `${className}.java`);
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        return resolve({
          stdout: "",
          stderr: cleanErr,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          compileError: true,
          isCompileError: true,
        });
      }

      const javaProcess = spawn("java", [className], {
        cwd: tempDir,
        env: getSafeSubprocessEnv(),
        timeout: EXECUTION_TIMEOUT_MS,
      });

      let stdout = "";
      let stderr = "";

      if (input) {
        javaProcess.stdin.write(input);
        javaProcess.stdin.end();
      } else {
        javaProcess.stdin.end();
      }

      javaProcess.stdout.on("data", (data) => {
        if (stdout.length < MAX_OUTPUT_BYTES) {
          stdout += data.toString();
          if (stdout.length >= MAX_OUTPUT_BYTES) {
            stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[Output truncated: Exceeded buffer limit]";
            try { javaProcess.kill(); } catch {}
          }
        }
      });

      javaProcess.stderr.on("data", (data) => {
        if (stderr.length < MAX_OUTPUT_BYTES) {
          stderr += data.toString();
          if (stderr.length >= MAX_OUTPUT_BYTES) {
            stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[Error truncated: Exceeded buffer limit]";
            try { javaProcess.kill(); } catch {}
          }
        }
      });

      javaProcess.on("close", (exitCode) => {
        const elapsed = Date.now() - startTime;
        const cleanErr = sanitizeStderr(stderr, tempDir, `${className}.java`);
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}

        resolve({
          stdout: stdout.trim(),
          stderr: cleanErr,
          exitCode,
          executionTimeMs: elapsed,
          timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
          isCompileError: false,
        });
      });

      javaProcess.on("error", (err) => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          isCompileError: false,
        });
      });
    });
  });
}

/**
 * Execute C++ code with compilation and runtime execution
 */
function runCpp(code, input = "") {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-cpp-"));
    const srcPath = path.join(tempDir, "solution.cpp");
    const exePath = path.join(tempDir, process.platform === "win32" ? "solution.exe" : "solution.out");
    fs.writeFileSync(srcPath, code, { encoding: "utf8", mode: 0o600 });

    exec(`g++ -O2 "${srcPath}" -o "${exePath}"`, { cwd: tempDir, env: getSafeSubprocessEnv(), timeout: COMPILE_TIMEOUT_MS }, (compileErr, _compileStdout, compileStderr) => {
      const rawCompileErr = compileStderr || compileErr?.message || "";
      if (compileErr || compileStderr) {
        const cleanErr = sanitizeStderr(rawCompileErr, tempDir, "solution.cpp");
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        return resolve({
          stdout: "",
          stderr: cleanErr,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          compileError: true,
          isCompileError: true,
        });
      }

      const cppProcess = spawn(process.platform === "win32" ? exePath : `./${path.basename(exePath)}`, [], {
        cwd: tempDir,
        env: getSafeSubprocessEnv(),
        timeout: EXECUTION_TIMEOUT_MS,
      });

      let stdout = "";
      let stderr = "";

      if (input) {
        cppProcess.stdin.write(input);
        cppProcess.stdin.end();
      } else {
        cppProcess.stdin.end();
      }

      cppProcess.stdout.on("data", (data) => {
        if (stdout.length < MAX_OUTPUT_BYTES) {
          stdout += data.toString();
          if (stdout.length >= MAX_OUTPUT_BYTES) {
            stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[Output truncated: Exceeded buffer limit]";
            try { cppProcess.kill(); } catch {}
          }
        }
      });

      cppProcess.stderr.on("data", (data) => {
        if (stderr.length < MAX_OUTPUT_BYTES) {
          stderr += data.toString();
          if (stderr.length >= MAX_OUTPUT_BYTES) {
            stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[Error truncated: Exceeded buffer limit]";
            try { cppProcess.kill(); } catch {}
          }
        }
      });

      cppProcess.on("close", (exitCode) => {
        const elapsed = Date.now() - startTime;
        const cleanErr = sanitizeStderr(stderr, tempDir, "solution.cpp");
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}

        resolve({
          stdout: stdout.trim(),
          stderr: cleanErr,
          exitCode,
          executionTimeMs: elapsed,
          timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
          isCompileError: false,
        });
      });

      cppProcess.on("error", (err) => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          isCompileError: false,
        });
      });
    });
  });
}

/**
 * Intelligent Code Evaluator fallback powered by Gemini
 */
async function runWithAiEvaluator(code, language, testCases = [], questionText = "") {
  const prompt = `You are a strict automated code execution engine and compiler judge.
Evaluate the candidate's ${language} code against the test cases.

Problem Context:
${questionText || "Write code to solve the challenge according to the specifications."}

Candidate Code:
\`\`\`${language}
${code}
\`\`\`

Test Cases:
${JSON.stringify(testCases, null, 2)}

STRICT EVALUATION INSTRUCTIONS:
1. First, check if the candidate code has any SYNTAX or COMPILATION errors.
   - If there is a syntax error or missing closing bracket/parenthesis/semicolon:
     set "isCompilationError": true, "success": false, "stderr": "SyntaxError: <details with line number>", and set every test case "passed": false, "status": "Compilation Error", "actualOutput": "Compilation Error: <details>".
2. If the code is completely empty or blank:
     set "success": false, "stderr": "No code provided in coding area.", and set every testcase "passed": false, "status": "Failed", "actualOutput": "(No output produced — code is empty)".
3. If the code executes without syntax errors:
   - Simulate running the code on each testcase input.
   - Compare actual computed output against expectedOutput.
   - If output matches expectedOutput exactly (whitespace-trimmed): set "passed": true, "status": "Passed".
   - If output differs: set "passed": false, "status": "Failed".
   - If a runtime error occurs (IndexError, TypeError, division by zero): set "passed": false, "status": "Runtime Error", "actualOutput": "Runtime Error: <type>".

Return valid JSON in this EXACT structure:
{
  "success": false,
  "isCompilationError": false,
  "stdout": "standard output if any",
  "stderr": "error messages if any",
  "passedCount": 0,
  "totalCount": ${testCases.length || 1},
  "testCaseResults": [
    {
      "testCaseId": "1",
      "input": "input string",
      "expectedOutput": "expected output",
      "actualOutput": "computed actual output",
      "passed": false,
      "status": "Passed",
      "executionTimeMs": 15
    }
  ]
}

Return ONLY raw valid JSON.`;

  try {
    const raw = await aiService.generateContent({
      prompt,
      feature: "quiz-grading",
      temperature: 0.1,
    });
    const parsed = parseJsonSafely(raw?.data || raw);
    if (parsed && Array.isArray(parsed.testCaseResults)) {
      const passedCount = parsed.testCaseResults.filter((t) => t.passed).length;
      const totalCount = parsed.testCaseResults.length;
      return {
        success: parsed.success ?? (passedCount === totalCount && totalCount > 0),
        isCompilationError: parsed.isCompilationError ?? false,
        compilationError: parsed.isCompilationError ?? false,
        stdout: parsed.stdout || "",
        stderr: parsed.stderr || "",
        passedCount,
        totalCount,
        testCaseResults: parsed.testCaseResults.map((tc, idx) => ({
          testCaseId: tc.testCaseId || String(idx + 1),
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          actualOutput: tc.actualOutput || (tc.passed ? tc.expectedOutput : "(No output)"),
          passed: !!tc.passed,
          status: tc.status || (tc.passed ? "Passed" : "Failed"),
          executionTimeMs: tc.executionTimeMs || 12,
        })),
      };
    }
  } catch (err) {
    console.error("[CompilerService] AI evaluation error:", err);
  }

  return {
    success: false,
    isCompilationError: false,
    compilationError: false,
    stdout: "",
    stderr: "Code execution evaluation encountered an error.",
    passedCount: 0,
    totalCount: testCases.length,
    testCaseResults: testCases.map((tc, idx) => ({
      testCaseId: String(idx + 1),
      input: tc.input || "",
      expectedOutput: tc.expectedOutput || "",
      actualOutput: "Execution Error",
      passed: false,
      status: "Runtime Error",
      executionTimeMs: 0,
    })),
  };
}

/**
 * Main Code Execution & Test Case Verification Handler
 */
async function executeCode({ code, language = "python", testCases = [], questionText = "" }) {
  const lang = String(language).toLowerCase().trim();
  const rawCode = String(code || "").trim();

  // Validate presence of real solution code (ignoring default starter comment lines)
  const cleanCode = rawCode.replace(/^(#|\/\/|--)\s*write your code here\s*$/gmi, "").trim();
  if (!cleanCode) {
    const defaultTCs = testCases && testCases.length > 0 ? testCases : [{ input: "", expectedOutput: "" }];
    return {
      success: false,
      isCompilationError: false,
      compilationError: false,
      language: lang,
      stdout: "",
      stderr: "No solution code provided in editor. Please write your code before running test cases.",
      passedCount: 0,
      totalCount: defaultTCs.length,
      testCaseResults: defaultTCs.map((tc, i) => ({
        testCaseId: tc.id || String(i + 1),
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        actualOutput: "(No output — code is empty)",
        passed: false,
        status: "Not Attempted",
        executionTimeMs: 0,
      })),
    };
  }

  const defaultTestCases = (testCases && testCases.length > 0)
    ? testCases
    : [{ input: "", expectedOutput: "", description: "Default Case" }];

  // 1. Static Security Check
  const securityCheck = checkCodeSecurity(cleanCode, lang);
  if (!securityCheck.safe) {
    console.warn(`[CompilerService] Security scan flagged code: ${securityCheck.reason}. Routing to AI evaluator.`);
    const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText);
    return {
      success: aiResult.success ?? false,
      isCompilationError: aiResult.isCompilationError ?? false,
      compilationError: aiResult.compilationError ?? false,
      language: lang,
      stdout: aiResult.stdout || "",
      stderr: aiResult.stderr ? `${aiResult.stderr}\n[Security Notice: Code evaluated in safe virtual sandbox]` : "[Security Notice: Code evaluated in safe virtual sandbox]",
      passedCount: aiResult.passedCount ?? 0,
      totalCount: aiResult.totalCount ?? defaultTestCases.length,
      testCaseResults: aiResult.testCaseResults || [],
    };
  }

  let hasNativeRunner = false;
  let runner = null;

  if (lang.includes("python") || lang === "py") {
    hasNativeRunner = true;
    runner = runPython;
  } else if (lang.includes("javascript") || lang.includes("node") || lang === "js" || lang.includes("typescript")) {
    hasNativeRunner = true;
    runner = runJavaScript;
  } else if (lang.includes("java")) {
    hasNativeRunner = true;
    runner = runJava;
  } else if (lang.includes("cpp") || lang.includes("c++")) {
    hasNativeRunner = true;
    runner = runCpp;
  }

  if (hasNativeRunner && runner) {
    try {
      const results = [];
      let overallStdout = "";
      let overallStderr = "";
      let hasCompilationError = false;

      for (let i = 0; i < defaultTestCases.length; i++) {
        const tc = defaultTestCases[i];
        const res = await runner(cleanCode, tc.input || "");

        if (res.stderr) {
          overallStderr = res.stderr;
        }
        if (res.stdout) {
          overallStdout = res.stdout;
        }

        // If compilation / syntax error occurred on execution
        if (res.isCompileError || res.compileError) {
          hasCompilationError = true;
          overallStderr = res.stderr || "Compilation / Syntax Error";

          for (let j = i; j < defaultTestCases.length; j++) {
            const remTc = defaultTestCases[j];
            results.push({
              testCaseId: remTc.id || String(j + 1),
              input: remTc.input || "",
              expectedOutput: remTc.expectedOutput || "",
              actualOutput: `Compilation Error: ${overallStderr.split("\n")[0]}`,
              passed: false,
              status: "Compilation Error",
              executionTimeMs: res.executionTimeMs || 0,
              error: overallStderr,
            });
          }
          break;
        }

        const expectedTrimmed = String(tc.expectedOutput || "").trim().replace(/\r\n/g, "\n");
        const actualTrimmed = String(res.stdout || "").trim().replace(/\r\n/g, "\n");

        let passed = false;
        let status = "Failed";
        let actualOutput = res.stdout || (res.stderr ? `Error: ${res.stderr}` : "");

        if (res.exitCode !== 0) {
          passed = false;
          status = "Runtime Error";
          actualOutput = res.stderr ? `Runtime Error: ${res.stderr}` : "Runtime Error (exit code " + res.exitCode + ")";
        } else if (expectedTrimmed.length > 0) {
          passed = actualTrimmed === expectedTrimmed;
          status = passed ? "Passed" : "Failed";
        } else if (res.stdout && res.exitCode === 0) {
          passed = true;
          status = "Passed";
        } else {
          passed = false;
          status = "Failed";
          if (!actualOutput) actualOutput = "(No output produced)";
        }

        results.push({
          testCaseId: tc.id || String(i + 1),
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          actualOutput: actualOutput || "(empty)",
          passed,
          status,
          executionTimeMs: res.executionTimeMs || 10,
          error: res.stderr || undefined,
        });
      }

      const passedCount = results.filter((r) => r.passed).length;
      const totalCount = results.length;

      // If native execution produced 0 passes but code contains valid function definitions (e.g. def / function / class),
      // fallback to the intelligent AI sandbox runner to evaluate function return values against test cases.
      const hasFunctionSyntax = /(def\s+[a-zA-Z0-9_]+|function\s+[a-zA-Z0-9_]+|class\s+[a-zA-Z0-9_]+|const\s+[a-zA-Z0-9_]+\s*=\s*\([^)]*\)\s*=>)/.test(cleanCode);
      if (passedCount === 0 && !hasCompilationError && hasFunctionSyntax) {
        console.info("[CompilerService] Native runner produced 0 stdout for function-based code. Evaluating with AI sandbox engine.");
        const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText);
        if (aiResult && Array.isArray(aiResult.testCaseResults) && aiResult.testCaseResults.length > 0) {
          return {
            success: aiResult.success ?? false,
            isCompilationError: aiResult.isCompilationError ?? false,
            compilationError: aiResult.compilationError ?? false,
            isRuntimeError: aiResult.isRuntimeError ?? false,
            language: lang,
            stdout: aiResult.stdout || overallStdout,
            stderr: aiResult.stderr || overallStderr,
            passedCount: aiResult.passedCount ?? 0,
            totalCount: aiResult.totalCount ?? defaultTestCases.length,
            testCaseResults: aiResult.testCaseResults,
          };
        }
      }

      return {
        success: !hasCompilationError && totalCount > 0 && passedCount === totalCount,
        isCompilationError: hasCompilationError,
        compilationError: hasCompilationError,
        isRuntimeError: !hasCompilationError && results.some((r) => r.status === "Runtime Error"),
        language: lang,
        stdout: overallStdout,
        stderr: overallStderr,
        passedCount,
        totalCount,
        testCaseResults: results,
      };
    } catch (err) {
      console.warn("[CompilerService] Native runner failed, falling back to AI evaluator:", err);
    }
  }

  // Fallback to AI-powered execution evaluator
  const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText);
  return {
    success: aiResult.success ?? false,
    isCompilationError: aiResult.isCompilationError ?? false,
    compilationError: aiResult.compilationError ?? false,
    isRuntimeError: aiResult.isRuntimeError ?? false,
    language: lang,
    stdout: aiResult.stdout || "",
    stderr: aiResult.stderr || "",
    passedCount: aiResult.passedCount ?? 0,
    totalCount: aiResult.totalCount ?? defaultTestCases.length,
    testCaseResults: aiResult.testCaseResults || [],
  };
}

module.exports = {
  executeCode,
  checkCodeSecurity,
};
