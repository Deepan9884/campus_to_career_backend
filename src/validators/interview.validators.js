const { body, param } = require("express-validator");

const startInterviewValidators = [
  body("domain")
    .trim()
    .notEmpty()
    .withMessage("Domain is required")
    .isIn(["behavioral", "technical"])
    .withMessage("Domain must be 'behavioral' or 'technical'"),

  body("targetRole")
    .optional()
    .isString()
    .withMessage("targetRole must be a string")
    .isLength({ max: 100 })
    .withMessage("targetRole must be at most 100 characters")
    .trim()
    .matches(/^[a-zA-Z0-9 \-\/&(),\.]*$/)
    .withMessage("targetRole contains invalid characters"),

  body("difficulty")
    .optional()
    .isIn(["easy", "medium", "hard"])
    .withMessage("Difficulty must be 'easy', 'medium', or 'hard'"),

  body("questionCount")
    .optional()
    .isInt({ min: 3, max: 10 })
    .withMessage("questionCount must be an integer between 3 and 10"),
];

const answerValidators = [
  body("questionIndex")
    .exists()
    .withMessage("questionIndex is required")
    .isInt({ min: 0 })
    .withMessage("questionIndex must be a non-negative integer"),

  body("answer")
    .exists()
    .withMessage("Answer is required")
    .isString()
    .trim()
    .isLength({ min: 1, max: 3000 })
    .withMessage("Answer must be between 1 and 3000 characters"),
];

module.exports = {
  startInterviewValidators,
  answerValidators,
};
