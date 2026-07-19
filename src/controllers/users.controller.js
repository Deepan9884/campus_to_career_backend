const User = require("../models/User.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const updateProfile = asyncHandler(async (req, res) => {
  // We only allow updating profile.targetRole and profile.githubUsername
  const update = {};
  
  if (req.body.profile) {
    if (req.body.profile.targetRole !== undefined) {
      update["profile.targetRole"] = req.body.profile.targetRole;
    }
    if (req.body.profile.githubUsername !== undefined) {
      update["profile.githubUsername"] = req.body.profile.githubUsername;
    }
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
