const { body } = require("express-validator");

const registerValidators = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),

  body("email")
    .trim()
    .isEmail()
    .withMessage("A valid email address is required")
    .normalizeEmail({ all_lowercase: true }),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, one uppercase letter, and one digit",
    ),
];

const loginValidators = [
  body("email").trim().isEmail().withMessage("A valid email address is required"),

  body("password").notEmpty().withMessage("Password is required"),
];

const updateProfileValidators = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),

  body("targetRole")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Target role must be at most 100 characters")
    .matches(/^[a-zA-Z0-9 \-\/&(),\.]*$/)
    .withMessage("Target role contains invalid characters"),

  body("bio")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Bio must be at most 500 characters"),

  body("linkedinUrl").optional().trim().isURL().withMessage("LinkedIn URL must be a valid URL"),

  body("avatar")
    .optional()
    .custom((value) => {
      if (typeof value !== "string") throw new Error("Avatar must be a string");
      const isUrl = value.startsWith("http://") || value.startsWith("https://");
      const isDataUri = value.startsWith("data:image/");
      if (!isUrl && !isDataUri) {
        throw new Error("Avatar must be a valid URL or base64 data URI");
      }
      return true;
    })
    .isLength({ max: 7000000 })
    .withMessage("Avatar is too large"),

  body("githubUsername")
    .optional()
    .trim()
    .isLength({ max: 39 })
    .withMessage("GitHub username must be at most 39 characters")
    .matches(/^[a-zA-Z0-9-]*$/)
    .withMessage("GitHub username can only contain letters, numbers, and hyphens"),
];

const forgotPasswordValidators = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("A valid email address is required")
    .normalizeEmail({ all_lowercase: true }),
];

const resetPasswordValidators = [
  body("token").trim().notEmpty().withMessage("Reset token is required"),

  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, one uppercase letter, and one digit",
    ),
];

const updatePreferencesValidators = [
  body("theme")
    .optional()
    .isIn(["dark", "light", "system"])
    .withMessage("Theme must be 'dark', 'light', or 'system'"),

  body("notifyOn")
    .optional()
    .isArray()
    .withMessage("notifyOn must be an array")
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      const validModules = ["resume", "interview", "github", "skill_gap", "roadmap", "quiz"];
      const invalid = value.filter((m) => !validModules.includes(m));
      if (invalid.length > 0) {
        throw new Error(`Invalid module(s) in notifyOn: ${invalid.join(", ")}`);
      }
      return true;
    }),

  body("emailDigest")
    .optional()
    .isIn(["off", "daily", "weekly"]),

  body("aiDifficulty")
    .optional()
    .isIn(["Beginner", "Intermediate", "Advanced"]),

  body("preferredLanguage")
    .optional()
    .isString(),

  body("resumePrivacy")
    .optional()
    .isBoolean(),

  body("dailyGoalProblems")
    .optional()
    .isInt({ min: 1, max: 100 }),

  body("hiddenModules")
    .optional()
    .isArray(),
];

module.exports = {
  registerValidators,
  loginValidators,
  updateProfileValidators,
  updatePreferencesValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
};
