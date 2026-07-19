const { body } = require("express-validator");

const connectValidators = [
  body("githubUsername")
    .trim()
    .notEmpty()
    .withMessage("GitHub username is required")
    .isLength({ max: 39 })
    .withMessage("GitHub username must be at most 39 characters")
    .matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
    .withMessage(
      "GitHub username can only contain letters, numbers, and hyphens, and cannot start or end with a hyphen",
    ),
];

const analyzeValidators = [
  body("repoFullName")
    .trim()
    .notEmpty()
    .withMessage("Repository full name is required")
    .matches(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)
    .withMessage("Repository full name must be in 'owner/repo' format"),
];

const linkedinPostValidators = [
  body("repoFullName")
    .trim()
    .notEmpty()
    .withMessage("Repository full name is required")
    .matches(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)
    .withMessage("Repository full name must be in 'owner/repo' format"),
  body("overview")
    .trim()
    .notEmpty()
    .withMessage("Overview is required"),
  body("quality")
    .trim()
    .notEmpty()
    .withMessage("Quality assessment is required"),
  body("resumeImpact")
    .isArray({ min: 1 })
    .withMessage("At least one resume impact item is required"),
  body("repoUrl")
    .trim()
    .notEmpty()
    .withMessage("Repository URL is required")
    .isURL()
    .withMessage("Repository URL must be a valid URL"),
];

module.exports = { connectValidators, analyzeValidators, linkedinPostValidators };
