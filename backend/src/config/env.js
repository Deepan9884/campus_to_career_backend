const dotenv = require("dotenv");
const path = require("path");
const crypto = require("crypto");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const getVar = (key, required = false) => {
  const value = process.env[key];
  if (required && (!value || value.trim() === "")) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return (value || "").trim();
};

// Validate JWT secret strength
const JWT_SECRET = getVar("JWT_SECRET", true);
const JWT_REFRESH_SECRET = getVar("JWT_REFRESH_SECRET", true);

if (JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long for security");
}

if (JWT_REFRESH_SECRET.length < 32) {
  throw new Error("JWT_REFRESH_SECRET must be at least 32 characters long for security");
}

// Warn if secrets don't have good complexity
const hasComplexity = (secret) => {
  return /[A-Z]/.test(secret) && /[a-z]/.test(secret) && /[0-9]/.test(secret);
};

if (!hasComplexity(JWT_SECRET)) {
  console.warn("⚠️  JWT_SECRET should contain uppercase, lowercase, and numbers for better security");
}

if (!hasComplexity(JWT_REFRESH_SECRET)) {
  console.warn("⚠️  JWT_REFRESH_SECRET should contain uppercase, lowercase, and numbers for better security");
}

// Validate encryption key for PII encryption
let ENCRYPTION_KEY = getVar("ENCRYPTION_KEY", false);
if (!ENCRYPTION_KEY) {
  // Deterministically derive a secure 32-byte (64 hex) key from JWT_SECRET or fallback seed
  const seed = JWT_SECRET || "c2c_default_secure_encryption_seed_2026";
  ENCRYPTION_KEY = crypto.createHash("sha256").update(seed).digest("hex");
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  console.warn("⚠️  ENCRYPTION_KEY not set in environment. Auto-derived 32-byte key from JWT_SECRET to ensure continuous uptime.");
}
if (ENCRYPTION_KEY.length < 32) {
  ENCRYPTION_KEY = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest("hex");
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
}

const env = {
  NODE_ENV: getVar("NODE_ENV") || "development",
  PORT: parseInt(getVar("PORT") || "5000", 10),
  MONGODB_URI: getVar("MONGODB_URI", true),
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN: getVar("JWT_EXPIRES_IN") || "2h",
  JWT_REFRESH_EXPIRES_IN: getVar("JWT_REFRESH_EXPIRES_IN") || "7d",
  CLIENT_URL: getVar("CLIENT_URL") || "http://localhost:5173",
  ADMIN_CLIENT_URL: getVar("ADMIN_CLIENT_URL") || "http://localhost:8081",
  GOOGLE_CLIENT_ID: getVar("GOOGLE_CLIENT_ID"),
  GEMINI_API_KEY: getVar("GEMINI_API_KEY", false) || getVar("GEMINI_API_KEYS", false),
  GEMINI_API_KEYS: (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),
  GEMINI_MODEL_DEFAULT: getVar("GEMINI_MODEL_DEFAULT") || "gemini-flash-lite-latest",
  GEMINI_MODEL_FALLBACK: getVar("GEMINI_MODEL_FALLBACK") || "gemini-flash-lite-latest",
  GEMINI_FALLBACK_MODELS: (process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-lite-latest,gemini-2.5-flash,gemini-2.5-pro")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  GEMINI_MAX_RPM: parseInt(getVar("GEMINI_MAX_RPM") || "60", 10),
  GEMINI_MAX_RPD: parseInt(getVar("GEMINI_MAX_RPD") || "5000", 10),
  NVIDIA_API_KEY: getVar("NVIDIA_API_KEY") || "",
  NVIDIA_MODEL: getVar("NVIDIA_MODEL") || "nvidia/nemotron-3.5-lightning-30b-a3b",
  NVIDIA_API_URL: getVar("NVIDIA_API_URL") || "https://integrate.api.nvidia.com/v1",
  GITHUB_TOKEN: getVar("GITHUB_TOKEN"),
  RESET_TOKEN_SECRET: getVar("RESET_TOKEN_SECRET", true),
  SMTP_HOST: getVar("SMTP_HOST") || "smtp.gmail.com",
  SMTP_PORT: getVar("SMTP_PORT") || "587",
  SMTP_USER: getVar("SMTP_USER") || "campustocareer25@gmail.com",
  SMTP_PASS: getVar("SMTP_PASS") || "zjyeqegzjembcjty",
  SMTP_FROM: getVar("SMTP_FROM") || '"Campus to Career AI" <campustocareer25@gmail.com>',
  RESEND_API_KEY: getVar("RESEND_API_KEY") || "",
  BREVO_API_KEY: getVar("BREVO_API_KEY") || "",
};

module.exports = env;
