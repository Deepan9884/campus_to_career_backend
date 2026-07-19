const { body } = require("express-validator");

const generateValidators = [
  body("skillGapAnalysisId")
    .trim()
    .notEmpty()
    .withMessage("skillGapAnalysisId is required")
    .isMongoId()
    .withMessage("skillGapAnalysisId must be a valid MongoDB ObjectId"),
];

module.exports = { generateValidators };
