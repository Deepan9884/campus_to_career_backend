const ProctoringViolation = require("../models/ProctoringViolation.model");
const ExamSubmission = require("../models/ExamSubmission.model");
const User = require("../models/User.model");
const Notification = require("../models/Notification.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const notificationService = require("../services/notification.service");
const { invalidateUserCache } = require("../middleware/auth.middleware");

const MAX_VIOLATIONS = 3;

/**
 * POST /api/proctoring/violation
 * Student reports a proctoring violation event.
 * Increments count, blocks user on 3rd strike.
 */
const reportViolation = asyncHandler(async (req, res) => {
  const { moduleType, moduleId, violationType, forceBlock } = req.body;

  if (!moduleType || !moduleId || !violationType) {
    throw ApiError.badRequest("moduleType, moduleId, and violationType are required");
  }

  const allowedModuleTypes = ["quiz", "interview", "exam"];
  const allowedViolationTypes = [
    "mobile_phone_detected",
    "face_not_detected",
    "multiple_faces_detected",
    "fullscreen_exit",
    "fullscreen_timeout",
    "tab_switch",
    "keyboard_shortcut",
    "eye_tracking_violation",
  ];

  if (!allowedModuleTypes.includes(moduleType)) {
    throw ApiError.badRequest("Invalid moduleType");
  }
  if (!allowedViolationTypes.includes(violationType)) {
    throw ApiError.badRequest("Invalid violationType");
  }

  // Upsert: find or create violation record for this attempt/session
  let record = await ProctoringViolation.findOne({
    userId: req.user._id,
    moduleId,
    moduleType,
  });

  if (!record) {
    record = new ProctoringViolation({
      userId: req.user._id,
      moduleType,
      moduleId,
      violationCount: 0,
      events: [],
      isBlocked: false,
      blockedAt: null,
    });
  }

  // If already blocked, return HTTP 403
  if (record.isBlocked) {
    return res.status(403).json({
      success: false,
      violationCount: record.violationCount,
      isBlocked: true,
      message: "Exam access is blocked. Please contact your mentor to restore access.",
    });
  }

  // Increment and log
  const isFullscreenTimeout = Boolean(forceBlock || violationType === "fullscreen_timeout");
  record.violationCount = isFullscreenTimeout
    ? Math.max(record.violationCount + 1, MAX_VIOLATIONS)
    : record.violationCount + 1;
  record.events.push({ violationType, detectedAt: new Date() });

  const shouldBlock = isFullscreenTimeout || record.violationCount >= MAX_VIOLATIONS;

  if (shouldBlock) {
    record.isBlocked = true;
    record.blockedAt = new Date();

    // Block the user's proctoring access and invalidate auth user cache
    await User.findByIdAndUpdate(req.user._id, {
      isProctoringBlocked: true,
      proctoringBlockedAt: new Date(),
    });
    invalidateUserCache(req.user._id);

    // Synchronize ExamSubmission if candidate is taking an exam
    try {
      await ExamSubmission.findOneAndUpdate(
        { userId: req.user._id, examId: moduleId },
        {
          $set: {
            isBlocked: true,
            status: "disqualified",
            blockedReason: isFullscreenTimeout
              ? "Exited fullscreen and failed to return within 15 seconds"
              : "Exceeded maximum anti-cheat proctoring violations limit (3 strikes)",
            blockedAt: new Date(),
            violationsCount: record.violationCount,
            proctoringIntegrity: 0,
          },
        }
      );
    } catch (examSubErr) {
      console.error("[Proctoring] Failed to sync ExamSubmission status:", examSubErr);
    }

    // Notify the student
    try {
      const studentNotification = await Notification.create({
        user: req.user._id,
        type: "proctoring_blocked",
        title: "Exam Access Blocked",
        message: isFullscreenTimeout
          ? "Your exam access has been blocked because you did not return to fullscreen within 15 seconds. Please contact your mentor to restore access."
          : "Your exam access has been blocked due to 3 proctoring violations. Please contact your mentor to restore access.",
        actionUrl: "/dashboard",
        read: false,
      });
      notificationService.pushToOpenConnections(req.user._id, studentNotification);
    } catch (err) {
      console.error("[Proctoring] Failed to send block notification to student:", err);
    }

    // Notify the assigned mentor if any
    try {
      const fullUser = await User.findById(req.user._id).select("name assignedMentor").lean();
      if (fullUser?.assignedMentor) {
        const mentorNotification = await Notification.create({
          user: fullUser.assignedMentor,
          type: "proctoring_blocked",
          title: "Student Exam Blocked",
          message: isFullscreenTimeout
            ? `${fullUser.name} has been blocked from exam access after failing to re-enter fullscreen within 15 seconds. Review and unblock from the admin portal.`
            : `${fullUser.name} has been blocked from exam access after 3 proctoring violations. Review and unblock from the admin portal.`,
          actionUrl: "/students",
          read: false,
        });
        notificationService.pushToOpenConnections(fullUser.assignedMentor, mentorNotification);
      }
    } catch (err) {
      console.error("[Proctoring] Failed to send block notification to mentor:", err);
    }
  }

  await record.save();

  if (shouldBlock) {
    return res.status(403).json({
      success: false,
      violationCount: record.violationCount,
      isBlocked: true,
      message: isFullscreenTimeout
        ? "Exam access blocked: Candidate failed to re-enter fullscreen within 15 seconds"
        : "Exam access blocked after 3 violations",
    });
  }

  return ApiResponse.success({
    violationCount: record.violationCount,
    isBlocked: false,
    message: `Warning ${record.violationCount} of ${MAX_VIOLATIONS}: ${violationType.replace(/_/g, " ")}`,
  }).send(res);
});

/**
 * GET /api/proctoring/status/:moduleId
 * Returns current violation count and block status for an active attempt/session.
 */
const getViolationStatus = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;

  const record = await ProctoringViolation.findOne({
    userId: req.user._id,
    moduleId,
  }).lean();

  if (!record) {
    return ApiResponse.success({
      violationCount: 0,
      isBlocked: false,
      events: [],
    }).send(res);
  }

  return ApiResponse.success({
    violationCount: record.violationCount,
    isBlocked: record.isBlocked,
    blockedAt: record.blockedAt,
    events: record.events,
  }).send(res);
});

module.exports = { reportViolation, getViolationStatus };
