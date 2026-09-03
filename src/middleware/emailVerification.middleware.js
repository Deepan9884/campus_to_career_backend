const ApiError = require("../utils/ApiError");

/**
 * Middleware to ensure user's email is verified before accessing certain routes
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 */
function requireEmailVerification(req, res, next) {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required");
  }

  if (!req.user.isEmailVerified) {
    throw ApiError.forbidden(
      "Email verification required. Please check your email for the verification link."
    );
  }

  next();
}

/**
 * Middleware to warn if email is not verified (doesn't block access)
 * Adds a header to the response
 */
function warnIfEmailNotVerified(req, res, next) {
  if (req.user && !req.user.isEmailVerified) {
    res.setHeader("X-Email-Verification-Status", "unverified");
    res.setHeader("X-Email-Verification-Warning", "Please verify your email to unlock all features");
  }
  next();
}

module.exports = {
  requireEmailVerification,
  warnIfEmailNotVerified,
};
