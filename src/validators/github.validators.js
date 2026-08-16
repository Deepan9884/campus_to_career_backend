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
  body("postType")
    .optional({ checkFalsy: true })
    .isString(),
  body("repoFullName")
    .optional({ checkFalsy: true })
    .trim()
    .isString(),
  body("repoUrl")
    .optional({ checkFalsy: true })
    .trim()
    .isString(),
  body("eventName")
    .optional({ checkFalsy: true })
    .trim()
    .isString(),
];

module.exports = { connectValidators, analyzeValidators, linkedinPostValidators };
