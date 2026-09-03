const auditLogService = require("../services/auditLog.service");

/**
 * Audit middleware for sensitive operations
 * @param {Object} options - Audit options
 * @returns {Function} Express middleware
 */
function auditMiddleware(options = {}) {
  const {
    action,
    category,
    severity = "LOW",
    resource,
    captureResponse = false,
  } = options;

  return async (req, res, next) => {
    const startTime = Date.now();

    // Capture original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseData = null;

    // Override response methods if captureResponse is enabled
    if (captureResponse) {
      res.json = function (data) {
        responseData = data;
        return originalJson(data);
      };

      res.send = function (data) {
        responseData = data;
        return originalSend(data);
      };
    }

    // Log after response is sent
    res.on("finish", async () => {
      try {
        const duration = Date.now() - startTime;
        const status = res.statusCode >= 200 && res.statusCode < 300 ? "SUCCESS" : "FAILURE";

        const logData = {
          userId: req.user?._id,
          userEmail: req.user?.email,
          action: action || `${req.method}_${req.path}`,
          category,
          severity: res.statusCode >= 400 ? "MEDIUM" : severity,
          status,
          req,
          metadata: {
            requestMethod: req.method,
            requestPath: req.path,
            requestBody: auditLogService.sanitizeRequestBody(req.body),
            responseStatus: res.statusCode,
            duration,
          },
          resource: resource || req.params?.id || req.params?.studentId,
          resourceId: req.params?.id || req.params?.studentId,
          details: {
            query: req.query,
            params: req.params,
          },
        };

        if (captureResponse && responseData) {
          logData.details.response = responseData;
        }

        await auditLogService.log(logData);
      } catch (err) {
        console.error("[Audit Middleware] Failed to log:", err.message);
      }
    });

    next();
  };
}

/**
 * Audit middleware specifically for authentication events
 */
function auditAuth(action) {
  return auditMiddleware({
    action,
    category: "AUTH",
    severity: action.includes("FAILED") ? "MEDIUM" : "LOW",
  });
}

/**
 * Audit middleware for admin actions
 */
function auditAdmin(action) {
  return auditMiddleware({
    action,
    category: "ADMIN",
    severity: "MEDIUM",
  });
}

/**
 * Audit middleware for security events
 */
function auditSecurity(action, severity = "HIGH") {
  return auditMiddleware({
    action,
    category: "SECURITY",
    severity,
  });
}

/**
 * Audit middleware for data access
 */
function auditDataAccess(action) {
  return auditMiddleware({
    action,
    category: "DATA",
    severity: action.includes("SENSITIVE") || action.includes("PII") ? "MEDIUM" : "LOW",
  });
}

module.exports = {
  auditMiddleware,
  auditAuth,
  auditAdmin,
  auditSecurity,
  auditDataAccess,
};
