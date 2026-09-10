const { spawn, execFile, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const aiService = require("./ai.service");

const EXECUTION_TIMEOUT_MS = 4000; // 4s maximum runtime execution time
const COMPILE_TIMEOUT_MS = 8000;   // 8s for compile step (javac, g++ can be CPU-intensive)
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB maximum stdout/stderr buffer to prevent memory exhaustion

// ── In-Memory Execution Cache (5-Minute TTL, max 500 entries) ───────────────
// Provides sub-millisecond response time for repeated test case executions during high-concurrency exams.
const EXECUTION_CACHE_TTL_MS = 5 * 60 * 1000;
const executionCache = new Map();

function computeCacheKey(code = "", language = "", testCases = []) {
  return crypto
    .createHash("sha256")
    .update(`${language.toLowerCase()}::${code.trim()}::${JSON.stringify(testCases)}`)
    .digest("hex");
}

function getCachedResult(key) {
  const entry = executionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    executionCache.delete(key);
    return null;
  }
  // Never serve a cached result if it recorded a host compiler absence error
  if (entry.result && (isHostCompilerMissing(entry.result.stderr) || entry.result.hostCompilerMissing)) {
    executionCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedResult(key, result) {
  if (executionCache.size >= 500) {
    executionCache.delete(executionCache.keys().next().value);
  }
  executionCache.set(key, { result, expiresAt: Date.now() + EXECUTION_CACHE_TTL_MS });
}

// ── Host Compiler Availability Prober ─────────────────────────────────────
let hostBinaryAvailable = {
  javac: null,
  gpp: null,
};

function checkHostBinary(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 2000 }, (err) => {
      resolve(!err);
    });
  });
}

async function isJavacAvailable() {
  if (hostBinaryAvailable.javac === null) {
    hostBinaryAvailable.javac = await checkHostBinary("javac -version");
  }
  return hostBinaryAvailable.javac;
}

async function isGppAvailable() {
  if (hostBinaryAvailable.gpp === null) {
    hostBinaryAvailable.gpp = await checkHostBinary(process.platform === "win32" ? "g++ --version" : "g++ --version || clang++ --version");
  }
  return hostBinaryAvailable.gpp;
}

// ── High-Concurrency Execution Queue (Semaphore) ───────────────────────────
// Throttles simultaneous CPU-bound subprocess compilations to prevent host saturation when 40+ students submit code.
const MAX_CONCURRENT_COMPILATIONS = Math.max(6, (os.cpus()?.length || 2) * 2);
let runningCompilations = 0;
const compilationQueue = [];

function acquireExecutionSlot() {
  return new Promise((resolve) => {
    if (runningCompilations < MAX_CONCURRENT_COMPILATIONS) {
      runningCompilations++;
      return resolve();
    }
    compilationQueue.push(resolve);
  });
}

function releaseExecutionSlot() {
  runningCompilations--;
  if (compilationQueue.length > 0) {
    runningCompilations++;
    const next = compilationQueue.shift();
    next();
  }
}

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
 * Check if the error message is a compile-time / syntax error.
 * Runtime exceptions (ValueError, TypeError, NameError, IndexError, etc.) are NOT compile errors.
 */
function isSyntaxOrCompileError(stderr = "", lang = "") {
  if (!stderr) return false;
  const lower = stderr.toLowerCase();
  const normalizedLang = String(lang || "").toLowerCase();

  // Python runtime exceptions — these happen at runtime, NOT at compile time.
  // Do NOT classify them as compile errors (they are shown as "Runtime Error").
  const PYTHON_RUNTIME_ERRORS = [
    "valueerror:", "typeerror:", "nameerror:", "indexerror:", "keyerror:",
    "attributeerror:", "runtimeerror:", "zerodivisionerror:", "overflowerror:",
    "recursionerror:", "stopiteration:", "generatorexit:", "systemexit:",
    "memoryerror:", "buffererror:", "arithmeticerror:", "lookuperror:",
    "assertionerror:", "notimplementederror:", "oserror:", "ioerror:",
    "filenotfounderror:", "permissionerror:", "timeouterror:",
  ];
  if (normalizedLang.includes("python") || normalizedLang === "py") {
    if (PYTHON_RUNTIME_ERRORS.some((e) => lower.includes(e))) return false;
  }

  // JavaScript/Node.js runtime exceptions
  const JS_RUNTIME_ERRORS = ["referenceerror:", "rangeerror:", "urierror:"];
  if (normalizedLang.includes("javascript") || normalizedLang.includes("typescript") || normalizedLang === "js") {
    if (JS_RUNTIME_ERRORS.some((e) => lower.includes(e))) return false;
  }

  // True compile / syntax errors (all languages)
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
    lower.includes("compilation error") ||
    lower.includes("undefined reference to `main'") ||
    lower.includes("undefined reference to 'main'") ||
    lower.includes("main method not found") ||
    lower.includes("not declared in this scope") ||
    lower.includes("expected declaration") ||
    lower.includes("expected expression")
  ) {
    return true;
  }

  // For C/C++/Java: any "error:" line from the compiler is a compile error
  if (
    normalizedLang.includes("java") ||
    normalizedLang.includes("cpp") ||
    normalizedLang.includes("c++") ||
    normalizedLang === "c"
  ) {
    if (lower.includes("error:")) return true;
  }

  return false;
}

/**
 * Extract 1-indexed line number and concise error message from compiler or interpreter stderr
 */
