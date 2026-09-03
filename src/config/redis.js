const Redis = require("ioredis");
const env = require("./env");

let redis = null;

/**
 * Connect to Redis for caching and token blacklist
 * Gracefully degrades if Redis is unavailable
 */
function connectRedis() {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      lazyConnect: true, // Don't connect immediately
      retryStrategy() {
        // Don't retry - fall back to in-memory immediately
        return null;
      },
    });

    // Try to connect silently
    redis.connect().catch(() => {
      // Silently fail and use in-memory fallback
      redis = null;
    });

    redis.on("connect", () => {
      console.log("[Redis] ✓ Connected - using Redis for caching");
    });

    redis.on("error", (err) => {
      // Silently handle Redis errors - services will fall back to in-memory
      // Only log critical errors in production
      if (process.env.NODE_ENV === "production") {
        console.error("[Redis] Connection error:", err.message);
      }
    });

    redis.on("close", () => {
      // Silently handle Redis disconnection - services will fall back to in-memory
    });
  } catch (err) {
    console.error("[Redis] Failed to initialize:", err.message);
    redis = null;
  }

  return redis;
}

/**
 * Get the Redis client instance
 * @returns {Redis|null}
 */
function getRedis() {
  return redis;
}

/**
 * Check if Redis is available and connected
 * @returns {boolean}
 */
function isRedisAvailable() {
  return redis && redis.status === "ready";
}

module.exports = {
  connectRedis,
  getRedis,
  isRedisAvailable,
};
