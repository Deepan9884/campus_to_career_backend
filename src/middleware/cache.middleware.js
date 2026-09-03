const cache = require("../services/cache.service");
const crypto = require("crypto");

/**
 * Generate cache key from request
 * @param {Request} req
 * @param {Object} options
 * @returns {string}
 */
function generateCacheKey(req, options = {}) {
  const { prefix = "api", includeQuery = true, includeBody = false, includeUser = true } = options;

  const parts = [prefix, req.method, req.path];

  if (includeUser && req.user?._id) {
    parts.push(`user:${req.user._id}`);
  }

  if (includeQuery && Object.keys(req.query).length > 0) {
    const queryHash = crypto.createHash("md5").update(JSON.stringify(req.query)).digest("hex");
    parts.push(`q:${queryHash}`);
  }

  if (includeBody && Object.keys(req.body).length > 0) {
    const bodyHash = crypto.createHash("md5").update(JSON.stringify(req.body)).digest("hex");
    parts.push(`b:${bodyHash}`);
  }

  return cache.generateKey(...parts);
}

/**
 * Cache middleware for GET requests
 * @param {Object} options - Caching options
 * @returns {Function} Express middleware
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    prefix = "api",
    includeQuery = true,
    includeBody = false,
    includeUser = true,
    condition = null, // Function to determine if caching should be applied
  } = options;

  return async (req, res, next) => {
    // Only cache GET requests by default
    if (req.method !== "GET") {
      return next();
    }

    // Check condition if provided
    if (condition && !condition(req)) {
      return next();
    }

    const cacheKey = generateCacheKey(req, { prefix, includeQuery, includeBody, includeUser });

    try {
      // Try to get from cache
      const cached = await cache.get(cacheKey);

      if (cached) {
        // Set cache hit header
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Key", cacheKey);
        
        return res.status(cached.status || 200).json(cached.data);
      }

      // Cache miss - intercept response
      res.setHeader("X-Cache", "MISS");

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(
            cacheKey,
            {
              status: res.statusCode,
              data,
            },
            ttl
          ).catch((err) => {
            console.error("[Cache Middleware] Failed to cache response:", err.message);
          });
        }

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.error("[Cache Middleware] Error:", err.message);
      next();
    }
  };
}

/**
 * Cache invalidation middleware
 * Clears cache for specific patterns after mutations (POST, PUT, PATCH, DELETE)
 * @param {Object} options - Invalidation options
 * @returns {Function} Express middleware
 */
function invalidateCache(options = {}) {
  const { patterns = [], keys = [] } = options;

  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Override response methods to invalidate cache after successful mutation
    const invalidateAfterResponse = function (data) {
      // Only invalidate on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Invalidate specific keys
        if (keys.length > 0) {
          keys.forEach((key) => {
            cache.del(key).catch((err) => {
              console.error(`[Cache Invalidation] Failed to delete key ${key}:`, err.message);
            });
          });
        }

        // Invalidate patterns
        if (patterns.length > 0) {
          patterns.forEach((pattern) => {
            cache.delPattern(pattern).catch((err) => {
              console.error(`[Cache Invalidation] Failed to delete pattern ${pattern}:`, err.message);
            });
          });
        }
      }

      return data;
    };

    res.json = function (data) {
      invalidateAfterResponse(data);
      return originalJson(data);
    };

    res.send = function (data) {
      invalidateAfterResponse(data);
      return originalSend(data);
    };

    next();
  };
}

/**
 * Conditional cache middleware - only cache if condition is met
 * @param {Function} condition - Function that returns boolean
 * @param {Object} cacheOptions - Options for cacheMiddleware
 * @returns {Function} Express middleware
 */
function conditionalCache(condition, cacheOptions = {}) {
  return cacheMiddleware({
    ...cacheOptions,
    condition,
  });
}

/**
 * Cache warming utility - pre-populate cache
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data
 * @param {number} ttl - TTL in seconds
 * @returns {Promise<void>}
 */
async function warmCache(key, fetchFn, ttl = 300) {
  try {
    const data = await fetchFn();
    await cache.set(key, data, ttl);
    console.log(`[Cache] Warmed cache for key: ${key}`);
  } catch (err) {
    console.error(`[Cache] Failed to warm cache for key ${key}:`, err.message);
  }
}

module.exports = {
  cacheMiddleware,
  invalidateCache,
  conditionalCache,
  warmCache,
  generateCacheKey,
};
