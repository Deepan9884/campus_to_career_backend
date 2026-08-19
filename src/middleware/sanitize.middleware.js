/**
 * Deeply sanitizes an object, array, or primitive to prevent NoSQL operator injection
 * ($gt, $ne, $where, $regex, etc.) and prototype pollution attacks.
 */
function sanitizeInput(target) {
  if (!target || typeof target !== "object") {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((item) => sanitizeInput(item));
  }

  const sanitized = {};
  for (const key of Object.keys(target)) {
    // Prohibit prototype pollution keys
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }

    // Strip any key starting with '$' or containing '.' that could be used for Mongo injection
    if (key.startsWith("$") || key.includes(".")) {
      continue;
    }

    sanitized[key] = sanitizeInput(target[key]);
  }

  return sanitized;
}

/**
 * Express middleware that recursively cleans req.body, req.query, and req.params.
 */
function mongoSanitize(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeInput(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeInput(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeInput(req.params);
  }
  next();
}

module.exports = {
  mongoSanitize,
  sanitizeInput,
};
