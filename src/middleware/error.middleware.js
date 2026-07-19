const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
};

const errorHandler = (err, _req, res, _next) => {
  // ApiError instances
  if (err instanceof ApiError) {
    const response = {
      success: false,
      message: err.message,
    };
    if (err.errors && err.errors.length > 0) {
      response.errors = err.errors;
    }
    if (env.NODE_ENV === "development" && err.stack) {
      response.stack = err.stack;
    }
    return res.status(err.statusCode).json(response);
  }

  // Mongoose ValidationError
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    const response = {
      success: false,
      message: "Validation failed",
      errors,
    };
    if (env.NODE_ENV === "development" && err.stack) {
      response.stack = err.stack;
    }
    return res.status(400).json(response);
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    const response = {
      success: false,
      message: "Invalid ID",
    };
    if (env.NODE_ENV === "development" && err.stack) {
      response.stack = err.stack;
    }
    return res.status(400).json(response);
  }

  // Mongoose duplicate key error (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    const response = {
      success: false,
      message: `${field} already exists`,
    };
    if (env.NODE_ENV === "development" && err.stack) {
      response.stack = err.stack;
    }
    return res.status(409).json(response);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    const response = {
      success: false,
      message: "Invalid or expired token",
    };
    if (env.NODE_ENV === "development" && err.stack) {
      response.stack = err.stack;
    }
    return res.status(401).json(response);
  }

  // Mongoose connection / server selection errors → 503
  if (
    err.name === "MongooseServerSelectionError" ||
    err.name === "MongooseTimeoutError" ||
    (err.message && err.message.includes("buffering timed out"))
  ) {
    const response = {
      success: false,
      message: "Service temporarily unavailable, please try again shortly",
    };
    if (env.NODE_ENV === "development" && err.stack) {
      response.stack = err.stack;
    }
    return res.status(503).json(response);
  }

  // Unknown errors
  console.error("[error] Unhandled error:", err);
  const response = {
    success: false,
    message:
      env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
  };
  if (env.NODE_ENV === "development" && err.stack) {
    response.stack = err.stack;
  }
  return res.status(500).json(response);
};

module.exports = { errorHandler, notFoundHandler };
