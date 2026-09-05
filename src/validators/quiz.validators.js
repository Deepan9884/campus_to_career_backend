const { body } = require("express-validator");

const generateQuizValidators = [
  body("roadmapItemId")
    .optional({ checkFalsy: true })
    .trim(),
  body("skillName")
    .optional({ checkFalsy: true })
    .trim(),
  body("subTopicName")
    .optional({ checkFalsy: true })
    .trim(),
  body()
    .custom((val, { req }) => {
      if (!req.body?.roadmapItemId && !req.body?.skillName && !req.body?.subTopicName) {
        throw new Error("At least one of roadmapItemId, skillName, or subTopicName is required");
      }
      return true;
    }),
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