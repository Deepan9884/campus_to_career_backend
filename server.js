const connectDB = require("./src/config/db");
const env = require("./src/config/env");
const app = require("./src/app");

// Initialize workers
require("./src/workers/resume.worker");
require("./src/workers/github.worker");

process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[fatal] Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const start = async () => {
  // Fire the DB connection — don't block startup on it.
  // connectDB logs its own errors and retries via mongoose reconnection logic.
  connectDB().catch(() => {});

  const server = app.listen(env.PORT, () => {
    console.log(`[server] CareerForge AI API running — http://localhost:${env.PORT}`);
    console.log(`[server] Environment — ${env.NODE_ENV}`);
    console.log(`[server] Client origin — ${env.CLIENT_URL}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("[server] HTTP server closed");
      const mongoose = require("mongoose");
      mongoose.connection.close(false).then(() => {
        console.log("[server] MongoDB connection closed");
        process.exit(0);
      });
    });

    setTimeout(() => {
      console.error("[server] Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
