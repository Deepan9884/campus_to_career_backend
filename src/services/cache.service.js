const { getRedis, isRedisAvailable } = require("../config/redis");

// In-memory fallback cache (LRU with max 500 entries)
const MAX_MEMORY_CACHE_SIZE = 500;
const memoryCache = new Map();
const cacheAccessOrder = [];

/**
 * LRU eviction for in-memory cache
 */
function evictOldestFromMemory() {
  if (cacheAccessOrder.length > 0) {
    const oldestKey = cacheAccessOrder.shift();
    memoryCache.delete(oldestKey);
  }
}

/**
 * Update LRU access order
 */
function updateAccessOrder(key) {
  const index = cacheAccessOrder.indexOf(key);
  if (index > -1) {
    cacheAccessOrder.splice(index, 1);
  }
  cacheAccessOrder.push(key);
}

/**
 * Set a value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {Promise<boolean>}
 */
async function set(key, value, ttlSeconds = 300) {
  const redis = getRedis();
  const serialized = JSON.stringify(value);

  if (isRedisAvailable()) {
    try {
      await redis.setex(key, ttlSeconds, serialized);
      return true;
    } catch (err) {
      // Silently fall back to in-memory cache
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory cache
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    evictOldestFromMemory();
  }

  memoryCache.set(key, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  updateAccessOrder(key);

  return true;
}

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} - Parsed value or null if not found/expired
 */
async function get(key) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      const value = await redis.get(key);
      if (value) {
        return JSON.parse(value);
      }
    } catch (err) {
      console.error(`[Cache] Redis get error for key ${key}:`, err.message);
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory cache
  const cached = memoryCache.get(key);
  if (!cached) {
    return null;
  }

  // Check expiration
  if (Date.now() > cached.expiresAt) {
    memoryCache.delete(key);
    const index = cacheAccessOrder.indexOf(key);
    if (index > -1) cacheAccessOrder.splice(index, 1);
    return null;
  }

  updateAccessOrder(key);
  return JSON.parse(cached.value);
}

/**
 * Delete a specific key from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
async function del(key) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error(`[Cache] Redis del error for key ${key}:`, err.message);
    }
  }

  // Also delete from memory cache
  memoryCache.delete(key);
  const index = cacheAccessOrder.indexOf(key);
  if (index > -1) cacheAccessOrder.splice(index, 1);

  return true;
}

/**
 * Delete all keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., "user:*")
 * @returns {Promise<number>} - Number of keys deleted
 */
async function delPattern(pattern) {
  const redis = getRedis();
  let deletedCount = 0;

  if (isRedisAvailable()) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        deletedCount = await redis.del(...keys);
      }
    } catch (err) {
      console.error(`[Cache] Redis delPattern error for ${pattern}:`, err.message);
    }
  }

  // Also clear matching keys from memory cache
  const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      const index = cacheAccessOrder.indexOf(key);
      if (index > -1) cacheAccessOrder.splice(index, 1);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Check if a key exists in cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
async function exists(key) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (err) {
      console.error(`[Cache] Redis exists error for key ${key}:`, err.message);
    }
  }

  // Check memory cache
  const cached = memoryCache.get(key);
  if (!cached) return false;

  // Check if expired
  if (Date.now() > cached.expiresAt) {
    memoryCache.delete(key);
    return false;
  }

  return true;
}

/**
 * Increment a numeric value in cache (useful for rate limiting, counters)
 * @param {string} key - Cache key
 * @param {number} amount - Amount to increment (default: 1)
 * @returns {Promise<number>} - New value after increment
 */
async function incr(key, amount = 1) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      const result = await redis.incrby(key, amount);
      return result;
    } catch (err) {
      console.error(`[Cache] Redis incr error for key ${key}:`, err.message);
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory cache
  const cached = memoryCache.get(key);
  let currentValue = 0;

  if (cached && Date.now() <= cached.expiresAt) {
    try {
      currentValue = JSON.parse(cached.value);
    } catch {
      currentValue = 0;
    }
  }

  const newValue = currentValue + amount;
  memoryCache.set(key, {
    value: JSON.stringify(newValue),
    expiresAt: cached?.expiresAt || Date.now() + 300 * 1000, // Default 5 min
  });

  return newValue;
}

/**
 * Set cache value with expiration time (TTL)
 * @param {string} key - Cache key
 * @param {number} seconds - Seconds until expiration
 * @returns {Promise<boolean>}
 */
async function expire(key, seconds) {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      await redis.expire(key, seconds);
      return true;
    } catch (err) {
      console.error(`[Cache] Redis expire error for key ${key}:`, err.message);
    }
  }

  // Update expiration in memory cache
  const cached = memoryCache.get(key);
  if (cached) {
    cached.expiresAt = Date.now() + seconds * 1000;
    return true;
  }

  return false;
}

/**
 * Get or set pattern - fetch from cache or compute and cache
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch data if not cached
 * @param {number} ttlSeconds - TTL in seconds (default: 300)
 * @returns {Promise<any>}
 */
async function getOrSet(key, fetchFn, ttlSeconds = 300) {
  // Try to get from cache
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const freshData = await fetchFn();

  // Cache it
  await set(key, freshData, ttlSeconds);

  return freshData;
}

/**
 * Clear entire cache (use with caution)
 * @returns {Promise<boolean>}
 */
async function flush() {
  const redis = getRedis();

  if (isRedisAvailable()) {
    try {
      await redis.flushdb();
    } catch (err) {
      console.error("[Cache] Redis flush error:", err.message);
    }
  }

  // Clear memory cache
  memoryCache.clear();
  cacheAccessOrder.length = 0;

  return true;
}

/**
 * Generate cache key from components
 * @param {...string} parts - Key components
 * @returns {string}
 */
function generateKey(...parts) {
  return parts.filter(Boolean).join(":");
}

module.exports = {
  set,
  get,
  del,
  delPattern,
  exists,
  incr,
  expire,
  getOrSet,
  flush,
  generateKey,
};
