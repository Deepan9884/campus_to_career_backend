const { body, query } = require("express-validator");

const addSkillValidators = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Skill name is required")
    .isLength({ max: 60 })
    .withMessage("Skill name must be at most 60 characters"),
  body("level")
    .notEmpty()
    .withMessage("Skill level is required")
    .isIn(["beginner", "intermediate", "advanced", "expert"])
    .withMessage("Level must be beginner, intermediate, advanced, or expert"),
];

const analyzeValidators = [
  body("targetRole")
    .trim()
    .notEmpty()
    .withMessage("Target role is required")
    .isLength({ max: 100 })
    .withMessage("Target role must be at most 100 characters")
    .matches(/^[a-zA-Z0-9 \-\/&(),\.]*$/)
    .withMessage("Target role contains invalid characters"),
];

const suggestionsValidators = [
  query("targetRole")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Target role must be at most 100 characters")
    .matches(/^[a-zA-Z0-9 \-\/&(),\.]*$/)
    .withMessage("Target role contains invalid characters"),
];

module.exports = { addSkillValidators, analyzeValidators, suggestionsValidators };
