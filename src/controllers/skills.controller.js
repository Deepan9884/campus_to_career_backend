const UserSkill = require("../models/UserSkill.model");
const RoleSkill = require("../models/RoleSkill.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const Event = require("../models/Event.model");
const CodingProfile = require("../models/CodingProfile.model");
const githubService = require("../services/github.service");
const githubBudget = require("../services/githubBudget.service");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const { fetchLeetCodeStats } = require("../services/coding/leetcode.service");
const { fetchCodeChefStats } = require("../services/coding/codechef.service");
const { fetchHackerRankStats } = require("../services/coding/hackerrank.service");
const { fetchGfgStats } = require("../services/coding/gfg.service");

const PLATFORM_TO_FETCHER = {
  leetcode: fetchLeetCodeStats,
  codechef: fetchCodeChefStats,
  hackerrank: fetchHackerRankStats,
  gfg: fetchGfgStats,
};

// ── Available roles ──

const getAvailableRoles = asyncHandler(async (_req, res) => {
  const roles = await RoleSkill.distinct("targetRole");
  return ApiResponse.success({ roles }).send(res);
});

// ── Self-reported skills ──

const addSkill = asyncHandler(async (req, res) => {
  const { name, level } = req.body;

  const existing = await UserSkill.findOne({
    user: req.user._id,
    name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (existing) {
    existing.level = level;
    await existing.save();
    return ApiResponse.success(existing, "Skill updated").send(res);
  }

  const skill = await UserSkill.create({
    user: req.user._id,
    name,
    level,
    source: "self-reported",
  });

  return ApiResponse.created(skill).send(res);
});

const getCurrentSkills = asyncHandler(async (req, res) => {
  const skills = await UserSkill.find({ user: req.user._id }).sort({ createdAt: -1 });
  return ApiResponse.success({ skills }).send(res);
});

const deleteSkill = asyncHandler(async (req, res) => {
  const skill = await UserSkill.findById(req.params.id);

  if (!skill || skill.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Skill not found");
  }

  await UserSkill.findByIdAndDelete(req.params.id);
  return ApiResponse.success(null, "Skill deleted").send(res);
});

// ── Suggestions from existing data ──

const getSuggestions = asyncHandler(async (req, res) => {
  const { targetRole } = req.query;
  const suggestions = [];
  const existingSkillNames = (
    await UserSkill.find({ user: req.user._id }).select("name").lean()
  ).map((s) => s.name.toLowerCase());

  // 0. Role-based suggestions (if targetRole provided)
  if (targetRole) {
    const roleSkills = await RoleSkill.find({ targetRole }).lean();
    for (const rs of roleSkills) {
      if (
        !existingSkillNames.includes(rs.skillName.toLowerCase()) &&
        !suggestions.some((s) => s.name.toLowerCase() === rs.skillName.toLowerCase())
      ) {
        suggestions.push({ source: "role", name: rs.skillName });
      }
    }
  }

  // 1. Resume keywords
  const latestResume = await Resume.findOne({
    user: req.user._id,
    status: "completed",
  })
    .sort({ createdAt: -1 })
    .lean();

  if (latestResume?.keywordBreakdown?.matched) {
    for (const kw of latestResume.keywordBreakdown.matched) {
      if (
        !existingSkillNames.includes(kw.toLowerCase()) &&
        !suggestions.some((s) => s.name.toLowerCase() === kw.toLowerCase())
      ) {
        suggestions.push({ source: "resume", name: kw });
      }
    }
  }

  // 2. GitHub languages
  if (req.user.githubUsername) {
    try {
      const budgetCheck = githubBudget.checkBudget(1);
      if (budgetCheck.allowed) {
        const repos = await githubService.listPublicRepos(req.user.githubUsername);
        const languages = [...new Set(repos.map((r) => r.language).filter(Boolean))];
        for (const lang of languages) {
          if (
            !existingSkillNames.includes(lang.toLowerCase()) &&
            !suggestions.some((s) => s.name.toLowerCase() === lang.toLowerCase())
          ) {
            suggestions.push({ source: "github", name: lang });
          }
        }
      }
    } catch {
      // GitHub API unavailable — return other suggestions only
    }
  }

  return ApiResponse.success({ suggestions }).send(res);
});

// ── Gap analysis ──

function buildGapAnalysisPrompt(userSkillNames, bankSkills, eventSkillNames = []) {
  const bankList = bankSkills
    .map((s) => `- "${s.skillName}" (${s.category}, ${s.importance})`)
    .join("\n");

  let eventSection = "";
  if (eventSkillNames.length > 0) {
    eventSection = `The following skills were demonstrated through verified hackathon/ideathon participation, not just self-reported: ${eventSkillNames.join(", ")}. Where relevant, call out this hands-on, real-world evidence as a specific strength in your recommendations — it carries more weight than a self-reported skill of the same name.

`;
  }

  return `You are a career skills matcher. Given a user's current skills and a required skill bank for a target role, determine which bank skills the user's skills correspond to.

User's current skills (as typed by the user):
${userSkillNames.map((s) => `- "${s}"`).join("\n")}

Required skill bank for this role:
${bankList}

${eventSection}Instructions:
- Match user skills to bank skills using fuzzy matching (e.g. "React.js" matches "React", "JS" matches "JavaScript", "K8s" matches "Kubernetes").
- ONLY return matchedSkills values that exist verbatim in the bank list above. Do NOT invent skill names.
- Generate 2-4 short, actionable recommendations for closing the most important gaps.

Respond with a JSON object:
{
  "matchedSkills": ["skill name from bank", ...],
  "recommendations": ["actionable recommendation string", ...] 
}`;
}

function computeMatchPercentage(matchedSkills, bankSkills) {
  const coreSkills = bankSkills.filter((s) => s.importance === "core");
  if (coreSkills.length === 0) return 0;

  const matchedCoreCount = coreSkills.filter((s) =>
    matchedSkills.includes(s.skillName),
  ).length;

  return Math.round((matchedCoreCount / coreSkills.length) * 100);
}

const analyzeGap = asyncHandler(async (req, res) => {
  const { targetRole } = req.body;

  // Validate targetRole exists in bank
  const bankSkills = await RoleSkill.find({ targetRole }).lean();
  if (bankSkills.length === 0) {
    throw ApiError.badRequest(
      `No skill bank entries found for "${targetRole}". Available roles can be seeded via the seed script.`,
    );
  }

  // Get user's current skills
  const userSkills = await UserSkill.find({ user: req.user._id }).lean();
  const userSkillNames = userSkills.map((s) => s.name);

  if (userSkillNames.length === 0) {
    throw ApiError.badRequest(
      "You have no skills listed. Add some skills first via POST /api/skills/current.",
    );
  }

  // Create analysis doc
  const analysis = await SkillGapAnalysis.create({
    user: req.user._id,
    targetRole,
    status: "completed",
  });

  // Compute event-verified skill names for prompt framing
  const eventSkillNames = userSkills.filter(s => s.source === "event").map(s => s.name);

  // Try Gemini for fuzzy matching
  let matchedSkills = [];
  let recommendations = null;
  let geminiFailed = false;

  try {
    const prompt = buildGapAnalysisPrompt(userSkillNames, bankSkills, eventSkillNames);
    const responseSchema = {
      type: "object",
      properties: {
        matchedSkills: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
      },
      required: ["matchedSkills", "recommendations"],
    };

    const aiResult = await aiService.generateContent({
      prompt,
      responseSchema,
      feature: "skill-gap-matching",
      userId: req.user._id,
    });

    if (aiResult.success && aiResult.data) {
      // Filter matchedSkills to only bank values
      const bankSkillNames = bankSkills.map((s) => s.skillName);
      matchedSkills = (aiResult.data.matchedSkills || []).filter((name) =>
        bankSkillNames.includes(name),
      );
      recommendations = aiResult.data.recommendations || null;
    } else {
      geminiFailed = true;
    }
  } catch {
    geminiFailed = true;
  }

  // Fallback: case-insensitive exact matching
  if (matchedSkills.length === 0) {
    const bankSkillNames = bankSkills.map((s) => s.skillName);
    const userLower = userSkillNames.map((s) => s.toLowerCase());
    matchedSkills = bankSkillNames.filter((bankName) =>
      userLower.includes(bankName.toLowerCase()),
    );
  }

  // Build matchedSkillsDetail from userSkills
  const matchedSkillsDetail = matchedSkills.map(name => {
    const userSkill = userSkills.find(
      us => us.name.toLowerCase() === name.toLowerCase()
    );
    return {
      name,
      source: userSkill ? userSkill.source : "self-reported",
      level: userSkill ? userSkill.level : "beginner",
    };
  });

  const eventVerifiedSkillCount = matchedSkillsDetail.filter(s => s.source === "event").length;

  // Compute gaps (bank skills not matched)
  const gaps = bankSkills
    .filter((s) => !matchedSkills.includes(s.skillName))
    .map((s) => ({ skillName: s.skillName, importance: s.importance }));

  // Compute match percentage (core skills only)
  const matchPercentage = computeMatchPercentage(matchedSkills, bankSkills);

  // Update analysis doc
  analysis.matchedSkills = matchedSkills;
  analysis.matchedSkillsDetail = matchedSkillsDetail;
  analysis.eventVerifiedSkillCount = eventVerifiedSkillCount;
  analysis.gaps = gaps;
  analysis.matchPercentage = matchPercentage;
  analysis.recommendations = recommendations;
  if (geminiFailed && matchedSkills.length > 0) {
    analysis.recommendations = analysis.recommendations || [];
  }
  await analysis.save();

  const notificationPromise = notificationService.createNotification({
    userId: req.user._id,
    module: "skill_gap",
    type: "skill_gap_analysis_complete",
    title: "Skill gap analysis complete",
    message: `Your skill gap analysis for ${targetRole} is ready — ${matchPercentage}% match`,
    relatedResourceId: analysis._id,
    relatedResourceType: "SkillGapAnalysis",
  });

  const activityLogPromise = activityLogService.logActivity({
    userId: req.user._id,
    module: "skill_gap",
    action: "gap_analyzed",
    summary: `Skill gap analysis for ${targetRole} — ${matchPercentage}% match`,
    relatedResourceId: analysis._id,
    relatedResourceType: "SkillGapAnalysis",
    metadata: { targetRole, matchPercentage, gapsCount: gaps.length },
  });

  const badgesPromise = badgeService.checkBadges(req.user._id);

  await Promise.allSettled([notificationPromise, activityLogPromise, badgesPromise]).then((results) => {
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        const serviceName =
          idx === 0 ? "NotificationService" : idx === 1 ? "ActivityLogService" : "BadgeService";
        console.error(`[Background Task] ${serviceName} promise rejected in analyzeSkills:`, result.reason);
      }
    });
  });

  return ApiResponse.success(analysis).send(res);
});

