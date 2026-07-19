const { body } = require("express-validator");

const uploadValidators = [
  body("targetRole")
    .optional()
    .isString()
    .withMessage("targetRole must be a string")
    .isLength({ max: 100 })
    .withMessage("targetRole must be at most 100 characters")
    .trim()
    .matches(/^[a-zA-Z0-9 \-\/&(),\.]*$/)
    .withMessage("targetRole contains invalid characters"),
];

module.exports = { uploadValidators };
