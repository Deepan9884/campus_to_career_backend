const EXCLUDED_DIRS = [
  "node_modules",
  "dist",
  "build",
  "vendor",
  ".git",
  "__tests__",
];

const EXCLUDED_EXTENSIONS = [
  ".lock",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
];

const MANIFEST_FILES = [
  "package.json",
  "requirements.txt",
  "pom.xml",
  "Cargo.toml",
  "go.mod",
  "composer.json",
];

function isExcludedPath(filePath) {
  const parts = filePath.split("/");
  if (parts.some((p) => EXCLUDED_DIRS.includes(p))) return true;
  if (parts.some((p) => /test|spec|__tests__/i.test(p))) return true;
  return false;
}

function isExcludedExtension(filePath) {
  const lower = filePath.toLowerCase();
  return EXCLUDED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isTestFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.includes("test") || lower.includes("spec") || lower.includes("__tests__");
}

function isLockFile(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".lock") ||
    lower.includes("package-lock") ||
    lower.includes("yarn.lock") ||
    lower.includes("pnpm-lock") ||
    lower.includes("go.sum") ||
    lower.includes("poetry.lock")
  );
}

function selectFiles(tree, maxTotal = 5) {
  const readmeEntry = tree.find((f) => /^readme/i.test(f.path) && f.type === "blob");

  const manifests = [];
  for (const name of MANIFEST_FILES) {
    if (manifests.length >= 2) break;
    const entry = tree.find((f) => f.path === name && f.type === "blob");
    if (entry) manifests.push(entry);
  }

  const candidates = tree
    .filter((f) => f.type === "blob")
    .filter((f) => !isExcludedPath(f.path))
    .filter((f) => !isExcludedExtension(f.path))
    .filter((f) => !isTestFile(f.path))
    .filter((f) => !isLockFile(f.path))
    .filter((f) => !manifests.includes(f))
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  const selected = [];
  for (const c of candidates) {
    if (selected.length >= maxTotal) break;
    selected.push(c);
  }

  const result = [];
  if (readmeEntry) result.push(readmeEntry.path);
  for (const m of manifests) {
    if (!result.includes(m.path)) result.push(m.path);
  }
  for (const s of selected) {
    if (result.length >= maxTotal + 1) break;
    if (!result.includes(s.path)) result.push(s.path);
  }

  return result;
}

module.exports = { selectFiles };
