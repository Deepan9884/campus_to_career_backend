const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const Badge = require("../models/Badge.model");

/**
 * GET /api/badges
 * Returns all earned badges for the current user.
 */
const listBadges = asyncHandler(async (req, res) => {
    const badges = await Badge.find({ userId: req.user._id })
        .sort({ earnedAt: -1 })
        .lean();

    return ApiResponse.success({ badges }).send(res);
});

module.exports = { listBadges };
