const jwt = require("jsonwebtoken");

const User = require("../models/User.model");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const { isTokenBlacklisted } = require("../services/tokenBlacklist.service");

// ── Short-lived user cache (30s TTL, max 500 entries) ─────────────────────
// Reduces DB reads under high concurrency. Short TTL ensures role/block
// changes propagate quickly.
const USER_CACHE_TTL_MS = 30 * 1000;
const USER_CACHE_MAX = 500;
const _userCache = new Map();

function _getCachedUser(userId) {
  const entry = _userCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function _setCachedUser(userId, user) {
  if (_userCache.size >= USER_CACHE_MAX) {
    _userCache.delete(_userCache.keys().next().value);
  }
  _userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/** Call this whenever a user's role or isProctoringBlocked changes. */
function invalidateUserCache(userId) {
  if (!userId) return;
  _userCache.delete(userId.toString());
}

/**
 * Extracts the Bearer token from the Authorization header.
 * @param {import("express").Request} req
 * @returns {string|null}
 */
function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

/**
 * Express middleware:
 *   1. Reads the `` Authorization: Bearer <token>`` header.
 *   2. Verifies the JWT against env.JWT_SECRET.
 *   3. Loads the user (without password / refreshToken) from the DB.
 *   4. Attaches the user to req.user.
 *   5. Calls next().
 *
 * Throws ApiError.unauthorized() for missing, invalid or expired tokens.
 */
const verifyJWT = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw ApiError.unauthorized("Authentication token is required");
    }

    // Check if token is blacklisted (revoked)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      throw ApiError.unauthorized("Token has been revoked");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw ApiError.unauthorized("Token expired");
      }
      throw ApiError.unauthorized("Invalid token");
    }

    // decoded may contain _id (our custom claim) or sub (standard JWT claim).
    // We support both for backward compatibility.
    const userId = decoded._id || decoded.sub;
    if (!userId) {
      throw ApiError.unauthorized("Invalid token payload");
    }

    const userIdStr = userId.toString();
    let user = _getCachedUser(userIdStr);
    if (!user) {
      user = await User.findById(userId).select("-password -refreshToken").lean();
      if (!user) {
        throw ApiError.unauthorized("User no longer exists");
      }
      _setCachedUser(userIdStr, user);
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
};

verifyJWT.invalidateUserCache = invalidateUserCache;
module.exports = verifyJWT;
module.exports.invalidateUserCache = invalidateUserCache;
