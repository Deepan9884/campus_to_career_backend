const ApiError = require("../utils/ApiError");

const validateZod = (schema) => (req, _res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    // Replace req properties with validated ones (strips unknown fields if schema dictates)
    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;
    next();
  } catch (error) {
    if (error.name === "ZodError" || error.issues) {
      const issues = error.issues || error.errors || [];
      const extractedErrors = issues.map((e) => ({
        field: Array.isArray(e.path) ? e.path.join(".") : String(e.path || ""),
        message: e.message,
      }));
      return next(ApiError.badRequest("Validation failed", extractedErrors));
    }
    next(error);
  }
};

module.exports = validateZod;
