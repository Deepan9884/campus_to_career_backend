const User = require("../models/User.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const updateProfile = asyncHandler(async (req, res) => {
  const update = {};
  
  const topAllowed = ["name", "avatar", "targetRole", "githubUsername", "bio", "location", "linkedinUrl"];
  for (const key of topAllowed) {
    if (req.body[key] !== undefined) {
      const val = typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
      update[key] = val;
      if (key === "targetRole" || key === "githubUsername" || key === "bio" || key === "location") {
        update[`profile.${key}`] = val;
      }
    }
  }

  if (req.body.profile && typeof req.body.profile === "object") {
    const profileFields = [
      "githubUsername",
      "targetRole",
      "bio",
      "location",
      "registerNumber",
      "department",
      "batch",
      "currentSemester",
      "facultyMentor",
    ];
    for (const f of profileFields) {
      if (req.body.profile[f] !== undefined) {
        const val = typeof req.body.profile[f] === "string" ? req.body.profile[f].trim() : req.body.profile[f];
        update[`profile.${f}`] = val;
        if (f === "githubUsername" || f === "targetRole" || f === "bio" || f === "location") {
          update[f] = val;
        }
      }
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
