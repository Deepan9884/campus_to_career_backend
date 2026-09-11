const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const UserSkill = require("../models/UserSkill.model");
const Event = require("../models/Event.model");
const CodingProfile = require("../models/CodingProfile.model");

/**
 * Unified Career Placement Readiness Calculation Engine
 * 
 * Holistic 5-Pillar Placement Readiness Weights:
 * - ATS Resume & Portfolio: 25%
 * - AI & Technical Mock Interviews: 25%
 * - Skill Competency & Role Match: 20%
 * - Coding & Problem Solving (LeetCode / Repos): 15%
 * - Verified Events, Hackathons & Proofs: 15%
 * Total = 100%
 */
async function calculateStudentReadiness(userId) {
  const [
    latestResume,
    resumeCount,
    interviews,
    repoCount,
    latestGapAnalysis,
    userSkills,
    events,
    codingProfiles,
  ] = await Promise.all([
    Resume.findOne({ user: userId, status: { $ne: "failed" }, atsScore: { $ne: null } })
      .select("atsScore createdAt internships projects eventsAndCompetitions inferredTargetRole")
      .sort({ createdAt: -1 })
      .lean(),
    Resume.countDocuments({ user: userId, status: { $ne: "failed" }, atsScore: { $ne: null } }),
    InterviewSession.find({ user: userId, status: { $ne: "failed" }, overallScore: { $ne: null } })
      .select("overallScore targetRole createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    RepoAnalysis.countDocuments({ user: userId, status: { $ne: "failed" } }),
    SkillGapAnalysis.findOne({ user: userId, status: { $ne: "failed" } })
      .select("matchPercentage targetRole gaps createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    UserSkill.find({ user: userId }).select("name level verified").lean(),
    Event.find({ user: userId }).select("name category result verificationResult").lean(),
    CodingProfile.find({ user: userId }).lean(),
  ]);

  // 1. Resume ATS Score (Weight: 25%)
  const resumeScore = latestResume ? Math.min(100, Math.max(0, latestResume.atsScore || 0)) : 0;

  // 2. Technical & AI Mock Interviews (Weight: 25%)
  const avgInterviewScore = interviews.length > 0
    ? Math.round(interviews.reduce((sum, i) => sum + (i.overallScore || 0), 0) / interviews.length)
    : 0;

  // 3. Skill Gap & Technical Competencies (Weight: 20%)
  let skillScore = 0;
  if (latestGapAnalysis && typeof latestGapAnalysis.matchPercentage === "number") {
    skillScore = latestGapAnalysis.matchPercentage;
  } else if (userSkills.length > 0) {
    skillScore = Math.min(100, userSkills.length * 12);
  }

  // 4. Coding & Problem Solving Proficiency (Weight: 15%)
  let totalProblemsSolved = 0;
  for (const cp of codingProfiles) {
    const stats = cp.stats || {};
    const solved = Number(stats.totalSolved ?? stats.problemsSolved ?? stats.solvedCount ?? stats.totalProblemsSolved ?? 0);
    totalProblemsSolved += solved;
  }
  const codingScore = Math.min(100, Math.round((totalProblemsSolved * 1.0) + (repoCount * 12)));

  // 5. Events, Hackathons & Verified Proofs (Weight: 15%)
  const verifiedEventsCount = events.filter(
    (e) => e.verificationResult?.isVerified || e.result === "winner" || e.result === "runner-up" || e.result === "finalist"
  ).length;
  const eventScore = Math.min(100, Math.round((verifiedEventsCount * 35) + (events.length * 10)));

  // Overall Composite Placement Readiness (0-100)
  const overallReadiness = Math.min(100, Math.max(0, Math.round(
    (resumeScore * 0.25) +
    (avgInterviewScore * 0.25) +
    (skillScore * 0.20) +
    (codingScore * 0.15) +
    (eventScore * 0.15)
  )));

  return {
    overall: overallReadiness,
    resume: resumeScore,
    interview: avgInterviewScore,
    skills: skillScore,
    coding: codingScore,
    events: eventScore,
    projects: Math.min(repoCount * 10, 100),
    meta: {
      resumeCount,
      completedInterviewCount: interviews.length,
      repoCount,
      totalProblemsSolved,
      totalEventsCount: events.length,
      verifiedEventsCount,
      userSkillsCount: userSkills.length,
      hasGapAnalysis: !!latestGapAnalysis,
      targetRole: latestGapAnalysis?.targetRole || latestResume?.inferredTargetRole || null,
      lastUpdated: latestResume?.createdAt || latestGapAnalysis?.createdAt || (interviews[0]?.createdAt) || null,
    },
    weights: {
      resume: 25,
      interview: 25,
      skills: 20,
      coding: 15,
      events: 15,
    },
  };
}

module.exports = {
  calculateStudentReadiness,
};
