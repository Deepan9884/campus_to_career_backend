const ProctoringViolation = require("../models/ProctoringViolation.model");
const ExamSubmission = require("../models/ExamSubmission.model");
const User = require("../models/User.model");
const Notification = require("../models/Notification.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const notificationService = require("../services/notification.service");
const emailService = require("../services/email.service");
const { invalidateUserCache } = require("../middleware/auth.middleware");
const {
  evaluateAndAutoUnblockUser,
  blockUserForProctoring,
} = require("../services/proctoringBlock.service");

const MAX_VIOLATIONS = 3;

/**
 * POST /api/proctoring/violation
 * Student reports a proctoring violation event.
 * Increments count, blocks user for 30 minutes on 3rd strike or fullscreen timeout.
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

  // 1. Check if user is currently globally blocked (and evaluate 30-min auto-unblock)
  const currentBlockStatus = await evaluateAndAutoUnblockUser(req.user);

  // 2. Upsert: find or create violation record for this attempt/session
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

  // If user is already blocked in 30-minute lockout, return 403 immediately
  if (currentBlockStatus.isBlocked || record.isBlocked) {
    let mentorName = "your assigned mentor";
    let mentorEmail = null;
    if (req.user.assignedMentor) {
      try {
        const m = await User.findById(req.user.assignedMentor).select("name email").lean();
        if (m) {
          mentorName = m.name || mentorName;
          mentorEmail = m.email || null;
        }
      } catch {}
    }

    return res.status(403).json({
      success: false,
      violationCount: record.violationCount || MAX_VIOLATIONS,
      isProctoringBlocked: true,
      remainingMs: currentBlockStatus.remainingMs,
      remainingSeconds: currentBlockStatus.remainingSeconds,
      remainingMinutes: currentBlockStatus.remainingMinutes,
      blockedAt: currentBlockStatus.blockedAt || record.blockedAt,
      mentor: { name: mentorName, email: mentorEmail },
      message: `Your assessment access is suspended for 30 minutes. Only ${mentorName} can unblock you early, or access will automatically restore in ${currentBlockStatus.remainingMinutes} minute(s).`,
    });
  }

  // Increment and log
  const isFullscreenTimeout = Boolean(forceBlock || violationType === "fullscreen_timeout");
  record.violationCount = isFullscreenTimeout
    ? Math.max(record.violationCount + 1, MAX_VIOLATIONS)
    : record.violationCount + 1;
  record.events.push({ violationType, detectedAt: new Date() });

  const shouldBlock = isFullscreenTimeout || record.violationCount >= MAX_VIOLATIONS;

  let blockInfo = null;
  if (shouldBlock) {
    record.isBlocked = true;
    record.blockedAt = new Date();

    // Block candidate for 30 minutes in DB and invalidate session cache
    blockInfo = await blockUserForProctoring(req.user._id);

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

    // Lookup mentor details
    let mentorName = "Your Assigned Mentor";
    let mentorEmail = null;
    let fullStudent = null;
    try {
      fullStudent = await User.findById(req.user._id)
        .select("name email assignedMentor")
        .populate("assignedMentor", "name email")
        .lean();
      if (fullStudent?.assignedMentor) {
        mentorName = fullStudent.assignedMentor.name || mentorName;
        mentorEmail = fullStudent.assignedMentor.email || null;
      }
    } catch {}

    // Notify the student via in-app notification & email
    try {
      const studentNotification = await Notification.create({
        user: req.user._id,
        type: "proctoring_blocked",
        title: "Test Access Suspended (30 Minutes)",
        message: isFullscreenTimeout
          ? `Your test access has been suspended for 30 minutes because you did not return to fullscreen within 15 seconds. Only ${mentorName} can unblock you early, or access will auto-restore in 30 minutes.`
          : `Your test access has been suspended for 30 minutes due to 3 proctoring violations. Only ${mentorName} can unblock you early, or access will auto-restore in 30 minutes.`,
        actionUrl: "/dashboard",
        read: false,
      });
      notificationService.pushToOpenConnections(req.user._id, studentNotification);

      if (fullStudent) {
        emailService
          .sendProctoringBlockedEmail(fullStudent, {
            examTitle:
              moduleType === "exam"
                ? "Faculty Assessment"
                : moduleType === "interview"
                ? "AI Mock Interview"
                : "Skill Gap / Roadmap Quiz",
            reason: isFullscreenTimeout
              ? "Exited fullscreen and failed to return within 15 seconds"
              : "Anti-cheat violations limit exceeded (3 strikes)",
            violationCount: record.violationCount,
            mentorName,
          })
          .catch((e) => console.error("[Proctoring] Failed to send email alert:", e.message));
      }
    } catch (err) {
      console.error("[Proctoring] Failed to send block notification to student:", err);
    }

    // Notify the assigned mentor
    try {
      if (fullStudent?.assignedMentor) {
        const mentorId = fullStudent.assignedMentor._id || fullStudent.assignedMentor;
        const mentorNotification = await Notification.create({
          user: mentorId,
          type: "proctoring_blocked",
          title: `[Mentee Alert] Test Blocked (30m): ${fullStudent.name}`,
          message: isFullscreenTimeout
            ? `Your mentee ${fullStudent.name} was blocked from tests for 30 minutes after failing to re-enter fullscreen within 15 seconds. You can review and unblock early from the admin portal.`
            : `Your mentee ${fullStudent.name} was blocked from tests for 30 minutes after 3 proctoring violations. You can review and unblock early from the admin portal.`,
          actionUrl: "/students",
          read: false,
        });
        notificationService.pushToOpenConnections(mentorId, mentorNotification);
      }
    } catch (err) {
      console.error("[Proctoring] Failed to send block notification to mentor:", err);
    }
  }

  await record.save();

  if (shouldBlock) {
    let mentorName = "Your Assigned Mentor";
    let mentorEmail = null;
    if (req.user.assignedMentor) {
      try {
        const m = await User.findById(req.user.assignedMentor).select("name email").lean();
        if (m) {
          mentorName = m.name || mentorName;
          mentorEmail = m.email || null;
        }
      } catch {}
    }

    return res.status(403).json({
      success: false,
      violationCount: record.violationCount,
      isProctoringBlocked: true,
      remainingMs: blockInfo?.remainingMs || 30 * 60 * 1000,
      remainingSeconds: blockInfo?.remainingSeconds || 1800,
      remainingMinutes: blockInfo?.remainingMinutes || 30,
      blockedAt: blockInfo?.blockedAt || new Date(),
      mentor: { name: mentorName, email: mentorEmail },
      message: isFullscreenTimeout
        ? `Test access suspended for 30 minutes (fullscreen exit timeout). Only ${mentorName} can unblock you early, or access will auto-restore in 30 minutes.`
        : `Test access suspended for 30 minutes (3 violations reached). Only ${mentorName} can unblock you early, or access will auto-restore in 30 minutes.`,
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

  const userBlockStatus = await evaluateAndAutoUnblockUser(req.user);

  const record = await ProctoringViolation.findOne({
    userId: req.user._id,
    moduleId,
  }).lean();

  if (!record) {
    return ApiResponse.success({
      violationCount: 0,
      isBlocked: userBlockStatus.isBlocked,
      remainingSeconds: userBlockStatus.remainingSeconds,
      remainingMinutes: userBlockStatus.remainingMinutes,
      events: [],
    }).send(res);
  }

  return ApiResponse.success({
    violationCount: record.violationCount,
    isBlocked: Boolean(userBlockStatus.isBlocked || record.isBlocked),
    blockedAt: record.blockedAt || userBlockStatus.blockedAt,
    remainingSeconds: userBlockStatus.remainingSeconds,
    remainingMinutes: userBlockStatus.remainingMinutes,
    events: record.events,
  }).send(res);
});

/**
 * GET /api/proctoring/check-status
 * Dedicated lightweight query for the student frontend to inspect real-time block state,
 * countdown seconds, and assigned mentor info.
 */
const checkMyProctoringStatus = asyncHandler(async (req, res) => {
  const status = await evaluateAndAutoUnblockUser(req.user);

  let mentorName = "Your Assigned Mentor";
  let mentorEmail = null;
  if (req.user.assignedMentor) {
    try {
      const mentor = await User.findById(req.user.assignedMentor).select("name email").lean();
      if (mentor) {
        mentorName = mentor.name || mentorName;
        mentorEmail = mentor.email || null;
      }
    } catch {}
  }

  return ApiResponse.success({
    isBlocked: status.isBlocked,
    autoUnblocked: status.autoUnblocked,
    remainingMs: status.remainingMs,
    remainingSeconds: status.remainingSeconds,
    remainingMinutes: status.remainingMinutes,
    blockedAt: status.blockedAt,
    mentor: {
      name: mentorName,
      email: mentorEmail,
    },
  }).send(res);
});

module.exports = {
  reportViolation,
  getViolationStatus,
  checkMyProctoringStatus,
};
