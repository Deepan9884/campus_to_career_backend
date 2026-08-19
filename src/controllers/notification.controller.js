const jwt = require("jsonwebtoken");

const Notification = require("../models/Notification.model");
const User = require("../models/User.model");
const env = require("../config/env");
const notificationService = require("../services/notification.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

/**
 * Authenticate an SSE request using a token supplied via the query string.
 * EventSource in the browser cannot set custom Authorization headers,
 * so this endpoint accepts ?token=... instead of the standard header.
 *
 * Returns the loaded user object on success, throws ApiError otherwise.
 */
async function authenticateFromQueryToken(req) {
  const token = req.query.token;
  if (!token || typeof token !== "string") {
    throw ApiError.unauthorized("Authentication token is required");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw ApiError.unauthorized("Token expired");
    }
    throw ApiError.unauthorized("Invalid token");
  }

  const userId = decoded._id || decoded.sub;
  if (!userId) {
    throw ApiError.unauthorized("Invalid token payload");
  }

  const user = await User.findById(userId).select("-password -refreshToken").lean();
  if (!user) {
    throw ApiError.unauthorized("User no longer exists");
  }

  return user;
}

/**
 * GET /api/notifications
 * Paginated list, newest first, ownership-scoped.
 */
const listNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ user: req.user._id }),
  ]);

  return ApiResponse.success({
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }).send(res);
});

/**
 * GET /api/notifications/unread-count
 * Returns { count } for the current user.
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    read: false,
  });
  return ApiResponse.success({ count }).send(res);
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read. 404 if not owned (per project pattern).
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification || notification.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Notification not found");
  }

  if (!notification.read) {
    notification.read = true;
    await notification.save();
  }

  return ApiResponse.success(notification).send(res);
});

/**
 * PATCH /api/notifications/read-all
 * Bulk-mark every unread notification for the current user as read.
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, read: false },
    { $set: { read: true } },
  );

  return ApiResponse.success({
    matched: result.matchedCount || 0,
    modified: result.modifiedCount || 0,
  }).send(res);
});

/**
 * GET /api/notifications/stream  (?token=...)
 * Server-Sent Events stream for the current user. Sends:
 *   - an initial "connected" event with the user id
 *   - a comment heartbeat every ~30s so proxies don't drop the connection
 *   - a "notification" event every time createNotification fires for this user
 *
 * NOTE: Auth here uses ?token=... because the browser EventSource API
 * cannot set custom Authorization headers. This is a known, accepted
 * trade-off for SSE — call it out in the API docs.
 */
const streamNotifications = asyncHandler(async (req, res) => {
  // asyncHandler will surface this throw to next() → standard error middleware.
  const user = await authenticateFromQueryToken(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(`: connected ${user._id}\n\n`);

  notificationService.addSseConnection(user._id, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    notificationService.removeSseConnection(user._id, res);
    try {
      res.end();
    } catch {
      // already closed
    }
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
});

/**
 * POST /api/notifications/ticket
 * Issues a 60-second, single-purpose ticket for opening an SSE stream.
 */
const createStreamTicket = asyncHandler(async (req, res) => {
  const ticket = jwt.sign(
    { sub: req.user._id, purpose: "sse_stream" },
    env.JWT_SECRET,
    { expiresIn: "60s" },
  );
  return ApiResponse.success({ ticket }).send(res);
});

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  streamNotifications,
  createStreamTicket,
};
