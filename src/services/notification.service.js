const Notification = require("../models/Notification.model");
const User = require("../models/User.model");
const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redisOptions = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
};
const pub = new IORedis(redisUrl, redisOptions);
const sub = new IORedis(redisUrl, redisOptions);

pub.on("error", (err) => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});
sub.on("error", (err) => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});

const sseConnections = new Map();

// Listen for notifications from other instances when Redis is connected
sub.on("connect", () => {
  sub.subscribe("sse-notifications", (err) => {
    if (err) console.warn("[notifications] Redis subscribe error:", err.message);
  });
});

sub.on("message", (channel, message) => {
  if (channel === "sse-notifications") {
    try {
      const payload = JSON.parse(message);
      pushToOpenConnections(payload.userId, payload.data);
    } catch (err) {
      console.warn("[notifications] Failed to process Redis message:", err);
    }
  }
});

/**
 * Register an open SSE response for a user.
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @param {import("express").Response} res
 */
function addSseConnection(userId, res) {
  const key = userId.toString();
  if (!sseConnections.has(key)) {
    sseConnections.set(key, new Set());
  }
  sseConnections.get(key).add(res);
}

/**
 * Remove an SSE response from the registry (called on connection close).
 */
function removeSseConnection(userId, res) {
  const key = userId.toString();
  const set = sseConnections.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    sseConnections.delete(key);
  }
}

/**
 * Push a notification payload to every open SSE connection for the user.
 * Failures here must NEVER bubble up — they only log.
 */
function pushToOpenConnections(userId, payload) {
  const key = userId.toString();
  const set = sseConnections.get(key);
  if (!set || set.size === 0) return;

  const json = JSON.stringify(payload);
  const frame = `event: notification\ndata: ${json}\n\n`;

  for (const res of set) {
    try {
      res.write(frame);
    } catch (err) {
      console.warn(`[notifications] SSE write failed for user ${key}:`, err.message);
      removeSseConnection(userId, res);
    }
  }
}

/**
 * Check if user has notifications enabled for a specific module.
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @param {string} module - One of: resume, interview, github, skill_gap, roadmap, quiz
 * @returns {Promise<boolean>} True if notifications should be created for this module
 */
async function shouldNotify(userId, module) {
  const user = await User.findById(userId).select("preferences").lean();
  if (!user || !user.preferences || !user.preferences.notifyOn) {
    return true; // Default to true if no preferences set
  }
  return user.preferences.notifyOn.includes(module);
}

/**
 * Create a notification document and push it to any active SSE connection.
 * DB write and SSE push are wrapped independently so a transport-level
 * failure cannot block or fail the persistence, and vice versa.
 *
 * @param {Object} input
 * @param {string|import("mongoose").Types.ObjectId} input.userId
 * @param {string} input.module - One of: resume, interview, github, skill_gap, roadmap, quiz
 * @param {string} input.type
 * @param {string} input.title
 * @param {string} input.message
 * @param {string|import("mongoose").Types.ObjectId} [input.relatedResourceId]
 * @param {string} [input.relatedResourceType]
 * @returns {Promise<HydratedDocument|null>} The saved notification, or null on DB failure or if notifications disabled for module.
 */
async function createNotification({
  userId,
  module,
  type,
  title,
  message,
  relatedResourceId = null,
  relatedResourceType = null,
}) {
  // Check user preferences first
  const notifyEnabled = await shouldNotify(userId, module);
  if (!notifyEnabled) {
    console.log(`[notifications] Skipping notification for user ${userId}, module ${module} disabled by user preference`);
    return null;
  }

  let saved = null;
  try {
    saved = await Notification.create({
      user: userId,
      type,
      title,
      message,
      relatedResourceId,
      relatedResourceType,
    });
  } catch (err) {
    console.error("[notifications] DB write failed:", err.message);
    return null;
  }

  try {
    const payload = {
      _id: saved._id,
      user: saved.user,
      type: saved.type,
      title: saved.title,
      message: saved.message,
      relatedResourceId: saved.relatedResourceId,
      relatedResourceType: saved.relatedResourceType,
      read: saved.read,
      createdAt: saved.createdAt,
    };
    
    // Push locally and to other instances via Redis
    pushToOpenConnections(userId, payload);
    if (pub.status === "ready") {
      pub.publish("sse-notifications", JSON.stringify({ userId: userId.toString(), data: payload })).catch(() => {});
    }
  } catch (err) {
    console.warn("[notifications] SSE push failed:", err.message);
  }

  return saved;
}

function getSseConnectionCount(userId) {
  const key = userId.toString();
  return sseConnections.get(key)?.size || 0;
}

module.exports = {
  createNotification,
  addSseConnection,
  removeSseConnection,
  pushToOpenConnections,
  getSseConnectionCount,
};
