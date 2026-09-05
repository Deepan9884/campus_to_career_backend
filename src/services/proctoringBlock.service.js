const User = require("../models/User.model");
const ProctoringViolation = require("../models/ProctoringViolation.model");
const ExamSubmission = require("../models/ExamSubmission.model");
const { invalidateUserCache } = require("../middleware/auth.middleware");

// Standard anti-cheat block duration in Classic mode: 30 minutes
const PROCTORING_BLOCK_DURATION_MS = 30 * 60 * 1000;

/**
 * Evaluates whether a candidate is proctoring-blocked.
 *
 * Rules:
 *   - Classic track: Auto-unblocks in 30 minutes (timer comes only in classic).
 *   - Super Dream track: NO auto-unblock timer. Only mentor can unblock!
 *
 * @param {import("mongoose").Document|string|object} userOrId
 * @returns {Promise<{
 *   isBlocked: boolean,
 *   autoUnblocked: boolean,
 *   isSuperDream: boolean,
 *   hasTimer: boolean,
 *   remainingMs: number,
 *   remainingSeconds: number,
 *   remainingMinutes: number,
 *   blockedAt: Date|null,
 *   user: object|null
 * }>}
 */
async function evaluateAndAutoUnblockUser(userOrId) {
  if (!userOrId) {
    return {
      isBlocked: false,
      autoUnblocked: false,
      isSuperDream: false,
      hasTimer: false,
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: null,
      user: null,
    };
  }

  let user = userOrId;
  const userId = user._id || user;

  // If user object lacks proctoring fields, query the latest document
  if (!user || user.isProctoringBlocked === undefined || user.proctoringBlockTrack === undefined) {
    user = await User.findById(userId)
      .select("name email assignedMentor isProctoringBlocked proctoringBlockedAt proctoringBlockTrack")
      .lean();
  }

  if (!user) {
    return {
      isBlocked: false,
      autoUnblocked: false,
      isSuperDream: false,
      hasTimer: false,
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: null,
      user: null,
    };
  }

  // If user is not marked blocked, allow access immediately
  if (!user.isProctoringBlocked) {
    return {
      isBlocked: false,
      autoUnblocked: false,
      isSuperDream: false,
      hasTimer: false,
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: null,
      user,
    };
  }

  const isSuperDream = user.proctoringBlockTrack === "super_dream";
  const blockedAtTime = user.proctoringBlockedAt
    ? new Date(user.proctoringBlockedAt).getTime()
    : Date.now();
  const elapsed = Date.now() - blockedAtTime;

  // ── SUPER DREAM TRACK: NO AUTO-UNBLOCK TIMER; ONLY MENTOR UNBLOCKS ───────
  if (isSuperDream) {
    return {
      isBlocked: true,
      autoUnblocked: false,
      isSuperDream: true,
      hasTimer: false,
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: user.proctoringBlockedAt || new Date(blockedAtTime),
      user,
    };
  }

  // ── CLASSIC TRACK: AUTO-UNBLOCK IN 30 MINUTES ─────────────────────────────
  if (elapsed >= PROCTORING_BLOCK_DURATION_MS) {
    console.log(
      `[Proctoring] Classic 30-minute block duration expired for user ${userId}. Executing classic auto-unblock.`
    );

    // 1. Reset User block state
    await User.findByIdAndUpdate(userId, {
      $set: {
        isProctoringBlocked: false,
        proctoringBlockedAt: null,
        proctoringBlockTrack: "classic",
      },
    });

    // 2. Clear blocked state on ProctoringViolation attempts
    await ProctoringViolation.updateMany(
      { userId },
      {
        $set: {
          isBlocked: false,
          violationCount: 0,
          events: [],
          blockedAt: null,
        },
      }
    );

    // 3. Clear blocked state on ExamSubmissions
    await ExamSubmission.updateMany(
      { userId, isBlocked: true },
      {
        $set: {
          isBlocked: false,
          violationsCount: 0,
          unblockedAt: new Date(),
        },
      }
    );

    // 4. Invalidate auth cache
    invalidateUserCache(userId);

    return {
      isBlocked: false,
      autoUnblocked: true,
      isSuperDream: false,
      hasTimer: false,
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: null,
      user: { ...user, isProctoringBlocked: false, proctoringBlockedAt: null, proctoringBlockTrack: "classic" },
    };
  }

  // Classic track still within the 30-minute window
  const remainingMs = Math.max(0, PROCTORING_BLOCK_DURATION_MS - elapsed);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingMinutes = Math.ceil(remainingMs / 60000);

  return {
    isBlocked: true,
    autoUnblocked: false,
    isSuperDream: false,
    hasTimer: true,
    remainingMs,
    remainingSeconds,
    remainingMinutes,
    blockedAt: user.proctoringBlockedAt || new Date(blockedAtTime),
    user,
  };
}

/**
 * Blocks a student for proctoring violations.
 *
 * @param {string|object} userId
 * @param {"classic"|"super_dream"} track
 * @returns {Promise<{ isBlocked: boolean, isSuperDream: boolean, hasTimer: boolean, blockedAt: Date, remainingSeconds: number }>}
 */
async function blockUserForProctoring(userId, track = "classic") {
  const blockedAt = new Date();
  const normalizedTrack = track === "super_dream" ? "super_dream" : "classic";
  const isSuperDream = normalizedTrack === "super_dream";

  await User.findByIdAndUpdate(userId, {
    $set: {
      isProctoringBlocked: true,
      proctoringBlockedAt: blockedAt,
      proctoringBlockTrack: normalizedTrack,
    },
  });

  invalidateUserCache(userId);

  return {
    isBlocked: true,
    isSuperDream,
    hasTimer: !isSuperDream,
    blockedAt,
    remainingMs: isSuperDream ? 0 : PROCTORING_BLOCK_DURATION_MS,
    remainingSeconds: isSuperDream ? 0 : Math.ceil(PROCTORING_BLOCK_DURATION_MS / 1000),
    remainingMinutes: isSuperDream ? 0 : 30,
  };
}

module.exports = {
  PROCTORING_BLOCK_DURATION_MS,
  evaluateAndAutoUnblockUser,
  blockUserForProctoring,
};
