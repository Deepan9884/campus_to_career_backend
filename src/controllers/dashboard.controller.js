const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const LearningRoadmap = require("../models/LearningRoadmap.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");

const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [
    latestResume,
    resumeCount,
    completedInterviews,
    interviewCount,
    repoCount,
    latestGapAnalysis,
    gapCount,
    roadmapCount,
  ] = await Promise.all([
    Resume.findOne({ user: userId, status: "completed" })
      .select("atsScore createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    Resume.countDocuments({ user: userId, status: "completed" }),
    InterviewSession.find({ user: userId, status: "completed" })
      .select("overallScore createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    InterviewSession.countDocuments({ user: userId, status: "completed" }),
    RepoAnalysis.countDocuments({ user: userId, status: "completed" }),
    SkillGapAnalysis.findOne({ user: userId, status: "completed" })
      .select("matchPercentage gaps createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    SkillGapAnalysis.countDocuments({ user: userId, status: "completed" }),
    LearningRoadmap.countDocuments({ user: userId, status: "completed" }),
  ]);

  const avgInterviewScore =
    completedInterviews.length > 0
      ? Math.round(
        completedInterviews.reduce((sum, i) => sum + (i.overallScore || 0), 0) /
        completedInterviews.length,
      )
      : 0;

  const resumeScore = latestResume?.atsScore || 0;
  const interviewScore = avgInterviewScore;
  const gapCountVal = latestGapAnalysis?.gaps?.length || 0;
  const matchPercentage = latestGapAnalysis?.matchPercentage || 0;

  const overall = Math.round(
    (resumeScore * 0.25 + interviewScore * 0.25 + matchPercentage * 0.25 + Math.min(repoCount * 10, 100) * 0.25),
  );

  return ApiResponse.success({
    readiness: {
      overall,
      resume: resumeScore,
      interview: interviewScore,
      projects: Math.min(repoCount * 10, 100),
      skills: matchPercentage,
      lastUpdated: latestResume?.createdAt || latestGapAnalysis?.createdAt || null,
    },
    stats: {
      resumeCount,
      interviewCount,
      repoCount,
      gapCount: gapCountVal,
      roadmapCount,
      completedInterviewCount: completedInterviews.length,
      avgInterviewScore,
    },
  }).send(res);
});

module.exports = { getDashboardStats };
