const ActivityLog = require("../models/ActivityLog.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const VALID_MODULES = ["resume", "interview", "github", "skill_gap", "roadmap", "quiz"];

/**
 * GET /api/activity?page=&limit=&module=
 * Paginated list, newest first, ownership-scoped.
 */
const listActivity = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = { user: req.user._id };
  if (req.query.module) {
    if (!VALID_MODULES.includes(req.query.module)) {
      throw ApiError.badRequest(`Invalid module. Must be one of: ${VALID_MODULES.join(", ")}`);
    }
    filter.module = req.query.module;
  }

  const [activities, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  return ApiResponse.success({
    activities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }).send(res);
});

module.exports = { listActivity };