// ── History ──

const getGapHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [analyses, total] = await Promise.all([
    SkillGapAnalysis.find({ user: req.user._id })
      .select("targetRole matchPercentage status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SkillGapAnalysis.countDocuments({ user: req.user._id }),
  ]);

  return ApiResponse.success({
    analyses,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }).send(res);
});

const getGapById = asyncHandler(async (req, res) => {
  const analysis = await SkillGapAnalysis.findById(req.params.id);

  if (!analysis || analysis.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Analysis not found");
  }

  return ApiResponse.success(analysis).send(res);
});

const deleteGapAnalysis = asyncHandler(async (req, res) => {
  const analysis = await SkillGapAnalysis.findById(req.params.id);

  await SkillGapAnalysis.findByIdAndDelete(req.params.id);
  return ApiResponse.success(null, "Analysis deleted").send(res);
});

const getLatestAnalysis = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [
    latestAnalysis,
    userSkills,
    latestResume,
    interviews,
    repoCount,
    events,
    codingProfiles,
  ] = await Promise.all([
    SkillGapAnalysis.findOne({ user: userId, status: "completed" }).sort({ createdAt: -1 }),
    UserSkill.find({ user: userId }).lean(),
    Resume.findOne({ user: userId, status: "completed" }).sort({ createdAt: -1 }).lean(),
    InterviewSession.find({ user: userId, status: "completed" }).select("overallScore").lean(),
    RepoAnalysis.countDocuments({ user: userId, status: "completed" }),
    Event.find({ user: userId }).select("verificationResult result").lean(),
    CodingProfile.find({ userId: userId }).lean(),
  ]);

  // Detailed Per-Platform Breakdown for Coding Platforms Analysis
  const platformBreakdown = await Promise.all(
    codingProfiles.map(async (cp) => {
      const platform = cp.platform;
      let cpDoc = cp;

      // On-the-fly fetch if cachedStats is null or missing
      if (!cpDoc.cachedStats && cpDoc.username) {
        try {
          const fetcher = PLATFORM_TO_FETCHER[platform];
          if (fetcher) {
            const stats = await fetcher(cpDoc.username);
            const updated = await CodingProfile.findOneAndUpdate(
              { _id: cpDoc._id },
              { $set: { cachedStats: stats, lastFetchedAt: new Date() } },
              { new: true }
            ).lean();
            if (updated) cpDoc = updated;
          }
        } catch (err) {
          console.error(`On-the-fly live fetch failed for ${platform}:`, err.message);
        }
      }

      const stats = cpDoc.cachedStats || {};

      let totalSolved = Number(
        stats.totalSolved ?? stats.solved ?? stats.problemsSolved ?? stats.solvedCount ?? 0
      );

      let easySolved = Number(
        stats.easySolved ?? stats.byDifficulty?.Easy ?? (totalSolved > 0 ? Math.round(totalSolved * 0.5) : 0)
      );
      let mediumSolved = Number(
        stats.mediumSolved ?? stats.byDifficulty?.Medium ?? (totalSolved > 0 ? Math.round(totalSolved * 0.35) : 0)
      );
      let hardSolved = Number(
        stats.hardSolved ?? stats.byDifficulty?.Hard ?? (totalSolved > 0 ? Math.round(totalSolved * 0.15) : 0)
      );

      let rating = Number(stats.currentRating || stats.rating || stats.codingScore || stats.totalStars || 0);
      let rank = stats.globalRank || stats.overallRank || stats.stars || null;

      return {
        platform,
        username: cpDoc.username,
        profileUrl: cpDoc.profileUrl,
        lastFetchedAt: cpDoc.lastFetchedAt,
        totalSolved,
        easySolved,
        mediumSolved,
        hardSolved,
        rating,
        rank,
        rawStats: stats,
      };
    })
  );

  let totalProblemsSolved = platformBreakdown.reduce((acc, p) => acc + p.totalSolved, 0);
  const totalEasySolved = platformBreakdown.reduce((acc, p) => acc + p.easySolved, 0);
  const totalMediumSolved = platformBreakdown.reduce((acc, p) => acc + p.mediumSolved, 0);
  const totalHardSolved = platformBreakdown.reduce((acc, p) => acc + p.hardSolved, 0);
  const linkedPlatformsCount = platformBreakdown.length;

  const codingPlatformAnalysis = {
    linkedPlatformsCount,
    totalProblemsSolved,
    totalEasySolved,
    totalMediumSolved,
    totalHardSolved,
    platforms: platformBreakdown,
    summaryRecommendation:
      linkedPlatformsCount === 0
        ? "No coding profiles linked yet. Connect LeetCode or CodeChef in Settings or Coding Platforms page to track live problem solving telemetry."
        : totalMediumSolved + totalHardSolved < 10
        ? "Good foundation! Focus on solving more Medium & Hard difficulty problems to sharpen algorithm mastery for technical interviews."
        : "Excellent problem-solving volume! Maintain consistent weekly practice across your linked profiles.",
  };

  let avgInterviewScore = 0;
  if (interviews.length > 0) {
    const sum = interviews.reduce((acc, i) => acc + (i.overallScore || 0), 0);
    avgInterviewScore = Math.round(sum / interviews.length);
  }

  const totalEventsCount = events.length;
  const verifiedEventsCount = events.filter(
    (e) => e.verificationResult?.isVerified || e.result === "winner" || e.result === "runner-up" || e.result === "finalist"
  ).length;

  const skillGapMatchPct = latestAnalysis ? latestAnalysis.matchPercentage : (userSkills.length > 0 ? Math.min(100, userSkills.length * 15) : 0);
  const resumeScore = latestResume ? (latestResume.atsScore || 0) : 0;
  const codingScore = Math.min(100, Math.round((totalProblemsSolved * 1.0) + (repoCount * 10)));
  const eventScore = Math.min(100, Math.round((verifiedEventsCount * 30) + (totalEventsCount * 10)));

  const overallReadinessPct = Math.round(
    (skillGapMatchPct * 0.30) +
    (resumeScore * 0.20) +
    (avgInterviewScore * 0.20) +
    (codingScore * 0.15) +
    (eventScore * 0.15)
  );

  const liveStrategy = [];
  if (skillGapMatchPct < 70) {
    liveStrategy.push({
      type: "skill",
      title: "Close Skill Gaps",
      description: latestAnalysis?.gaps?.[0] ? `Target skill: ${latestAnalysis.gaps[0].skillName}` : "Add and verify your core technical skills.",
      impact: "+15% Readiness",
    });
  }
  if (resumeScore < 75) {
    liveStrategy.push({
      type: "resume",
      title: "Optimize ATS Resume",
      description: latestResume ? `Latest ATS match is ${latestResume.atsScore}%. Add quantified achievements.` : "Analyze your resume to boost ATS compatibility.",
      impact: "+20% Readiness",
    });
  }
  if (interviews.length < 2 || avgInterviewScore < 75) {
    liveStrategy.push({
      type: "interview",
      title: "Practice AI Mock Interviews",
      description: interviews.length === 0 ? "Take your first mock interview." : `Avg score is ${avgInterviewScore}%. Take another mock interview to boost confidence.`,
      impact: "+20% Readiness",
    });
  }
  if (totalProblemsSolved < 20) {
    liveStrategy.push({
      type: "coding",
      title: "Solve Coding Problems",
      description: `Solved ${totalProblemsSolved} problems so far. Link LeetCode/CodeChef to track live coding progress.`,
      impact: "+15% Readiness",
    });
  }
  if (totalEventsCount === 0) {
    liveStrategy.push({
      type: "event",
      title: "Participate in Hackathons & Events",
      description: "Submit certificates & project proofs from hackathons or ideathons to gain verified proof of work.",
      impact: "+15% Readiness",
    });
  }

  return ApiResponse.success({
    analysis: latestAnalysis || null,
    growthMetrics: {
      overallReadinessPct,
      skillGapMatchPct,
      resumeScore,
      avgInterviewScore,
      codingScore,
      eventScore,
      totalProblemsSolved,
      repoCount,
      totalEventsCount,
      verifiedEventsCount,
      interviewsCount: interviews.length,
      userSkillsCount: userSkills.length,
      liveStrategy,
      codingPlatformAnalysis,
    },
  }).send(res);
});

module.exports = {
  getAvailableRoles,
  addSkill,
  getCurrentSkills,
  deleteSkill,
  getSuggestions,
  analyzeGap,
  getGapHistory,
  getGapById,
  deleteGapAnalysis,
  getLatestAnalysis,
  buildGapAnalysisPrompt,
};
