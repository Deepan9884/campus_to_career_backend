const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const notificationController = require("../controllers/notification.controller");

const router = Router();

// SSE stream MUST be mounted BEFORE the catch-all "/:id" route so it isn't
// swallowed by ":id". It also authenticates via ?token=, not the JWT header,
// so it is intentionally NOT wrapped with verifyJWT.
router.get("/stream", notificationController.streamNotifications);

router.post("/ticket", verifyJWT, notificationController.createStreamTicket);

router.get("/", verifyJWT, notificationController.listNotifications);

router.get("/unread-count", verifyJWT, notificationController.getUnreadCount);

router.patch("/read-all", verifyJWT, notificationController.markAllAsRead);

router.patch("/:id/read", verifyJWT, notificationController.markAsRead);

module.exports = router;
