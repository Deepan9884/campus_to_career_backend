const ActivityLog = require("../models/ActivityLog.model");
const Badge = require("../models/Badge.model");
const User = require("../models/User.model");
const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const UserSkill = require("../models/UserSkill.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const CodingProfile = require("../models/CodingProfile.model");
const LearningRoadmap = require("../models/LearningRoadmap.model");
const { calculateStudentReadiness } = require("./careerReadiness.service");

/**
 * 12 Authoritative Unified Placement Badges & Trophies
 * Evaluates live database metrics across Resume, Interview, Skills, Projects, and Readiness.
 * 
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @returns {Promise<{
 *   badges: Array<any>,
 *   achievements: Array<any>,
 *   summary: { earnedCount: number, totalCount: number, percentage: number }
 * }>}
 */
async function evaluateUserBadges(userId) {
  const [
    user,
    resumes,
    interviews,
    userSkills,
    gapAnalyses,
    repoCount,
    codingProfiles,
    roadmapCount,
    readinessData,
  ] = await Promise.all([
    User.findById(userId).select("createdAt").lean().catch(() => null),
    Resume.find({ user: userId, status: { $ne: "failed" } })
      .select("atsScore createdAt")
      .sort({ createdAt: 1 })
      .lean()
      .catch(() => []),
    InterviewSession.find({ user: userId, status: { $ne: "failed" } })
      .select("overallScore createdAt")
      .sort({ createdAt: 1 })
      .lean()
      .catch(() => []),
    UserSkill.find({ user: userId }).select("createdAt").lean().catch(() => []),
    SkillGapAnalysis.find({ user: userId, status: { $ne: "failed" } })
      .select("createdAt")
      .lean()
      .catch(() => []),
    RepoAnalysis.countDocuments({ user: userId, status: { $ne: "failed" } }).catch(() => 0),
    CodingProfile.find({ user: userId }).lean().catch(() => []),
    LearningRoadmap.countDocuments({ user: userId, status: { $ne: "failed" } }).catch(() => 0),
    calculateStudentReadiness(userId).catch(() => ({ overall: 70 })),
  ]);

  const bestResumeScore = resumes.length
    ? Math.max(...resumes.map((r) => (typeof r.atsScore === "number" ? r.atsScore : 0)))
    : 0;
  const bestInterviewScore = interviews.length
    ? Math.max(...interviews.map((i) => (typeof i.overallScore === "number" ? i.overallScore : 0)))
    : 0;
  const overallReadiness = readinessData?.overall || 0;
  const codingProfilesCount = Array.isArray(codingProfiles) ? codingProfiles.length : 0;
  const gapCount = Array.isArray(gapAnalyses) ? gapAnalyses.length : 0;
  const skillsCount = Array.isArray(userSkills) ? userSkills.length : 0;
  const resumeCount = Array.isArray(resumes) ? resumes.length : 0;
  const interviewCount = Array.isArray(interviews) ? interviews.length : 0;

  const achievements = [
    {
      id: "first_steps",
      name: "First Steps",
      desc: "Create your student account and initiate your career journey",
      tier: "bronze",
      icon: "GraduationCap",
      category: "Onboarding",
      earned: Boolean(user),
      progress: 100,
      metricLabel: "Account Active",
      currentValue: 1,
      targetValue: 1,
    },
    {
      id: "first_resume",
      name: "First Resume",
      desc: "Upload and analyze your first resume",
      tier: "bronze",
      icon: "FileText",
      category: "Resume",
      earned: resumeCount >= 1,
      progress: resumeCount >= 1 ? 100 : 0,
      metricLabel: "Resumes Uploaded",
      currentValue: resumeCount,
      targetValue: 1,
    },
    {
      id: "score_80",
      name: "Score Above 80",
      desc: "Reach an 80+ score on ATS resume review or mock interview",
      tier: "gold",
      icon: "Award",
      category: "Excellence",
      earned: bestResumeScore >= 80 || bestInterviewScore >= 80,
      progress: Math.min(100, Math.round((Math.max(bestResumeScore, bestInterviewScore) / 80) * 100)),
      metricLabel: "Top Assessment Score",
      currentValue: Math.max(bestResumeScore, bestInterviewScore),
      targetValue: 80,
    },
    {
      id: "interview_rookie",
      name: "Interview Rookie",
      desc: "Complete your first AI mock interview session",
      tier: "bronze",
      icon: "Mic",
      category: "Interview",
      earned: interviewCount >= 1,
      progress: interviewCount >= 1 ? 100 : 0,
      metricLabel: "Mock Interviews",
      currentValue: interviewCount,
      targetValue: 1,
    },
    {
      id: "interview_5",
      name: "Interview Veteran",
      desc: "Complete 5 mock interview practice sessions",
      tier: "silver",
      icon: "UserCheck",
      category: "Interview",
      earned: interviewCount >= 5,
      progress: Math.min(100, Math.round((interviewCount / 5) * 100)),
      metricLabel: "Interviews Completed",
      currentValue: interviewCount,
      targetValue: 5,
    },
    {
      id: "star_communicator",
      name: "STAR Communicator",
      desc: "Achieve an interview score of 75+ with structured answers",
      tier: "gold",
      icon: "Sparkles",
      category: "Interview",
      earned: bestInterviewScore >= 75,
      progress: Math.min(100, Math.round((bestInterviewScore / 75) * 100)),
      metricLabel: "Best Interview Score",
      currentValue: bestInterviewScore,
      targetValue: 75,
    },
    {
      id: "skill_explorer",
      name: "Skill Explorer",
      desc: "Add and track at least 5 technical or domain skills",
      tier: "bronze",
      icon: "Target",
      category: "Skills",
      earned: skillsCount >= 5,
      progress: Math.min(100, Math.round((skillsCount / 5) * 100)),
      metricLabel: "Skills Tracked",
      currentValue: skillsCount,
      targetValue: 5,
    },
    {
      id: "gap_closer",
      name: "Gap Closer",
      desc: "Perform a role-based skill gap analysis to benchmark readiness",
      tier: "silver",
      icon: "Compass",
      category: "Skills",
      earned: gapCount >= 1,
      progress: gapCount >= 1 ? 100 : 0,
      metricLabel: "Gap Analyses",
      currentValue: gapCount,
      targetValue: 1,
    },
    {
      id: "skill_collector",
      name: "Skill Collector",
      desc: "Add and track 10+ verified skills on your profile",
      tier: "gold",
      icon: "Layers",
      category: "Skills",
      earned: skillsCount >= 10,
      progress: Math.min(100, Math.round((skillsCount / 10) * 100)),
      metricLabel: "Skills Tracked",
      currentValue: skillsCount,
      targetValue: 10,
    },
    {
      id: "project_pro",
      name: "Project Pro",
      desc: "Analyze code repositories or connect competitive coding profiles",
      tier: "silver",
      icon: "Code2",
      category: "Projects",
      earned: (repoCount + codingProfilesCount) >= 1,
      progress: (repoCount + codingProfilesCount) >= 1 ? 100 : 0,
      metricLabel: "Projects & Profiles",
      currentValue: repoCount + codingProfilesCount,
      targetValue: 1,
    },
    {
      id: "roadmap_builder",
      name: "Career Strategist",
      desc: "Generate a custom milestone learning roadmap for your dream role",
      tier: "silver",
      icon: "Map",
      category: "Planning",
      earned: roadmapCount >= 1,
      progress: roadmapCount >= 1 ? 100 : 0,
      metricLabel: "Roadmaps Created",
      currentValue: roadmapCount,
      targetValue: 1,
    },
    {
      id: "placement_ready",
      name: "Placement Ready",
      desc: "Achieve an overall campus placement readiness rating of 70% or higher",
      tier: "platinum",
      icon: "Crown",
      category: "Readiness",
      earned: overallReadiness >= 70,
      progress: Math.min(100, Math.round((overallReadiness / 70) * 100)),
      metricLabel: "Readiness Rating",
      currentValue: overallReadiness,
      targetValue: 70,
    },
  ];

  // Sync earned badges into MongoDB collection asynchronously / safely
  try {
    const earnedList = achievements.filter((a) => a.earned);
    await Promise.all(
      earnedList.flatMap((a) => [a.id, a.name]).map(async (badgeId) => {
        try {
          await Badge.updateOne(
            { userId, badgeId },
            { $setOnInsert: { userId, badgeId, earnedAt: new Date() } },
            { upsert: true }
          );
        } catch (_) {}
      })
    );
  } catch (err) {
    console.error("[badge.service] Badge sync error:", err?.message || err);
  }

  // Retrieve stored badge documents for this user
  const storedBadges = await Badge.find({ userId }).sort({ earnedAt: -1 }).lean().catch(() => []);

  const earnedCount = achievements.filter((a) => a.earned).length;
  const totalCount = achievements.length;

  return {
    badges: storedBadges,
    achievements,
    summary: {
      earnedCount,
      totalCount,
      percentage: Math.round((earnedCount / totalCount) * 100),
    },
  };
}

/**
 * Legacy wrapper for BullMQ background workers and activity triggers.
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @returns {Promise<{ created: string[], skipped: string[] }>}
 */
async function checkBadges(userId) {
  const result = await evaluateUserBadges(userId);
  const earnedNames = result.achievements.filter((a) => a.earned).map((a) => a.name);
  return {
    created: earnedNames,
    skipped: [],
  };
}

module.exports = {
  evaluateUserBadges,
  checkBadges,
};
