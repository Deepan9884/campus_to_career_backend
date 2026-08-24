const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const verifyJWT = require("../middleware/auth.middleware");
const { reportViolation, getViolationStatus } = require("../controllers/proctoring.controller");

const router = Router();

const proctoringLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // up to 60 events/minute per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: {
    success: false,
    message: "Too many proctoring telemetry requests, please slow down",
  },
});

// POST /api/proctoring/violation — student reports a violation event
router.post("/violation", verifyJWT, proctoringLimiter, reportViolation);

// GET /api/proctoring/status/:moduleId — get violation status for an attempt/session
router.get("/status/:moduleId", verifyJWT, getViolationStatus);

module.exports = router;
