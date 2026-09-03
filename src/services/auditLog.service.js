const AuditLog = require("../models/AuditLog.model");

/**
 * Sanitize request body to remove sensitive information
 * @param {Object} body - Request body
 * @returns {Object} - Sanitized body
 */
function sanitizeRequestBody(body) {
  if (!body || typeof body !== "object") return {};

  const sanitized = { ...body };
  const sensitiveFields = ["password", "token", "refreshToken", "secret", "apiKey", "twoFactorSecret"];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

/**
 * Extract IP address from request
 * @param {Request} req
 * @returns {string}
 */
function getIpAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.connection?.remoteAddress ||
    "unknown"
  );
}

/**
 * Determine category from action
 * @param {string} action
 * @returns {string}
 */
function getCategoryFromAction(action) {
  if (action.includes("LOGIN") || action.includes("LOGOUT") || action.includes("PASSWORD") || action.includes("2FA")) {
    return "AUTH";
  }
  if (action.includes("PROMPT") || action.includes("SUSPICIOUS") || action.includes("LOCKED") || action.includes("CODE_EXECUTION")) {
    return "SECURITY";
  }
  if (action.includes("AI")) {
    return "AI";
  }
  if (action.includes("ADMIN") || action.includes("MENTOR") || action.includes("TASK") || action.includes("FEEDBACK")) {
    return "ADMIN";
  }
  if (action.includes("DATA") || action.includes("ACCESSED") || action.includes("EXPORTED") || action.includes("CREATED") || action.includes("UPDATED") || action.includes("DELETED")) {
    return "DATA";
  }
  return "SYSTEM";
}

/**
 * Create an audit log entry
 * @param {Object} params - Log parameters
 * @returns {Promise<Object>}
 */
async function log({
  userId,
  userEmail,
  action,
  category,
  severity = "LOW",
  status = "SUCCESS",
  ipAddress,
  userAgent,
  resource,
  resourceId,
  details = {},
  metadata = {},
  changes = {},
  req = null,
}) {
  try {
    // Auto-extract from request if provided
    if (req) {
      ipAddress = ipAddress || getIpAddress(req);
      userAgent = userAgent || req.headers["user-agent"] || "";
      userId = userId || req.user?._id;
      userEmail = userEmail || req.user?.email;

      metadata = {
        ...metadata,
        requestMethod: req.method,
        requestPath: req.path,
        requestBody: sanitizeRequestBody(req.body),
      };
    }

    // Auto-determine category if not provided
    if (!category) {
      category = getCategoryFromAction(action);
    }

    const logEntry = await AuditLog.create({
      userId,
      userEmail,
      action,
      category,
      severity,
      status,
      ipAddress,
      userAgent,
      resource,
      resourceId,
      details,
      metadata,
      changes,
    });

    // Log critical events to console
    if (severity === "CRITICAL" || severity === "HIGH") {
      console.warn(
        `[AUDIT] ${severity} - ${action} by ${userEmail || userId} from ${ipAddress} - Status: ${status}`
      );
    }

    return logEntry;
  } catch (err) {
    // Don't let audit logging failure crash the application
    console.error("[Audit Log] Failed to create log entry:", err.message);
    return null;
  }
}

/**
 * Log authentication events
 */
async function logAuth({ action, userId, userEmail, status, req, details = {} }) {
  return log({
    userId,
    userEmail,
    action,
    category: "AUTH",
    severity: status === "FAILURE" ? "MEDIUM" : "LOW",
    status,
    req,
    details,
  });
}

/**
 * Log security events
 */
async function logSecurity({ action, userId, userEmail, severity = "HIGH", status = "BLOCKED", req, details = {} }) {
  return log({
    userId,
    userEmail,
    action,
    category: "SECURITY",
    severity,
    status,
    req,
    details,
  });
}

/**
 * Log data access events
 */
async function logDataAccess({ action, userId, userEmail, resource, resourceId, req, details = {} }) {
  return log({
    userId,
    userEmail,
    action,
    category: "DATA",
    severity: action.includes("SENSITIVE") || action.includes("PII") ? "MEDIUM" : "LOW",
    status: "SUCCESS",
    resource,
    resourceId,
    req,
    details,
  });
}

/**
 * Log admin actions
 */
async function logAdmin({ action, userId, userEmail, resource, resourceId, req, details = {}, changes = {} }) {
  return log({
    userId,
    userEmail,
    action,
    category: "ADMIN",
    severity: "MEDIUM",
    status: "SUCCESS",
    resource,
    resourceId,
    req,
    details,
    changes,
  });
}

/**
 * Log AI usage
 */
async function logAI({ action, userId, userEmail, req, details = {} }) {
  return log({
    userId,
    userEmail,
    action,
    category: "AI",
    severity: "LOW",
    status: "SUCCESS",
    req,
    details,
  });
}

/**
 * Get recent logs for a user
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getUserLogs(userId, limit = 50) {
  return AuditLog.findByUser(userId, limit);
}

/**
 * Get security events in the last N hours
 * @param {number} hours
 * @param {string} severity
 * @returns {Promise<Array>}
 */
async function getSecurityEvents(hours = 24, severity = "HIGH") {
  return AuditLog.findSecurityEvents(hours, severity);
}

/**
 * Check if IP has too many failed login attempts
 * @param {string} ipAddress
 * @param {number} threshold
 * @param {number} minutes
 * @returns {Promise<boolean>}
 */
async function hasExcessiveFailedLogins(ipAddress, threshold = 5, minutes = 15) {
  const count = await AuditLog.findFailedLogins(ipAddress, minutes);
  return count >= threshold;
}

module.exports = {
  log,
  logAuth,
  logSecurity,
  logDataAccess,
  logAdmin,
  logAI,
  getUserLogs,
  getSecurityEvents,
  hasExcessiveFailedLogins,
  sanitizeRequestBody,
  getIpAddress,
};
