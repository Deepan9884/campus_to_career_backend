const User = require("../models/User.model");
const ProctoringViolation = require("../models/ProctoringViolation.model");
const ExamSubmission = require("../models/ExamSubmission.model");
const { invalidateUserCache } = require("../middleware/auth.middleware");

// Standard anti-cheat block duration: 30 minutes
const PROCTORING_BLOCK_DURATION_MS = 30 * 60 * 1000;

/**
 * Evaluates whether a candidate is proctoring-blocked.
 * If 30 minutes have elapsed since `proctoringBlockedAt`, automatically clears
 * the block (Classic 30-Minute Auto-Unblock) across User, ProctoringViolation,
 * and ExamSubmission models, and invalidates the cached session.
 *
 * @param {import("mongoose").Document|string|object} userOrId
 * @returns {Promise<{
 *   isBlocked: boolean,
 *   autoUnblocked: boolean,
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
  if (!user || user.isProctoringBlocked === undefined) {
    user = await User.findById(userId)
      .select("name email assignedMentor isProctoringBlocked proctoringBlockedAt")
      .lean();
  }

  if (!user) {
    return {
      isBlocked: false,
      autoUnblocked: false,
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
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: null,
      user,
    };
  }

  // Calculate elapsed duration
  const blockedAtTime = user.proctoringBlockedAt
    ? new Date(user.proctoringBlockedAt).getTime()
    : Date.now();
  const elapsed = Date.now() - blockedAtTime;

  // ── CLASSIC AUTO-UNBLOCK IN 30 MINUTES ────────────────────────────────────
  if (elapsed >= PROCTORING_BLOCK_DURATION_MS) {
    console.log(
      `[Proctoring] 30-minute block duration expired for user ${userId}. Executing classic auto-unblock.`
    );

    // 1. Reset User block state
    await User.findByIdAndUpdate(userId, {
      $set: {
        isProctoringBlocked: false,
        proctoringBlockedAt: null,
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
      remainingMs: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      blockedAt: null,
      user: { ...user, isProctoringBlocked: false, proctoringBlockedAt: null },
    };
  }

  // Still blocked within the 30-minute window
  const remainingMs = Math.max(0, PROCTORING_BLOCK_DURATION_MS - elapsed);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingMinutes = Math.ceil(remainingMs / 60000);

  return {
    isBlocked: true,
    autoUnblocked: false,
    remainingMs,
    remainingSeconds,
    remainingMinutes,
    blockedAt: user.proctoringBlockedAt || new Date(blockedAtTime),
    user,
  };
}

/**
 * Blocks a student for proctoring violations and sets `proctoringBlockedAt = new Date()`.
 *
 * @param {string|object} userId
 * @returns {Promise<{ isBlocked: boolean, blockedAt: Date, remainingSeconds: number }>}
 */
async function blockUserForProctoring(userId) {
  const blockedAt = new Date();
  await User.findByIdAndUpdate(userId, {
    $set: {
      isProctoringBlocked: true,
      proctoringBlockedAt: blockedAt,
    },
  });

  invalidateUserCache(userId);

  return {
    isBlocked: true,
    blockedAt,
    remainingMs: PROCTORING_BLOCK_DURATION_MS,
    remainingSeconds: Math.ceil(PROCTORING_BLOCK_DURATION_MS / 1000),
    remainingMinutes: 30,
  };
}

module.exports = {
  PROCTORING_BLOCK_DURATION_MS,
  evaluateAndAutoUnblockUser,
  blockUserForProctoring,
};
