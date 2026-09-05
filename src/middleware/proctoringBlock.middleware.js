const ApiError = require("../utils/ApiError");
const User = require("../models/User.model");
const { evaluateAndAutoUnblockUser } = require("../services/proctoringBlock.service");

/**
 * Middleware that guards Quiz, Exam, and Interview access for users who
 * have been flagged by the proctoring anti-cheat system (isProctoringBlocked = true).
 *
 * Rules:
 *   1. Classic Track: Auto-unblocks in 30 minutes (timer comes only in classic).
 *   2. Super Dream Track: NO auto-unblock timer. Only the mentor can unblock!
 *   3. When blocked: returns HTTP 403 with track information and mentor details.
 */
const checkProctoringBlock = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }

    const status = await evaluateAndAutoUnblockUser(req.user);

    // If auto-unblocked by 30-minute expiration or never blocked, allow through
    if (!status.isBlocked) {
      if (req.user) {
        req.user.isProctoringBlocked = false;
        req.user.proctoringBlockedAt = null;
        req.user.proctoringBlockTrack = "classic";
      }
      return next();
    }

    // Lookup assigned mentor details if available to assist the student
    let mentorName = "Your Assigned Mentor";
    let mentorEmail = null;
    if (req.user.assignedMentor) {
      try {
        const mentor = await User.findById(req.user.assignedMentor)
          .select("name email")
          .lean();
        if (mentor) {
          mentorName = mentor.name || mentorName;
          mentorEmail = mentor.email || null;
        }
      } catch (mentorErr) {
        console.warn("[ProctoringBlock] Failed to fetch mentor info:", mentorErr.message);
      }
    }

    // ── SUPER DREAM: NO AUTO-UNBLOCK TIMER; ONLY MENTOR UNBLOCKS ────────────
    if (status.isSuperDream) {
      return res.status(403).json({
        success: false,
        isProctoringBlocked: true,
        isSuperDream: true,
        hasTimer: false,
        blockedAt: status.blockedAt,
        mentor: {
          name: mentorName,
          email: mentorEmail,
        },
        message: `Your Super Dream assessment access is suspended due to academic integrity violations. In Super Dream, auto-unblock timers are disabled. Only ${mentorName} can unblock your access.`,
      });
    }

    // ── CLASSIC TRACK: 30-MINUTE TIMER & CLASSIC AUTO-UNBLOCK ───────────────
    return res.status(403).json({
      success: false,
      isProctoringBlocked: true,
      isSuperDream: false,
      hasTimer: true,
      blockedAt: status.blockedAt,
      remainingMs: status.remainingMs,
      remainingSeconds: status.remainingSeconds,
      remainingMinutes: status.remainingMinutes,
      mentor: {
        name: mentorName,
        email: mentorEmail,
      },
      message: `Your test and interview access is suspended for 30 minutes due to academic integrity violations. Only ${mentorName} can unblock you early, or access will automatically restore in ${status.remainingMinutes} minute(s).`,
    });
  } catch (err) {
    console.error("[ProctoringBlock Middleware Error]:", err);
    return next(err);
  }
};

module.exports = checkProctoringBlock;
