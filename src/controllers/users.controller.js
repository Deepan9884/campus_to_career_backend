const User = require("../models/User.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const updateProfile = asyncHandler(async (req, res) => {
  const update = {};
  
  if (req.body.profile) {
    if (req.body.profile.targetRole !== undefined) {
      const val = (req.body.profile.targetRole || "").trim();
      update["targetRole"] = val;
      update["profile.targetRole"] = val;
    }
    if (req.body.profile.githubUsername !== undefined) {
      const val = (req.body.profile.githubUsername || "").trim();
      update["githubUsername"] = val;
      update["profile.githubUsername"] = val;
    }
    if (req.body.profile.bio !== undefined) {
      const val = (req.body.profile.bio || "").trim();
      update["bio"] = val;
      update["profile.bio"] = val;
    }
    if (req.body.profile.location !== undefined) {
      const val = (req.body.profile.location || "").trim();
      update["location"] = val;
      update["profile.location"] = val;
    }
  }

  if (req.body.githubUsername !== undefined) {
    const val = (req.body.githubUsername || "").trim();
    update["githubUsername"] = val;
    update["profile.githubUsername"] = val;
  }
  if (req.body.targetRole !== undefined) {
    const val = (req.body.targetRole || "").trim();
    update["targetRole"] = val;
    update["profile.targetRole"] = val;
  }

  // If there's nothing to update, just return the current user
  if (Object.keys(update).length === 0) {
    return ApiResponse.success(req.user).send(res);
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: update },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  return ApiResponse.success(user).send(res);
});

module.exports = {
  updateProfile,
};
