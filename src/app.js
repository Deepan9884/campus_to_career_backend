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

// --- Security headers & CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "https://api.github.com", "https://generativelanguage.googleapis.com", "https://accounts.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// --- CORS
const corsOrigins = env.NODE_ENV === "production"
  ? [env.CLIENT_URL]
  : [env.CLIENT_URL, "http://localhost:8080", "http://localhost:8081", "http://localhost:5173"];

app.use(
  cors({
    origin: corsOrigins,
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

// --- Global rate limit (skip in test)
if (env.NODE_ENV !== "test") {
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: env.NODE_ENV === "production" ? 100 : 500,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, please try again later" },
    }),
  );
}

// --- Health check (before API routes, no auth, no sensitive error leakage)
app.get("/api/health", (_req, res) => {
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

// --- API routes
app.use("/api", routes);

// --- 404 & error boundary (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
