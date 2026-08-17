const ApiError = require("../utils/ApiError");

/**
 * Middleware factory to verify that the authenticated user has one of the allowed roles.
 * Supports allowing all users in development if role is not set, while permitting 'admin' or 'mentor'.
 * @param {string[]} allowedRoles
 */
const verifyRole = (allowedRoles = ["admin", "mentor"]) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    const userRole = req.user.role || "student";

    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return next(ApiError.forbidden("Access denied: Insufficient role permissions"));
  };
};

module.exports = verifyRole;
