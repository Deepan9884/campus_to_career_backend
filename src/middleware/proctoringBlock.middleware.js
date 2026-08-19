const ApiError = require("../utils/ApiError");

/**
 * Middleware that blocks Quiz and Interview access for users who
 * have been flagged by the proctoring system (isProctoringBlocked = true).
 *
 * Apply to protected quiz/interview mutation routes:
 *   POST /api/skill-gap/quiz/generate
 *   POST /api/skill-gap/quiz/submit
 *   POST /api/interview/start
 *   POST /api/interview/:id/rounds/:roundType/answer
 *   POST /api/interview/:id/rounds/:roundType/finish
 */
const checkProctoringBlock = (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized("Authentication required"));
  }

  if (req.user.isProctoringBlocked === true) {
    return next(
      ApiError.forbidden(
        "Your exam access has been blocked due to proctoring violations. Please contact your mentor to restore access."
      )
    );
  }

  return next();
};

module.exports = checkProctoringBlock;
