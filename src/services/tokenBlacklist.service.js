const { getRedis, isRedisAvailable } = require("../config/redis");
const jwt = require("jsonwebtoken");

// In-memory fallback if Redis is unavailable (not recommended for production clusters)
const inMemoryBlacklist = new Set();

/**
 * Add a token to the blacklist
 * @param {string} token - JWT token to blacklist
 * @param {number} expirySeconds - How long to keep it blacklisted (should match token TTL)
 */
async function blacklistToken(token, expirySeconds = 3600) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      const key = `blacklist:${token}`;
      await redis.setex(key, expirySeconds, "1");
      console.log(`[TokenBlacklist] Token blacklisted (Redis) for ${expirySeconds}s`);
      return true;
    } catch (err) {
      console.error("[TokenBlacklist] Redis error:", err.message);
      // Fall through to in-memory fallback
    }
  }

  // Fallback to in-memory (single-server only)
  inMemoryBlacklist.add(token);
  console.warn("[TokenBlacklist] Token blacklisted (in-memory fallback)");

  // Auto-cleanup after expiry
  setTimeout(() => {
    inMemoryBlacklist.delete(token);
  }, expirySeconds * 1000);

  return true;
}

/**
 * Check if a token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {Promise<boolean>}
 */
async function isTokenBlacklisted(token) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      const key = `blacklist:${token}`;
      const result = await redis.exists(key);
      return result === 1;
    } catch (err) {
      console.error("[TokenBlacklist] Redis check error:", err.message);
      // Fall through to in-memory check
    }
  }

  // Fallback to in-memory
  return inMemoryBlacklist.has(token);
}

/**
 * Blacklist a user's refresh token (usually on logout)
 * @param {string} refreshToken
 * @param {number} expirySeconds
 */
async function blacklistRefreshToken(refreshToken, expirySeconds = 604800) {
  // 7 days default
  return blacklistToken(refreshToken, expirySeconds);
}

/**
 * Get time remaining until token expiry
 * @param {string} token
 * @param {string} secret
 * @returns {number} Seconds until expiry (0 if already expired or invalid)
 */
function getTokenTTL(token, secret) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return 0;

    const now = Math.floor(Date.now() / 1000);
    const remaining = decoded.exp - now;

    return remaining > 0 ? remaining : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Blacklist token with auto-calculated TTL
 * @param {string} token
 * @param {string} secret - JWT secret for decoding
 */
async function blacklistTokenWithTTL(token, secret) {
  const ttl = getTokenTTL(token, secret);
  if (ttl > 0) {
    return blacklistToken(token, ttl);
  }
  return false;
}

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
  blacklistRefreshToken,
  blacklistTokenWithTTL,
  getTokenTTL,
};
