const ActivityLog = require("../models/ActivityLog.model");

/**
 * Single choke-point for all activity-log writes.
 * Mirrors notification.service.js pattern: DB write and any side effects
 * wrapped independently so a logging failure never breaks the parent operation.
 *
 * @param {Object} input
 * @param {string|mongoose.Types.ObjectId} input.userId
 * @param {string} input.module - One of VALID_MODULES
 * @param {string} input.action
 * @param {string} input.summary
 * @param {string|mongoose.Types.ObjectId} input.relatedResourceId
 * @param {string} input.relatedResourceType
 * @param {Object} [input.metadata={}]
 * @returns {Promise<HydratedDocument|null>} Saved document or null on failure
 */
async function logActivity({
  userId,
  module,
  action,
  summary,
  relatedResourceId,
  relatedResourceType,
  metadata = {},
}) {
  let saved = null;
  try {
    saved = await ActivityLog.create({
      user: userId,
      module,
      action,
      summary,
      relatedResourceId,
      relatedResourceType,
      metadata,
    });
  } catch (err) {
    console.error("[activityLog] DB write failed:", err.message);
    return null;
  }

  return saved;
}

module.exports = { logActivity };