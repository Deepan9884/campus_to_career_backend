const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const LearningRoadmap = require("../models/LearningRoadmap.model");
const MentorTask = require("../models/MentorTask.model");
const { calculateStudentReadiness } = require("../services/careerReadiness.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");

const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [
    readinessData,
    interviewCount,
    gapCount,
    roadmapCount,
    pendingMentorTasks,
  ] = await Promise.all([
    calculateStudentReadiness(userId),
    InterviewSession.countDocuments({ user: userId, status: { $ne: "failed" }, overallScore: { $ne: null } }),
    SkillGapAnalysis.countDocuments({ user: userId, status: { $ne: "failed" } }),
    LearningRoadmap.countDocuments({ user: userId, status: { $ne: "failed" } }),
    MentorTask.find({ student: userId, status: { $in: ["pending", "in_progress"] } })
      .populate("mentor", "name avatar")
      .sort({ dueDate: 1 })
      .limit(5)
      .lean(),
  ]);

  return ApiResponse.success({
    readiness: {
      overall: readinessData.overall,
      resume: readinessData.resume,
      interview: readinessData.interview,
      projects: readinessData.projects,
      skills: readinessData.skills,
      coding: readinessData.coding,
      events: readinessData.events,
      lastUpdated: readinessData.meta.lastUpdated,
      weights: readinessData.weights,
    },
    stats: {
      resumeCount: readinessData.meta.resumeCount,
      interviewCount,
      repoCount: readinessData.meta.repoCount,
      gapCount,
      roadmapCount,
      completedInterviewCount: readinessData.meta.completedInterviewCount,
      avgInterviewScore: readinessData.interview,
      totalProblemsSolved: readinessData.meta.totalProblemsSolved,
      totalEventsCount: readinessData.meta.totalEventsCount,
      verifiedEventsCount: readinessData.meta.verifiedEventsCount,
    },
    mentorTasks: pendingMentorTasks,
  }).send(res);
});

module.exports = { getDashboardStats };
