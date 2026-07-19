const { body } = require("express-validator");

const generateQuizValidators = [
  body("roadmapItemId")
    .trim()
    .notEmpty()
    .withMessage("roadmapItemId is required")
    .isMongoId()
    .withMessage("roadmapItemId must be a valid MongoDB ObjectId"),
];

const submitQuizValidators = [
  body("attemptId")
    .trim()
    .notEmpty()
    .withMessage("attemptId is required")
    .isMongoId()
    .withMessage("attemptId must be a valid MongoDB ObjectId"),
  body("answers")
    .isArray({ min: 1 })
    .withMessage("answers must be a non-empty array"),
  body("answers.*.questionId")
    .trim()
    .notEmpty()
    .withMessage("Each answer must have a questionId"),
  body("answers.*.answerText")
    .isString()
    .withMessage("answerText must be a string"),
];

module.exports = { generateQuizValidators, submitQuizValidators };