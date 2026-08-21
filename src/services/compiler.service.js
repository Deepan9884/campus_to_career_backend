const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const aiService = require("./ai.service");

const EXECUTION_TIMEOUT_MS = 3500; // 3.5s maximum execution time

/**
 * Isolated minimum environment variables for safe subprocess execution.
 * Prevents spawned processes from accessing sensitive server secrets (MONGODB_URI, JWT_SECRET, etc.).
 */
function getSafeSubprocessEnv() {
  return {
    PATH: process.env.PATH || "",
    NODE_ENV: "production",
    LANG: "en_US.UTF-8",
    PYTHONUNBUFFERED: "1",
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
      "import sys",
      "from sys",
      "import subprocess",
      "from subprocess",
      "import shutil",
      "from shutil",
      "import socket",
      "from socket",
      "import pty",
      "import ctypes",
      "__import__",
      "open(",
      "eval(",
      "exec(",
      "getattr(",
      "globals()",
      "locals()",
    ],
    javascript: [
      "require('child_process')",
      'require("child_process")',
      "require('fs')",
      'require("fs")',
      "require('net')",
      'require("net")',
      "require('http')",
      'require("http")',
      "require('https')",
      'require("https")',
      "process.env",
      "process.exit",
      "process.kill",
      "child_process",
      "globalthis.process",
      "eval(",
      "new function(",
      "new Function(",
    ],
    java: [
      "runtime.getruntime",
      "processbuilder",
      "java.io.file",
      "java.net",
      "system.exit",
      "system.getenv",
      "system.getproperty",
      "securitymanager",
      "reflect.",
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
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (exitCode) => {
      const elapsed = Date.now() - startTime;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        executionTimeMs: elapsed,
        timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
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
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (exitCode) => {
      const elapsed = Date.now() - startTime;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        executionTimeMs: elapsed,
        timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
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

    exec(`javac "${filePath}"`, { cwd: tempDir, env: getSafeSubprocessEnv(), timeout: EXECUTION_TIMEOUT_MS }, (compileErr, _compileStdout, compileStderr) => {
      if (compileErr || compileStderr) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        return resolve({
          stdout: "",
          stderr: compileStderr || compileErr.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          compileError: true,
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
        stdout += data.toString();
      });

      javaProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      javaProcess.on("close", (exitCode) => {
        const elapsed = Date.now() - startTime;
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          executionTimeMs: elapsed,
          timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
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
        });
      });
    });
  });
}

/**
 * Intelligent Code Evaluator fallback powered by Gemini
 */
