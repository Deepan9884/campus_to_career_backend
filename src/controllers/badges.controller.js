const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const { evaluateUserBadges } = require("../services/badge.service");

/**
 * GET /api/badges
 * Returns authoritative unified trophies and earned badges for the current user.
 */
const listBadges = asyncHandler(async (req, res) => {
  const result = await evaluateUserBadges(req.user._id);

  return ApiResponse.success({
    badges: result.badges,
    achievements: result.achievements,
    summary: result.summary,
  }).send(res);
});

module.exports = { listBadges };
