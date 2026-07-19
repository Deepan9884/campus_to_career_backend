const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

const validate = (req, _res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const extractedErrors = errors.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
  }));

  return next(ApiError.badRequest("Validation failed", extractedErrors));
};

module.exports = validate;