async function runWithAiEvaluator(code, language, testCases = [], questionText = "") {
  const prompt = `You are a strict automated code execution judge.
Evaluate the following ${language} code against the test cases for the problem.

Problem: ${questionText}

Candidate Code:
\`\`\`${language}
${code}
\`\`\`

Test Cases:
${JSON.stringify(testCases, null, 2)}

CRITICAL GRADING RULES:
1. If the candidate code is empty, contains only comments, or is unedited starter boilerplate (e.g., "def solve(): pass" or "return null"), EVERY test case MUST be marked "passed": false, and "actualOutput" MUST be set to "(No output produced — solution not implemented)".
2. Only mark a test case "passed": true if the candidate's code actually computes and prints/returns the exact expected output for that input.

Simulate running the code on each test case.
Determine the exact stdout, whether each test case passes or fails, and return valid JSON in this exact structure:
{
  "success": false,
  "stdout": "overall program output",
  "stderr": "",
  "testCaseResults": [
    {
      "testCaseId": "1",
      "input": "input string",
      "expectedOutput": "expected output",
      "actualOutput": "computed output",
      "passed": false,
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
    const parsed = aiService.parseJsonSafely(raw?.data || raw);
    return parsed || {
      success: false,
      stdout: "",
      stderr: "Evaluation failed",
      testCaseResults: [],
    };
  } catch (err) {
    console.error("[CompilerService] AI evaluation error:", err);
    return {
      success: false,
      stdout: "",
      stderr: "Execution evaluation encountered an error.",
      testCaseResults: testCases.map((tc, idx) => ({
        testCaseId: String(idx + 1),
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        actualOutput: "Runtime Error",
        passed: false,
        executionTimeMs: 0,
      })),
    };
  }
}

/**
 * Main Code Execution & Test Case Verification Handler
 */
async function executeCode({ code, language = "python", testCases = [], questionText = "" }) {
  const lang = String(language).toLowerCase().trim();
  const rawCode = String(code || "").trim();

  // Rejection of empty/boilerplate-only solutions
  const strippedOfComments = rawCode
    .replace(/#.*$/gm, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/def\s+solve\(\):\s*pass/g, "")
    .replace(/function\s+solve\(\)\s*\{\s*\}/g, "")
    .replace(/public\s+static\s+void\s+main\([^)]*\)\s*\{\s*\}/g, "")
    .replace(/int\s+main\(\)\s*\{\s*return\s+0;\s*\}/g, "")
    .trim();

  const isUnimplemented = strippedOfComments.length === 0 || strippedOfComments === "pass" || strippedOfComments === "solve();";

  const defaultTestCases = (testCases && testCases.length > 0)
    ? testCases
    : [{ input: "", expectedOutput: "" }];

  // 1. Static Security Check
  const securityCheck = checkCodeSecurity(rawCode, lang);
  if (!securityCheck.safe) {
    // If dangerous code was detected, fallback safely to AI simulation (which won't execute on host)
    console.warn(`[CompilerService] Security scan flagged code: ${securityCheck.reason}. Routing to AI evaluator.`);
    const aiResult = await runWithAiEvaluator(rawCode, lang, defaultTestCases, questionText);
    return {
      success: aiResult.success ?? false,
      language: lang,
      stdout: aiResult.stdout || "",
      stderr: aiResult.stderr ? `${aiResult.stderr}\n[Security Notice: Code evaluated in safe virtual sandbox]` : "[Security Notice: Code evaluated in safe virtual sandbox]",
      testCaseResults: aiResult.testCaseResults || [],
    };
  }

  const results = [];
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
  }

  if (hasNativeRunner && runner) {
    try {
      let overallStdout = "";
      let overallStderr = "";

      for (let i = 0; i < defaultTestCases.length; i++) {
        const tc = defaultTestCases[i];
        const res = await runner(rawCode, tc.input || "");

        if (res.stderr) {
          overallStderr = res.stderr;
        }
        if (res.stdout) {
          overallStdout = res.stdout;
        }

        const expectedTrimmed = String(tc.expectedOutput || "").trim().replace(/\r\n/g, "\n");
        const actualTrimmed = String(res.stdout || "").trim().replace(/\r\n/g, "\n");

        let passed = false;
        let actualOutput = res.stdout || (res.stderr ? `Error: ${res.stderr}` : "");

        if (isUnimplemented) {
          passed = false;
          actualOutput = "(No output produced — solution not implemented)";
        } else if (res.exitCode !== 0) {
          passed = false;
        } else if (expectedTrimmed.length > 0) {
          passed = actualTrimmed === expectedTrimmed;
        } else if (res.stdout && res.exitCode === 0) {
          passed = true;
        } else {
          passed = false;
          if (!actualOutput) actualOutput = "(No output produced)";
        }

        results.push({
          testCaseId: tc.id || String(i + 1),
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          actualOutput: actualOutput || "(empty)",
          passed,
          executionTimeMs: res.executionTimeMs || 10,
        });
      }

      return {
        success: results.length > 0 && results.every((r) => r.passed),
        language: lang,
        stdout: overallStdout,
        stderr: overallStderr,
        testCaseResults: results,
      };
    } catch (err) {
      console.warn("[CompilerService] Native runner failed, falling back to AI evaluator:", err);
    }
  }

  // Fallback to AI-powered execution evaluator
  const aiResult = await runWithAiEvaluator(rawCode, lang, defaultTestCases, questionText);
  return {
    success: aiResult.success ?? false,
    language: lang,
    stdout: aiResult.stdout || "",
    stderr: aiResult.stderr || "",
    testCaseResults: aiResult.testCaseResults || [],
  };
}

module.exports = {
  executeCode,
};
