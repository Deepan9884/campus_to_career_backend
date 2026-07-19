const Resume = require("../models/Resume.model");
const Interview = require("../models/Interview.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const UserSkill = require("../models/UserSkill.model");
const RoleSkill = require("../models/RoleSkill.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const LearningRoadmap = require("../models/LearningRoadmap.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");

const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();

  const [
    resumes,
    interviews,
    repoCount,
    userSkills,
    latestGapAnalysis,
  ] = await Promise.all([
    Resume.find({ user: userId, status: "completed" })
      .select("atsScore createdAt")
      .sort({ createdAt: 1 })
      .lean(),
    Interview.find({ user: userId, status: "completed" })
      .select("overallScore domain createdAt")
      .sort({ createdAt: 1 })
      .lean(),
    RepoAnalysis.countDocuments({ user: userId, status: "completed" }),
    UserSkill.find({ user: userId }).select("name level").lean(),
    SkillGapAnalysis.findOne({ user: userId, status: "completed" })
      .select("targetRole matchedSkills gaps matchPercentage")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // Resume trend: group by date
  const resumeTrend = resumes.map((r) => ({
    date: formatDate(r.createdAt),
    score: r.atsScore,
  }));

  // Interview trend: each session
  const interviewTrend = interviews.map((i, idx) => ({
    name: `Int ${idx + 1}`,
    score: i.overallScore,
    type: i.domain || "General",
  }));

  // Skill radar: from role skill bank + user skills
  const skillRadar = await buildSkillRadar(userId, latestGapAnalysis);

  // Feature usage: count across all collections
  const featureUsage = [
    { name: "Resume", value: resumes.length },
    { name: "Interview", value: interviews.length },
    { name: "Projects", value: repoCount },
    { name: "Skills", value: userSkills.length },
  ];

  // Achievements
  const achievements = computeAchievements(resumes, interviews, repoCount, userSkills.length);

  // Overview stats
  const daysOnPlatform = Math.max(
    1,
    Math.ceil((now.getTime() - new Date(req.user.createdAt).getTime()) / 86400000),
  );
  const featuresUsed = featureUsage.filter((f) => f.value > 0).length;
  const readiness = latestGapAnalysis?.matchPercentage || 0;

  // Activity timeline (latest 8 items across all modules)
  const activities = await buildActivityTimeline(userId);

  return ApiResponse.success({
    overview: {
      readiness,
      daysOnPlatform,
      featuresUsed,
      totalFeatures: 5,
    },
    resumeTrend,
    interviewTrend,
    skillRadar,
    featureUsage,
    achievements,
    activities,
  }).send(res);
});

async function buildSkillRadar(userId, gapAnalysis) {
  if (!gapAnalysis?.targetRole) return [];

  const bankSkills = await RoleSkill.find({
    targetRole: gapAnalysis.targetRole,
  })
    .select("skillName importance")
    .lean();

  if (bankSkills.length === 0) return [];

  const userSkillNames = (
    await UserSkill.find({ user: userId }).select("name").lean()
  ).map((s) => s.name.toLowerCase());

  return bankSkills.map((b) => ({
    skill: b.skillName,
    current: userSkillNames.includes(b.skillName.toLowerCase())
      ? gapAnalysis.matchPercentage || 50
      : 0,
    target: b.importance === "core" ? 85 : 65,
  }));
}

function computeAchievements(resumes, interviews, repoCount, skillCount) {
  const hasResume = resumes.length > 0;
  const hasInterview = interviews.length > 0;
  const bestResumeScore = resumes.length > 0
    ? Math.max(...resumes.map((r) => r.atsScore))
    : 0;
  const bestInterviewScore = interviews.length > 0
    ? Math.max(...interviews.map((i) => i.overallScore))
    : 0;

  return [
    {
      name: "First Resume",
      desc: "Upload your first resume",
      earned: hasResume,
      tier: "bronze",
      progress: hasResume ? 100 : 0,
    },
    {
      name: "Interview Rookie",
      desc: "Complete first mock interview",
      earned: hasInterview,
      tier: "bronze",
      progress: hasInterview ? 100 : 0,
    },
    {
      name: "5 Interviews",
      desc: "Complete 5 mock interviews",
      earned: interviews.length >= 5,
      tier: "silver",
      progress: Math.min(100, Math.round((interviews.length / 5) * 100)),
    },
    {
      name: "Score Above 80",
      desc: "Reach an 80+ score on any assessment",
      earned: bestResumeScore >= 80 || bestInterviewScore >= 80,
      tier: "gold",
      progress: Math.min(
        100,
        Math.round((Math.max(bestResumeScore, bestInterviewScore) / 80) * 100),
      ),
    },
    {
      name: "Project Pro",
      desc: "Analyze 10 GitHub repos",
      earned: repoCount >= 10,
      tier: "silver",
      progress: Math.min(100, Math.round((repoCount / 10) * 100)),
    },
    {
      name: "Skill Collector",
      desc: "Add 10 skills to your profile",
      earned: skillCount >= 10,
      tier: "silver",
      progress: Math.min(100, Math.round((skillCount / 10) * 100)),
    },
  ];
}

async function buildActivityTimeline(userId) {
  const [resumes, interviews, gapAnalyses, roadmaps] = await Promise.all([
    Resume.find({ user: userId, status: "completed" })
      .select("atsScore createdAt")
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),
    Interview.find({ user: userId, status: "completed" })
      .select("overallScore domain createdAt")
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),
    SkillGapAnalysis.find({ user: userId, status: "completed" })
      .select("targetRole matchPercentage createdAt")
      .sort({ createdAt: -1 })
      .limit(2)
      .lean(),
    LearningRoadmap.find({ user: userId, status: "completed" })
      .select("targetRole createdAt")
      .sort({ createdAt: -1 })
      .limit(2)
      .lean(),
  ]);

  const items = [];

  for (const r of resumes) {
    items.push({
      type: "resume",
      title: "Resume analyzed",
      desc: `ATS score: ${r.atsScore}`,
      date: r.createdAt,
    });
  }

  for (const i of interviews) {
    items.push({
      type: "interview",
      title: `${i.domain || "Interview"} session`,
      desc: `Scored ${i.overallScore}/100`,
      date: i.createdAt,
    });
  }

  for (const g of gapAnalyses) {
    items.push({
      type: "skill",
      title: "Gap analysis completed",
      desc: `${g.matchPercentage}% match for ${g.targetRole}`,
      date: g.createdAt,
    });
  }

  for (const rm of roadmaps) {
    items.push({
      type: "roadmap",
      title: "Roadmap generated",
      desc: `Learning path for ${rm.targetRole}`,
      date: rm.createdAt,
    });
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, 8).map((a) => ({
    ...a,
    date: formatRelativeTime(a.date),
  }));
}

function formatDate(date) {
  const d = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

function formatRelativeTime(date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

module.exports = { getAnalyticsOverview };