function extractErrorDetails(stderr = "", lang = "") {
  if (!stderr) return { errorLine: null, errorMessage: "" };

  const clean = String(stderr).trim();
  const normalizedLang = String(lang || "").toLowerCase().trim();
  let errorLine = null;
  let errorMessage = "";

  // Check for missing main function in C/C++/Java
  if (
    clean.toLowerCase().includes("main method not found") ||
    clean.toLowerCase().includes("undefined reference to `main'") ||
    clean.toLowerCase().includes("undefined reference to 'main'")
  ) {
    return {
      errorLine: 1,
      errorMessage: "Main method not found. Complete program with main() is required (CodeTantra style).",
    };
  }

  // 1. Java (javac): Main.java:5: error: ';' expected
  const javaMatch = clean.match(/(?:[A-Za-z0-9_.-]+\.java):(\d+)(?::\d+)?:\s*(?:error:)?\s*([^\r\n]+)/i);

  // 2. C / C++ (gcc / g++ / clang): solution.cpp:7:5: error: expected ';' before 'return'
  const cppMatch = clean.match(/(?:[A-Za-z0-9_.-]+\.(?:cpp|c|cc|cxx|h|hpp)):(\d+)(?::\d+)?:\s*(?:error:)?\s*([^\r\n]+)/i);

  // 3. Python: File "solution.py", line 4
  const pyTraceMatch = clean.match(/File\s+"[^"]*",\s*line\s+(\d+)/i);
  const pyErrTypeMatch = clean.match(/((?:SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError|IndexError|ZeroDivisionError):[^\r\n]+)/i);

  // 4. JavaScript / Node.js: solution.js:4
  const jsLineMatch = clean.match(/(?:solution\.js|eval|input):(\d+)/i);
  const jsErrMatch = clean.match(/((?:SyntaxError|ReferenceError|TypeError):[^\r\n]+)/i);

  if (normalizedLang.includes("java") || javaMatch) {
    if (javaMatch) {
      errorLine = parseInt(javaMatch[1], 10);
      errorMessage = `Line ${errorLine}: ${javaMatch[2]?.trim() || "Compilation error"}`;
    } else {
      const lineMatch = clean.match(/(?:line\s*|:)(\d+)/i);
      if (lineMatch) {
        errorLine = parseInt(lineMatch[1], 10);
        errorMessage = `Line ${errorLine}: ${clean.split("\n")[0]}`;
      } else {
        errorMessage = clean.split("\n")[0] || "Java Compilation Error";
      }
    }
  } else if (normalizedLang.includes("cpp") || normalizedLang.includes("c++") || normalizedLang === "c" || cppMatch) {
    if (cppMatch) {
      errorLine = parseInt(cppMatch[1], 10);
      errorMessage = `Line ${errorLine}: ${cppMatch[2]?.trim() || "Compilation error"}`;
    } else {
      const lineMatch = clean.match(/(?:line\s*|:)(\d+)/i);
      if (lineMatch) {
        errorLine = parseInt(lineMatch[1], 10);
        errorMessage = `Line ${errorLine}: ${clean.split("\n")[0]}`;
      } else {
        errorMessage = clean.split("\n")[0] || "C/C++ Compilation Error";
      }
    }
  } else if (normalizedLang.includes("python") || normalizedLang === "py" || pyTraceMatch || pyErrTypeMatch) {
    // For Python: use the LAST "line X" in the traceback, which is the actual error location.
    // The first match is often an outer wrapper frame, not the student's code line.
    const allLineMatches = [...clean.matchAll(/File\s+"[^"]*",\s*line\s+(\d+)/gi)];
    if (allLineMatches.length > 0) {
      errorLine = parseInt(allLineMatches[allLineMatches.length - 1][1], 10);
    } else {
      const simpleLineMatch = clean.match(/line\s+(\d+)/i);
      if (simpleLineMatch) errorLine = parseInt(simpleLineMatch[1], 10);
    }
    const desc = pyErrTypeMatch ? pyErrTypeMatch[1].trim() : (clean.split("\n")[0] || "SyntaxError: invalid syntax");
    errorMessage = errorLine ? `Line ${errorLine}: ${desc}` : desc;
  } else if (normalizedLang.includes("javascript") || normalizedLang.includes("typescript") || jsLineMatch || jsErrMatch) {
    if (jsLineMatch) errorLine = parseInt(jsLineMatch[1], 10);
    const desc = jsErrMatch ? jsErrMatch[1].trim() : (clean.split("\n")[0] || "JavaScript Error");
    errorMessage = errorLine ? `Line ${errorLine}: ${desc}` : desc;
  } else {
    const genericMatch = clean.match(/(?:line\s*|:)(\d+)/i);
    if (genericMatch) {
      errorLine = parseInt(genericMatch[1], 10);
      errorMessage = `Line ${errorLine}: ${clean.split("\n")[0]}`;
    } else {
      errorMessage = clean.split("\n")[0] || "Compilation / Syntax Error";
    }
  }

  return { errorLine, errorMessage };
}

/**
 * Check if the local host machine is missing the compiler / runtime executable
 */
function isHostCompilerMissing(stderr = "") {
  if (!stderr) return false;
  const lower = String(stderr).toLowerCase();
  return (
    lower.includes("not recognized as an internal or external command") ||
    lower.includes("is not recognized as an operable program") ||
    lower.includes("is not recognized") ||
    lower.includes("command not found") ||
    lower.includes("not found") ||
    lower.includes("enoent") ||
    lower.includes("spawn unknown") ||
    lower.includes("application control policy") ||
    lower.includes("blocked this file") ||
    lower.includes("failed to read unmanaged installs") ||
    lower.includes("installing python") ||
    lower.includes("python install manager") ||
    lower.includes("cannot find the path specified") ||
    lower.includes("no such file or directory") ||
    lower.includes("cannot spawn") ||
    (lower.includes("javac") && lower.includes("not found")) ||
    (lower.includes("g++") && lower.includes("not found")) ||
    (lower.includes("gcc") && lower.includes("not found")) ||
    (lower.includes("python") && lower.includes("not found")) ||
    (lower.includes("python3") && lower.includes("not found")) ||
    lower.includes("java compiler (javac) not available") ||
    lower.includes("/bin/sh: 1: javac") ||
    lower.includes("/bin/sh: 1: g++") ||
    lower.includes("/bin/sh: 1: gcc") ||
    lower.includes("/bin/sh: 1: python")
  );
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
      "sys.modules",
      "sys._getframe",
      "sys.set_coroutine_origin_tracking_depth",
      "import importlib",
      "from importlib",
      "import builtins",
      "from builtins",
      "import posix",
      "import urllib",
      "import requests",
      "import http",
      "import pickle",
      "from pickle",
      "import shelve",
      "from shelve",
      "import marshal",
      "from marshal",
      "import multiprocessing",
      "from multiprocessing",
      "import threading",
      "from threading",
      "import inspect",
      "from inspect",
      "import types",
      "from types",
      "import gc",
      "from gc",
      "import platform",
      "from platform",
      "__import__",
      "__builtins__",
      "__subclasses__",
      "__mro__",
      "__globals__",
      "__getattribute__",
      "__code__",
      "open(",
      "eval(",
      "exec(",
      "compile(",
      "getattr(",
      "setattr(",
      "delattr(",
      "globals()",
      "locals()",
      "vars()",
      "breakpoint()",
      "memoryview(",
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
      "require('child_process')",
      "require('cluster')",
      "require('worker_threads')",
      "require('vm')",
      "require('v8')",
      "fs.writefile",
      "fs.unlink",
      "fs.rm",
      "fs.mkdir",
      "import(",
      "process.exit",
      "process.kill",
      "process.env",
      "process.binding",
      "process.mainModule",
      "process.dlopen",
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
      "unsafe",
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
      "<process.h>",
      "<direct.h>",
      "<io.h>",
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
      /\bsetattr\s*\(/i,
      /\bdelattr\s*\(/i,
      /\b__subclasses__\b/i,
      /\b__globals__\b/i,
      /\b__code__\b/i,
    ],
    javascript: [
      /\brequire\s*\(\s*['"](?!fs|readline)[^'"]+['"]\s*\)/i,
      /\bfs\s*\.\s*(?:writeFile|unlink|rm|mkdir|appendFile|truncate|chmod|chown)/i,
      /\bimport\s*\(/i,
      /\beval\s*\(/i,
      /\bFunction\s*\(/i,
      /\bprocess\s*\.\s*(?:exit|kill|env|binding|mainModule)/i,
    ],
    java: [
      /\bRuntime\s*\.\s*getRuntime/i,
      /\bProcessBuilder\b/i,
      /\bSystem\s*\.\s*exit/i,
      /\bjava\.lang\.reflect\b/i,
    ],
    cpp: [
      /\bsystem\s*\(/i,
      /\bpopen\s*\(/i,
      /\bfork\s*\(/i,
      /\bexec[lvp]*\s*\(/i,
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
 * Automatically tries multiple Python binary candidates ('python3', 'python', 'py')
 */
async function runPython(code, input = "") {
  const pythonCmds = process.platform === "win32"
    ? [["python3", []], ["py", []], ["python", []]]
    : [["python3", []], ["python", []]];

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-py-"));
  const filePath = path.join(tempDir, "solution.py");
  fs.writeFileSync(filePath, code, { encoding: "utf8", mode: 0o600 });

  for (const [cmd, extraArgs] of pythonCmds) {
    const res = await new Promise((resolve) => {
      const startTime = Date.now();
      let proc;
      try {
        proc = spawn(cmd, [...extraArgs, filePath], {
          cwd: tempDir,
          env: getSafeSubprocessEnv(),
          timeout: EXECUTION_TIMEOUT_MS,
        });
      } catch (spawnErr) {
        return resolve({
          stdout: "",
          stderr: spawnErr.message,
          exitCode: 127,
          executionTimeMs: 0,
          timedOut: false,
          isCompileError: false,
          hostCompilerMissing: true,
        });
      }

      let stdout = "";
      let stderr = "";

      if (input) {
        proc.stdin.write(input);
        proc.stdin.end();
      } else {
        proc.stdin.end();
      }

      proc.stdout.on("data", (data) => {
        if (stdout.length < MAX_OUTPUT_BYTES) {
          stdout += data.toString();
          if (stdout.length >= MAX_OUTPUT_BYTES) {
            stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[Output truncated: Exceeded buffer limit]";
            try { proc.kill(); } catch {}
          }
        }
      });

      proc.stderr.on("data", (data) => {
        if (stderr.length < MAX_OUTPUT_BYTES) {
          stderr += data.toString();
          if (stderr.length >= MAX_OUTPUT_BYTES) {
            stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[Error truncated: Exceeded buffer limit]";
            try { proc.kill(); } catch {}
          }
        }
      });

      proc.on("close", (exitCode) => {
        const elapsed = Date.now() - startTime;
        const cleanErr = sanitizeStderr(stderr, tempDir, "solution.py");
        const isMissing = isHostCompilerMissing(stderr) || isHostCompilerMissing(cleanErr);
        resolve({
          stdout: stdout.trim(),
          stderr: isMissing ? "Python interpreter not functional on host" : cleanErr,
          exitCode: isMissing ? 127 : exitCode,
          executionTimeMs: elapsed,
          timedOut: elapsed >= EXECUTION_TIMEOUT_MS,
          isCompileError: !isMissing && isSyntaxOrCompileError(cleanErr, "python"),
          hostCompilerMissing: isMissing,
        });
      });

      proc.on("error", (err) => {
        const isMissing = isHostCompilerMissing(err.message);
        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: isMissing ? 127 : 1,
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          isCompileError: false,
          hostCompilerMissing: isMissing,
        });
      });
    });

    if (!res.hostCompilerMissing) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      return res;
    }
  }

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  return {
    stdout: "",
    stderr: "Python interpreter not found on host",
    exitCode: 127,
    executionTimeMs: 0,
    timedOut: false,
    isCompileError: false,
    hostCompilerMissing: true,
  };
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
      const isMissing = isHostCompilerMissing(err.message);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: isMissing ? 127 : 1,
        executionTimeMs: Date.now() - startTime,
        timedOut: false,
        isCompileError: false,
        hostCompilerMissing: isMissing,
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

    // Strict CodeTantra check: complete program with main entry point is required
    const hasMainMethod = /public\s+static\s+void\s+main\s*\(/i.test(code);
    if (!hasMainMethod) {
      return resolve({
        stdout: "",
        stderr: "Main.java:1: error: Main method not found in class. Please define the main method as:\n   public static void main(String[] args)\nand read dynamic input using Scanner (as in CodeTantra).",
        exitCode: 1,
        executionTimeMs: 0,
        compileError: true,
        isCompileError: true,
        errorLine: 1,
        errorMessage: "Main method not found. Complete program with main() is required.",
        hostCompilerMissing: false,
      });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-java-"));

    let className = "Main";
    // 1. Look for public class first
    const publicClassMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    if (publicClassMatch && publicClassMatch[1]) {
      className = publicClassMatch[1];
    } else {
      // 2. Look for class containing public static void main
      const classWithMainMatch = code.match(/class\s+([A-Za-z0-9_]+)[\s\S]*?public\s+static\s+void\s+main/);
      if (classWithMainMatch && classWithMainMatch[1]) {
        className = classWithMainMatch[1];
      } else {
        const anyClassMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
        if (anyClassMatch && anyClassMatch[1]) {
          className = anyClassMatch[1];
        }
      }
    }

    let cleanedCode = code.replace(/package\s+[a-zA-Z0-9_.]+;/g, "");

    // Seamless Java Collections & I/O support: auto-import java.util and java.io if not explicitly imported
    let prependedLines = 0;
    let extraImports = "";
    if (!/import\s+java\.util\./.test(cleanedCode)) {
      extraImports += "import java.util.*;\n";
      prependedLines++;
    }
    if (!/import\s+java\.io\./.test(cleanedCode)) {
      extraImports += "import java.io.*;\n";
      prependedLines++;
    }
    if (extraImports) {
      cleanedCode = extraImports + cleanedCode;
    }

    const filePath = path.join(tempDir, `${className}.java`);
    fs.writeFileSync(filePath, cleanedCode, { encoding: "utf8", mode: 0o600 });

    execFile("javac", [filePath], { cwd: tempDir, env: getSafeSubprocessEnv(), timeout: COMPILE_TIMEOUT_MS }, (compileErr, _compileStdout, compileStderr) => {
      const rawCompileErr = compileStderr || compileErr?.message || "";
      if (compileErr || compileStderr) {
        let cleanErr = sanitizeStderr(rawCompileErr, tempDir, `${className}.java`);
        // Offset error line numbers back to student's source code if helper imports were prepended
        if (prependedLines > 0) {
          cleanErr = cleanErr.replace(new RegExp(`(${className}\\.java):(\\d+)`, "gi"), (_, file, lineNum) => {
            const adjusted = Math.max(1, parseInt(lineNum, 10) - prependedLines);
            return `${file}:${adjusted}`;
          });
        }
        const isMissing = isHostCompilerMissing(rawCompileErr) || isHostCompilerMissing(cleanErr) || isHostCompilerMissing(compileErr?.message) || rawCompileErr.includes("javac:") || rawCompileErr.includes("javac not found");
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        return resolve({
          stdout: "",
          stderr: isMissing ? "Java compiler (javac) not available on host" : cleanErr,
          exitCode: isMissing ? 127 : 1,
          executionTimeMs: Date.now() - startTime,
          compileError: !isMissing,
          isCompileError: !isMissing,
          hostCompilerMissing: isMissing,
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
        const isMissing = isHostCompilerMissing(err.message);
        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: isMissing ? 127 : 1,
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          isCompileError: false,
          hostCompilerMissing: isMissing,
        });
      });
    });
  });
}

/**
 * Execute C++ code with compilation and runtime execution
 * Automatically tries available C++ compilers ('g++', 'clang++', 'gcc')
 */
async function runCpp(code, input = "") {
  // Strict CodeTantra check: complete program with main() is required
  const hasMain = /(?:int|void)\s+main\s*\(/i.test(code);
  if (!hasMain) {
    return {
      stdout: "",
      stderr: "solution.cpp:1: error: undefined reference to 'main'. A complete program with 'int main()' reading dynamic input from stdin is required (CodeTantra style).",
      exitCode: 1,
      executionTimeMs: 0,
      compileError: true,
      isCompileError: true,
      errorLine: 1,
      errorMessage: "undefined reference to 'main'",
      hostCompilerMissing: false,
    };
  }

  const compilerBinaries = ["g++", "clang++", "gcc", "clang"];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-cpp-"));
  const srcPath = path.join(tempDir, "solution.cpp");
  const exePath = path.join(tempDir, process.platform === "win32" ? "solution.exe" : "solution.out");
  fs.writeFileSync(srcPath, code, { encoding: "utf8", mode: 0o600 });

  let compiled = false;
  let lastCompileErr = "";
  let hostMissing = false;

  for (const bin of compilerBinaries) {
    const res = await new Promise((resolve) => {
      execFile(bin, ["-O2", srcPath, "-o", exePath], { cwd: tempDir, env: getSafeSubprocessEnv(), timeout: COMPILE_TIMEOUT_MS }, (err, _stdout, stderr) => {
        if (err || stderr) {
          const rawErr = stderr || err?.message || "";
          const isMissing = isHostCompilerMissing(rawErr);
          return resolve({ success: false, err: rawErr, isMissing });
        }
        return resolve({ success: true, err: "" });
      });
    });

    if (res.success) {
      compiled = true;
      break;
    } else {
      lastCompileErr = res.err;
      if (res.isMissing) {
        hostMissing = true;
      } else {
        // Genuine compilation error
        hostMissing = false;
        break;
      }
    }
  }

  if (!compiled) {
    const cleanErr = sanitizeStderr(lastCompileErr, tempDir, "solution.cpp");
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    return {
      stdout: "",
      stderr: cleanErr || (hostMissing ? "C++ compiler not available on host" : "Compilation Error"),
      exitCode: hostMissing ? 127 : 1,
      executionTimeMs: 0,
      compileError: !hostMissing,
      isCompileError: !hostMissing,
      hostCompilerMissing: hostMissing,
    };
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
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
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

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
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
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
 * Intelligent Code Evaluator fallback powered by Gemini with deterministic temperature (0.0)
 */
async function runWithAiEvaluator(code, language, testCases = [], questionText = "", userId = null) {
  const sanitizedTestCases = testCases.map((tc) => {
    const rawInput = String(tc.input || "");
    const rawExpected = String(tc.expectedOutput || "");
    const adapted = adaptLeetCodeInput(rawInput, false);
    const cleanedExp = cleanExpectedOutput(rawExpected);
    return {
      ...tc,
      input: adapted && adapted !== rawInput ? adapted : rawInput,
      expectedOutput: cleanedExp || rawExpected,
    };
  });

  const prompt = `You are a strict automated code execution engine and compiler judge.
Evaluate the candidate's ${language} code against the test cases.

Problem Context:
${questionText || "Write code to solve the challenge according to the specifications."}

Candidate Code:
\`\`\`${language}
${code}
\`\`\`

Test Cases:
${JSON.stringify(sanitizedTestCases, null, 2)}

STRICT EVALUATION INSTRUCTIONS (CodeTantra Dynamic Input & Full Program Rules):
1. MANDATORY PROGRAM STRUCTURE & STANDARD LIBRARIES:
   - In Java, the code MUST have a class and 'public static void main(String[] args)' that reads dynamic input from stdin (e.g. Scanner).
   - Standard Java Collections (java.util.List, ArrayList, Map, HashMap, Set, HashSet, Queue, LinkedList, PriorityQueue, Stack, Deque, Arrays, Collections, Scanner) and I/O (BufferedReader, InputStreamReader) are fully supported. Do NOT fail compilation solely for omitted 'import java.util.*' if standard Java collection classes are used.
   - In C and C++, the code MUST have 'int main()' that reads dynamic input from stdin (cin, scanf). Standard library headers (<vector>, <iostream>, <algorithm>, <string>, <map>, <set>) are supported.
   - In Python, the code should read dynamic input (sys.stdin or input()).
   - In JavaScript, the code should read dynamic input (fs.readFileSync(0, 'utf-8') or readline).
   - If Java, C, or C++ code does NOT have a main function/method:
     set "isCompilationError": true, "success": false, "errorLine": 1, "errorMessage": "Main method not found. Complete program with main() is required (as in CodeTantra).", "stderr": "Compilation Error: Main method not found. Please define main() to read dynamic input from stdin.", and mark all test cases "status": "Compilation Error", "passed": false.

2. SYNTAX AND COMPILATION ERRORS:
   - Check if the code has any genuine syntax errors, missing semicolons, undeclared custom variables, or unmatched brackets.
   - If there is a syntax or compilation error:
     set "isCompilationError": true, "success": false, "errorLine": <1-indexed line number of the error>, "errorMessage": "Line <line_number>: <concise error description>", "stderr": "Line <line_number>: <error description>", and mark all test cases "status": "Compilation Error", "passed": false.

3. UNEDITED BOILERPLATE:
   - If the code is just the default template or contains no actual logic:
     set "success": false, "stderr": "No solution code provided in editor.", and set every test case "passed": false, "status": "Failed", "actualOutput": "(No output produced — empty solution)".

4. EXECUTION ON TEST CASES (When No Syntax Errors):
   - Simulate running the code on each testcase input provided via standard input.
   - Compare actual stdout against expectedOutput.
   - If output matches expectedOutput exactly (whitespace-trimmed): set "passed": true, "status": "Passed".
   - If output differs or nothing is printed: set "passed": false, "status": "Failed".
   - If a runtime error occurs: set "passed": false, "status": "Runtime Error", "actualOutput": "Runtime Error: <type>".

Return valid JSON in this EXACT structure:
{
  "success": false,
  "isCompilationError": false,
  "errorLine": null,
  "errorMessage": "",
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
      "status": "Failed",
      "executionTimeMs": 15
    }
  ]
}

Return ONLY raw valid JSON.`;

  try {
    const raw = await aiService.generateContent({
      prompt,
      feature: "quiz-grading",
      temperature: 0.0,
      userId,
    });
    const parsed = parseJsonSafely(raw?.data || raw);
    if (parsed && Array.isArray(parsed.testCaseResults)) {
      const isCompErr = !!parsed.isCompilationError;
      const extracted = isCompErr ? extractErrorDetails(parsed.stderr || parsed.errorMessage || "", language) : { errorLine: null, errorMessage: "" };
      const errLine = parsed.errorLine || extracted.errorLine;
      const errMsg = parsed.errorMessage || extracted.errorMessage || (isCompErr ? "Compilation / Syntax Error" : "");

      const passedCount = isCompErr ? 0 : parsed.testCaseResults.filter((t) => t.passed).length;
      const totalCount = parsed.testCaseResults.length;
      return {
        success: !isCompErr && (parsed.success ?? (passedCount === totalCount && totalCount > 0)),
        isCompilationError: isCompErr,
        compilationError: isCompErr,
        errorLine: errLine,
        errorMessage: errMsg,
        stdout: parsed.stdout || "",
        stderr: parsed.stderr || errMsg || "",
        passedCount,
        totalCount,
        testCaseResults: parsed.testCaseResults.map((tc, idx) => ({
          testCaseId: tc.testCaseId || String(idx + 1),
          input: tc.input || (testCases[idx] ? testCases[idx].input : ""),
          expectedOutput: tc.expectedOutput || (testCases[idx] ? testCases[idx].expectedOutput : ""),
          actualOutput: isCompErr ? `Compilation Error: ${errMsg}` : (tc.actualOutput || (tc.passed ? tc.expectedOutput : "(No output)")),
          passed: isCompErr ? false : !!tc.passed,
          status: isCompErr ? "Compilation Error" : (tc.status || (tc.passed ? "Passed" : "Failed")),
          executionTimeMs: tc.executionTimeMs || 12,
          isHidden: Boolean(testCases[idx]?.isHidden),
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
      isHidden: Boolean(tc.isHidden),
    })),
  };
}

function isCodeEmptyOrBoilerplateOnly(code = "", language = "") {
  if (!code || typeof code !== "string" || !code.trim()) return true;

  // Strip block comments (/* ... */)
  let s = code.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip Python docstrings
  s = s.replace(/""".*?"""/gs, "").replace(/'''.*?'''/gs, "");
  // Strip single line comments (// ..., # ..., -- ...)
  s = s.replace(/(\/\/|#|--).*$/gm, "");

  // If there's literally no non-comment code left
  if (!s.trim()) return true;

  // Check if what's left is strictly trivial starter placeholders only
  const stripped = s.trim().replace(/\s+/g, " ").toLowerCase();
  const trivialPatterns = [
    "pass",
    "pass;",
    "return 0;",
    "return 0",
    "return;",
    "return null;",
    "return null",
    "return false;",
    "return true;",
    "return {};",
    "return [];",
    "write your code here",
    // CodeTantra empty boilerplate templates
    "import java.util.scanner; public class main { public static void main(string[] args) { scanner sc = new scanner(system.in); } }",
    "#include <iostream> using namespace std; int main() { return 0; }",
    "#include <stdio.h> int main() { return 0; }",
    "import sys def main(): pass if __name__ == '__main__': main()",
    "const fs = require('fs'); function main() { const input = fs.readfilesync(0, 'utf-8').trim(); } main();",
  ];
  if (trivialPatterns.includes(stripped)) return true;

  return false;
}

/**
 * Adapt LeetCode style test inputs (e.g. `nums = [1, 1, 2]` or `nums = [3, 2, 2, 3], val = 3`)
 * into standard competitive programming stdin formats (space-separated, line-by-line).
 */
function adaptLeetCodeInput(raw, includeCount = false) {
  if (!raw) return null;
  let str = String(raw).trim();
  // Strip leading "Input:" or "Input :" prefixes
  str = str.replace(/^(?:Input\s*:\s*)+/i, "").trim();

  const varRegex = /(?:^|,|\n)\s*([a-zA-Z_]\w*)\s*=\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|[^,\n]+)/g;
  const matches = [...str.matchAll(varRegex)];

  if (matches.length > 0) {
    const parts = [];
    for (const m of matches) {
      let val = m[2].trim();
      if (val.startsWith("[") && val.endsWith("]")) {
        const inner = val.slice(1, -1).trim();
        const items = inner.length > 0
          ? inner.split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
          : [];
        if (includeCount) {
          parts.push(String(items.length));
        }
        parts.push(items.join(" "));
      } else {
        parts.push(val.replace(/^['"]|['"]$/g, ""));
      }
    }
    return parts.join("\n");
  }

  // Standalone array: [1, 1, 2]
  if (str.startsWith("[") && str.endsWith("]")) {
    const inner = str.slice(1, -1).trim();
    const items = inner.length > 0
      ? inner.split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
      : [];
    if (includeCount) {
      return `${items.length}\n${items.join(" ")}`;
    }
    return items.join(" ");
  }

  return null;
}

/**
 * Clean LeetCode style expected outputs (e.g. `2, nums = [1,2,_]` or `5, nums = [0,1,2,3,4,_,_,_,_,_]`)
 * into the true expected return value (`2` or `5`).
 */
function cleanExpectedOutput(raw) {
  if (!raw) return "";
  let str = String(raw).trim();
  str = str.replace(/^(?:Output\s*:\s*)+/i, "").trim();
  str = str.replace(/,\s*[a-zA-Z_]\w*\s*=\s*\[[^\]]*\]/gi, "").trim();
  str = str.replace(/,\s*[a-zA-Z_]\w*\s*=\s*[^,\n\r]+/gi, "").trim();
  str = str.replace(/,\s*(?:where|with|hence|and)\b.*$/gi, "").trim();
  return str;
}

/**
 * Main Code Execution & Test Case Verification Handler with High-Concurrency Throttling and Result Caching
 */
async function executeCode({ code, language = "python", testCases = [], questionText = "", userId = null }) {
  const lang = String(language).toLowerCase().trim();
  const rawCode = String(code || "").trim();

  // Validate presence of real solution code (ignoring starter boilerplate & comments)
  if (isCodeEmptyOrBoilerplateOnly(rawCode, lang)) {
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
        actualOutput: "(No output — no code written)",
        passed: false,
        status: "Failed",
        executionTimeMs: 0,
      })),
    };
  }

  const cleanCode = rawCode.replace(/^(#|\/\/|--)\s*write your code here\s*$/gmi, "").trim();

  const defaultTestCases = (testCases && testCases.length > 0)
    ? testCases
    : [{ input: "", expectedOutput: "", description: "Default Case" }];

  // 1. In-Memory Cache Lookup (Sub-millisecond latency for repeated runs)
  const cacheKey = computeCacheKey(cleanCode, lang, defaultTestCases);
  const cachedResponse = getCachedResult(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 2. Static Security Check
  const securityCheck = checkCodeSecurity(cleanCode, lang);
  if (!securityCheck.safe) {
    console.warn(`[CompilerService] Security scan flagged code: ${securityCheck.reason}. Routing to safe AI sandbox evaluator.`);
    const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText, userId);
    const finalResult = {
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
    setCachedResult(cacheKey, finalResult);
    return finalResult;
  }

  // 3. Acquire Concurrency Slot (Ensures 40 students do not overwhelm host CPU)
  await acquireExecutionSlot();

  try {
    let hasNativeRunner = false;
    let runner = null;

    if (lang.includes("python") || lang === "py") {
      hasNativeRunner = true;
      runner = runPython;
    } else if (lang.includes("javascript") || lang.includes("node") || lang === "js" || lang.includes("typescript")) {
      hasNativeRunner = true;
      runner = runJavaScript;
    } else if (lang.includes("java")) {
      const javacOk = await isJavacAvailable();
      if (javacOk) {
        hasNativeRunner = true;
        runner = runJava;
      } else {
        hasNativeRunner = false;
        runner = null;
      }
    } else if (lang.includes("cpp") || lang.includes("c++") || lang === "c") {
      const gppOk = await isGppAvailable();
      if (gppOk) {
        hasNativeRunner = true;
        runner = runCpp;
      } else {
        hasNativeRunner = false;
        runner = null;
      }
    }

    if (!hasNativeRunner || !runner) {
      console.info(`[CompilerService] Direct AI sandbox delegation for ${lang} (compiler absent or method solution).`);
      const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText, userId);
      const finalResult = {
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
      setCachedResult(cacheKey, finalResult);
      return finalResult;
    }

    if (hasNativeRunner && runner) {
      const results = [];
      let overallStdout = "";
      let overallStderr = "";
      let hasCompilationError = false;
      let hostCompilerMissing = false;

      for (let i = 0; i < defaultTestCases.length; i++) {
        const tc = defaultTestCases[i];
        const normalizedInput = String(tc.input || "")
          .replace(/\r\n/g, "\n")
          .replace(/\\r\\n/g, "\n")
          .replace(/\\n/g, "\n");
        // Proactively adapt LeetCode parameter inputs (e.g. nums = [1, 1, 2] or Input: nums = [1, 1, 2])
        // into clean stdin format (e.g. 1 1 2) so standard console code (input().split()) executes cleanly.
        const proactiveAdapted = adaptLeetCodeInput(normalizedInput, false);
        const inputToRun = (proactiveAdapted && proactiveAdapted !== normalizedInput) ? proactiveAdapted : normalizedInput;

        let res = await runner(cleanCode, inputToRun);

        // If execution failed with an input-parsing runtime error (e.g. ValueError, EOFError),
        // try adapting with element count first (e.g. 3\n1 1 2) for questions reading array size N first,
        // or try the raw input if proactive adaptation was used.
        if (
          res.exitCode !== 0 &&
          res.stderr &&
          (res.stderr.includes("invalid literal") ||
            res.stderr.includes("ValueError") ||
            res.stderr.includes("TypeError") ||
            res.stderr.includes("EOFError"))
        ) {
          const adaptedWithCount = adaptLeetCodeInput(normalizedInput, true);
          if (adaptedWithCount && adaptedWithCount !== inputToRun) {
            const retryRes = await runner(cleanCode, adaptedWithCount);
            if (retryRes.exitCode === 0) {
              res = retryRes;
            }
          }
          if (res.exitCode !== 0 && inputToRun !== normalizedInput) {
            const rawRetry = await runner(cleanCode, normalizedInput);
            if (rawRetry.exitCode === 0) {
              res = rawRetry;
            }
          }
        }

        if (res.stderr) {
          overallStderr = res.stderr;
        }
        if (res.stdout) {
          overallStdout = res.stdout;
        }

        // If host compiler binary is missing on server, immediately break and delegate to AI sandbox runner
        if (res.hostCompilerMissing || isHostCompilerMissing(res.stderr)) {
          hostCompilerMissing = true;
          break;
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
              isHidden: Boolean(remTc.isHidden),
            });
          }
          break;
        }

        const expectedTrimmed = String(tc.expectedOutput || "").trim().replace(/\r\n/g, "\n");
        const cleanExp = cleanExpectedOutput(expectedTrimmed);
        const actualTrimmed = String(res.stdout || "").trim().replace(/\r\n/g, "\n");

        const normalizeForComparison = (str = "") =>
          String(str)
            .trim()
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map((l) => l.trimEnd())
            .join("\n")
            .replace(/\[\s+/g, "[")
            .replace(/\s+\]/g, "]")
            .replace(/,\s+/g, ",");

        let passed = false;
        let status = "Failed";
        let actualOutput = res.stdout || (res.stderr ? `Error: ${res.stderr}` : "");

        if (res.exitCode !== 0) {
          passed = false;
          status = "Runtime Error";
          actualOutput = res.stderr ? `Runtime Error: ${res.stderr}` : "Runtime Error (exit code " + res.exitCode + ")";
        } else if (expectedTrimmed === "(Custom)" || expectedTrimmed.length === 0) {
          passed = res.exitCode === 0;
          status = passed ? "Passed" : "Failed";
        } else if (expectedTrimmed.length > 0) {
          passed =
            actualTrimmed === expectedTrimmed ||
            normalizeForComparison(actualTrimmed) === normalizeForComparison(expectedTrimmed) ||
            (cleanExp && (
              actualTrimmed === cleanExp ||
              normalizeForComparison(actualTrimmed) === normalizeForComparison(cleanExp)
            ));
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
          isHidden: Boolean(tc.isHidden),
        });
      }

      // If host compiler was missing, delegate to AI sandbox
      if (hostCompilerMissing) {
        console.info(`[CompilerService] Host binary for ${lang} not available. Delegating to AI execution sandbox.`);
        const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText, userId);
        const finalResult = {
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
        setCachedResult(cacheKey, finalResult);
        return finalResult;
      }

      const passedCount = results.filter((r) => r.passed).length;
      const totalCount = results.length;

      // If native execution produced 0 passes but code contains valid function definitions (e.g. def / function / class),
      // fallback to the intelligent AI sandbox runner to evaluate function return values against test cases.
      const hasFunctionSyntax = /(def\s+[a-zA-Z0-9_]+|function\s+[a-zA-Z0-9_]+|class\s+[a-zA-Z0-9_]+|const\s+[a-zA-Z0-9_]+\s*=\s*\([^)]*\)\s*=>)/.test(cleanCode);
      if (passedCount === 0 && !hasCompilationError && hasFunctionSyntax) {
        console.info("[CompilerService] Native runner produced 0 stdout for function-based code. Evaluating with AI sandbox engine.");
        const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText, userId);
        if (aiResult && Array.isArray(aiResult.testCaseResults) && aiResult.testCaseResults.length > 0) {
          const finalResult = {
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
          setCachedResult(cacheKey, finalResult);
          return finalResult;
        }
      }

      const errDetails = hasCompilationError ? extractErrorDetails(overallStderr, lang) : { errorLine: null, errorMessage: "" };
      const finalResult = {
        success: !hasCompilationError && totalCount > 0 && passedCount === totalCount,
        isCompilationError: hasCompilationError,
        compilationError: hasCompilationError,
        isRuntimeError: !hasCompilationError && results.some((r) => r.status === "Runtime Error"),
        errorLine: errDetails.errorLine,
        errorMessage: errDetails.errorMessage,
        language: lang,
        stdout: overallStdout,
        stderr: overallStderr,
        passedCount,
        totalCount,
        testCaseResults: results,
      };
      setCachedResult(cacheKey, finalResult);
      return finalResult;
    }

    // Fallback to AI-powered execution evaluator for any other language
    const aiResult = await runWithAiEvaluator(cleanCode, lang, defaultTestCases, questionText, userId);
    const finalResult = {
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
    setCachedResult(cacheKey, finalResult);
    return finalResult;
  } finally {
    releaseExecutionSlot();
  }
}

module.exports = {
  executeCode,
  checkCodeSecurity,
  adaptLeetCodeInput,
  cleanExpectedOutput,
};

