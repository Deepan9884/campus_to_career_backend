const jwt = require("jsonwebtoken");

const User = require("../models/User.model");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");

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

    const user = await User.findById(userId).select("-password -refreshToken").lean();
    if (!user) {
      throw ApiError.unauthorized("User no longer exists");
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = verifyJWT;
