const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Authentication events
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "LOGOUT",
        "PASSWORD_RESET_REQUEST",
        "PASSWORD_RESET_SUCCESS",
        "EMAIL_VERIFIED",
        "2FA_ENABLED",
        "2FA_DISABLED",
        "ACCOUNT_LOCKED",
        
        // Authorization events
        "UNAUTHORIZED_ACCESS_ATTEMPT",
        "ROLE_CHANGED",
        "PERMISSIONS_MODIFIED",
        
        // Data access events
        "USER_DATA_ACCESSED",
        "USER_DATA_EXPORTED",
        "SENSITIVE_DATA_VIEWED",
        "PII_ACCESSED",
        
        // Data modification events
        "USER_CREATED",
        "USER_UPDATED",
        "USER_DELETED",
        "PROFILE_UPDATED",
        "PASSWORD_CHANGED",
        
        // Security events
        "TOKEN_BLACKLISTED",
        "PROMPT_INJECTION_BLOCKED",
        "RATE_LIMIT_EXCEEDED",
        "SUSPICIOUS_ACTIVITY",
        "CODE_EXECUTION_ATTEMPT",
        
        // Admin actions
        "ADMIN_ACTION",
        "MENTOR_ASSIGNED",
        "STUDENT_UNBLOCKED",
        "TASK_CREATED",
        "FEEDBACK_SENT",
        
        // AI usage
        "AI_QUERY",
        "AI_QUOTA_EXCEEDED",
        
        // System events
        "CONFIG_CHANGED",
        "CACHE_CLEARED",
      ],
      index: true,
    },
    category: {
      type: String,
      enum: ["AUTH", "DATA", "SECURITY", "ADMIN", "AI", "SYSTEM"],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW",
      index: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE", "BLOCKED"],
      required: true,
    },
    ipAddress: {
      type: String,
      default: "unknown",
    },
    userAgent: {
      type: String,
      default: "",
    },
    resource: {
      type: String, // e.g., "User:123", "Exam:456"
      default: "",
    },
    resourceId: {
      type: String,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Flexible field for additional context
      default: {},
    },
    metadata: {
      requestMethod: { type: String },
      requestPath: { type: String },
      requestBody: { type: mongoose.Schema.Types.Mixed }, // Sanitized request body
      responseStatus: { type: Number },
      duration: { type: Number }, // Request duration in ms
    },
    changes: {
      before: { type: mongoose.Schema.Types.Mixed },
      after: { type: mongoose.Schema.Types.Mixed },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ ipAddress: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// TTL index - auto-delete logs older than 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static method: Find logs by user
auditLogSchema.statics.findByUser = function (userId, limit = 100) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Static method: Find security events
auditLogSchema.statics.findSecurityEvents = function (hours = 24, severity = "HIGH") {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    category: "SECURITY",
    severity: { $in: [severity, "CRITICAL"] },
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .lean();
};

// Static method: Find failed login attempts
auditLogSchema.statics.findFailedLogins = function (ipAddress, minutes = 15) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.find({
    action: "LOGIN_FAILED",
    ipAddress,
    createdAt: { $gte: since },
  }).countDocuments();
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
