// Express application bootstrap. Every cross-cutting concern belongs here:
// security headers, CORS, body parsing, rate limiting, request logging,
// and the error-handling boundary at the end of the middleware chain.
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const routes = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");
const { mongoSanitize } = require("./middleware/sanitize.middleware");
const { getDbStatus } = require("./config/db");

const app = express();

// --- Disable Express signature to prevent fingerprinting
app.disable("x-powered-by");

// --- Security headers, HSTS, Frameguard & CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: [
          "'self'",
          "https://api.github.com",
          "https://generativelanguage.googleapis.com",
          "https://accounts.google.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
      },
    },
    hsts:
      env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xContentTypeOptions: true,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    crossOriginEmbedderPolicy: false,
  }),
);

// --- CORS
const getAllowedOrigins = () => {
  const allowed = new Set([
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:3000",
  ]);

  if (env.CLIENT_URL) {
    env.CLIENT_URL.split(",").forEach((url) => {
      const trimmed = url.trim().replace(/\/$/, "");
      if (trimmed) allowed.add(trimmed);
    });
  }

  if (env.ADMIN_CLIENT_URL) {
    env.ADMIN_CLIENT_URL.split(",").forEach((url) => {
      const trimmed = url.trim().replace(/\/$/, "");
      if (trimmed) allowed.add(trimmed);
    });
  }

  return Array.from(allowed);
};

const allowedOriginsList = getAllowedOrigins();

const vercelDomainRegex = /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (
        allowedOriginsList.includes(normalizedOrigin) ||
        vercelDomainRegex.test(normalizedOrigin) ||
        env.NODE_ENV !== "production"
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy does not allow access from origin ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// --- Trust proxy for rate limiting (1 hop for production safety, true for test compatibility)
app.set("trust proxy", env.NODE_ENV === "test" ? true : 1);

// --- Request logging (skip in test)
if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

// --- Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- NoSQL Injection & Prototype Pollution Sanitization
app.use(mongoSanitize);

// --- Global rate limit (generous limits for classroom/campus concurrency)
if (env.NODE_ENV !== "test") {
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.NODE_ENV === "production" ? 25000 : 50000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, please try again later" },
      skip: (req) => req.path === "/api/health",
    }),
  );
}

// --- Health check (before API routes, no auth, no sensitive error leakage)
app.get(["/api/health", "/health"], (_req, res) => {
  const db = getDbStatus();
  if (db.state === "connected") {
    return res.status(200).json({
      success: true,
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  }
  return res.status(503).json({
    success: false,
    status: "degraded",
    db: db.state,
    timestamp: new Date().toISOString(),
  });
});

// --- API routes (mounted at /api and root fallback for cross-client resilience)
app.use("/api", routes);
app.use("/", routes);

// --- 404 & error boundary (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
