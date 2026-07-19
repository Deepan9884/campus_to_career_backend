const ActivityLog = require("../models/ActivityLog.model");
const Badge = require("../models/Badge.model");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Evaluate and create newly earned badges for a given user.
 * This function is idempotent due to Badge unique index on { userId, badgeId }.
 *
 * Badge definitions (exact):
 *  - "First Steps": first ActivityLog entry of any module
 *  - "Resume Ready": first resume analysis completed
 *  - "Interview Warmup": 3 interviews completed
 *  - "Interview Pro": 10 interviews completed
 *  - "Code Explorer": first GitHub analysis completed
 *  - "Gap Closer": first skill gap analysis completed
 *  - "Roadmap Builder": first learning roadmap generated
 *  - "Quiz Streak": 5 quizzes passed
 *  - "High Scorer": any module result with score >= 90%
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @returns {Promise<{ created: string[], skipped: string[] }>}
 */
async function checkBadges(userId) {
    const created = [];
    const skipped = [];

    // Pull activity logs once to compute all conditions
    const logs = await ActivityLog.find({ user: userId })
        .sort({ createdAt: 1 })
        .lean();

    const getFirstLogForModule = (module) => logs.find((l) => l.module === module) || null;

    const firstActivityLog = logs.length > 0 ? logs[0] : null;

    const firstStepsEarned = Boolean(firstActivityLog);

    // Resume Ready
    const resumeLog = logs.find((l) => l.module === "resume" && l.action === "analysis_completed") || null;
    const resumeReadyEarned = Boolean(resumeLog);

    // Interviews
    const interviewsCompletedCount = logs.filter(
        (l) => l.module === "interview" && l.action === "interview_finished",
    ).length;

    const interviewWarmupEarned = interviewsCompletedCount >= 3;
    const interviewProEarned = interviewsCompletedCount >= 10;

    // GitHub
    const githubFirst = getFirstLogForModule("github") && logs.find((l) => l.module === "github" && l.action === "repo_analyzed");
    const codeExplorerEarned = Boolean(githubFirst);

    // Skill gap
    const gapFirst = logs.find((l) => l.module === "skill_gap" && l.action === "gap_analyzed");
    const gapCloserEarned = Boolean(gapFirst);

    // Roadmap
    const roadmapFirst = logs.find((l) => l.module === "roadmap" && l.action === "roadmap_generated");
    const roadmapBuilderEarned = Boolean(roadmapFirst);

    // Quiz streak (passed quizzes)
    const quizPassedCount = logs.filter(
        (l) => l.module === "quiz" && l.action === "quiz_passed",
    ).length;
    const quizStreakEarned = quizPassedCount >= 5;

    // High Scorer: any module result with score >= 90%
    const highScorerLog = logs.find((l) => {
        const score = l?.metadata?.score;
        return typeof score === "number" && score >= 90;
    });
    const highScorerEarned = Boolean(highScorerLog);

    const candidates = [];

    if (firstStepsEarned) candidates.push({ badgeId: "First Steps", earnedAt: firstActivityLog.createdAt });
    if (resumeReadyEarned) candidates.push({ badgeId: "Resume Ready", earnedAt: resumeLog.createdAt });
    if (interviewWarmupEarned) {
        const firstWarmupLog = logs
            .filter((l) => l.module === "interview" && l.action === "interview_finished")
            .slice(0, 3)
            .pop();
        candidates.push({ badgeId: "Interview Warmup", earnedAt: firstWarmupLog.createdAt });
    }
    if (interviewProEarned) {
        const firstProLog = logs
            .filter((l) => l.module === "interview" && l.action === "interview_finished")
            .slice(0, 10)
            .pop();
        candidates.push({ badgeId: "Interview Pro", earnedAt: firstProLog.createdAt });
    }
    if (codeExplorerEarned) candidates.push({ badgeId: "Code Explorer", earnedAt: githubFirst.createdAt });
    if (gapCloserEarned) candidates.push({ badgeId: "Gap Closer", earnedAt: gapFirst.createdAt });
    if (roadmapBuilderEarned) candidates.push({ badgeId: "Roadmap Builder", earnedAt: roadmapFirst.createdAt });
    if (quizStreakEarned) {
        const firstStreakLog = logs
            .filter((l) => l.module === "quiz" && l.action === "quiz_passed")
            .slice(0, 5)
            .pop();
        candidates.push({ badgeId: "Quiz Streak", earnedAt: firstStreakLog.createdAt });
    }
    if (highScorerEarned) candidates.push({ badgeId: "High Scorer", earnedAt: highScorerLog.createdAt });

    // Create badges (skip duplicates via unique index)
    // We'll attempt creates in parallel but safely.
    await Promise.all(
        candidates.map(async (c) => {
            try {
                await Badge.create({
                    userId,
                    badgeId: c.badgeId,
                    earnedAt: c.earnedAt,
                });
                created.push(c.badgeId);
            } catch (err) {
                // Duplicate key -> already exists
                if (err && (err.code === 11000 || (err.message || "").includes("duplicate key"))) {
                    skipped.push(c.badgeId);
                    return;
                }
                // Any other error should not crash whole flow
                console.error("[badge.service] badge create failed:", err?.message || err);
            }
        }),
    );

    return { created: Array.from(new Set(created)), skipped: Array.from(new Set(skipped)) };
}

module.exports = { checkBadges };
