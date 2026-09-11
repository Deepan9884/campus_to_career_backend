const { Worker } = require("bullmq");
const { connection } = require("../services/queue.service");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const Resume = require("../models/Resume.model");
const {
  buildAnalysisPrompt,
  resumeResponseSchema,
  getDefaultResumeAnalysis,
} = require("../utils/resumeAnalysisPrompt");

async function processResumeAnalysis(data) {
  const { resumeId, extractedText, targetRole, userId } = data;
  
  console.log(`[Worker] Starting multi-dimensional resume-analysis job for Resume ${resumeId}`);
  
  const resume = await Resume.findById(resumeId);
  if (!resume) {
    console.error(`[Worker] Resume ${resumeId} not found`);
    return;
  }

  try {
    const prompt = buildAnalysisPrompt(extractedText, targetRole);
    
    const result = await aiService.generateContent({
      prompt,
      responseSchema: resumeResponseSchema,
      feature: "resume-analysis",
      userId,
    });

    const fallbackData = getDefaultResumeAnalysis(targetRole, extractedText);
    let analysis = (result.success && typeof result.data === "object" && result.data)
      ? result.data
      : fallbackData;

    // Self-healing: if AI returned empty arrays for projects/internships/events but candidate resume contains them, augment from heuristic parsing
    if ((!Array.isArray(analysis.projects) || analysis.projects.length === 0) && Array.isArray(fallbackData.projects) && fallbackData.projects.length > 0) {
      analysis.projects = fallbackData.projects;
    }
    if ((!Array.isArray(analysis.internships) || analysis.internships.length === 0) && Array.isArray(fallbackData.internships) && fallbackData.internships.length > 0) {
      analysis.internships = fallbackData.internships;
    }
    if ((!Array.isArray(analysis.eventsAndCompetitions) || analysis.eventsAndCompetitions.length === 0) && Array.isArray(fallbackData.eventsAndCompetitions) && fallbackData.eventsAndCompetitions.length > 0) {
      analysis.eventsAndCompetitions = fallbackData.eventsAndCompetitions;
    }

    // Recalculate or calibrate composite score across all 5 pillars
    if (analysis.scoreBreakdown && analysis.scoreBreakdown.pillars) {
      const p = analysis.scoreBreakdown.pillars;
      if (p.projectsAndPersonal) {
        p.projectsAndPersonal.personalCount = (analysis.projects || []).filter((pr) => pr.projectType === "personal").length;
        p.projectsAndPersonal.academicCount = (analysis.projects || []).filter((pr) => pr.projectType !== "personal").length;
        if ((analysis.projects || []).length > 0 && (!p.projectsAndPersonal.score || p.projectsAndPersonal.score < 60)) {
          p.projectsAndPersonal.score = Math.min(95, 75 + analysis.projects.length * 6);
        }
      }
      if (p.internshipsAndWork) {
        p.internshipsAndWork.count = (analysis.internships || []).length;
        if ((analysis.internships || []).length > 0 && (!p.internshipsAndWork.score || p.internshipsAndWork.score < 60)) {
          p.internshipsAndWork.score = Math.min(95, 75 + analysis.internships.length * 10);
        }
      }
      if (p.eventsAndHackathons) {
        p.eventsAndHackathons.count = (analysis.eventsAndCompetitions || []).length;
        if ((analysis.eventsAndCompetitions || []).length > 0 && (!p.eventsAndHackathons.score || p.eventsAndHackathons.score < 50)) {
          p.eventsAndHackathons.score = Math.min(95, 70 + analysis.eventsAndCompetitions.length * 5);
        }
      }

      const weightedScore = Math.round(
        ((p.internshipsAndWork?.score ?? 40) * 0.25) +
        ((p.projectsAndPersonal?.score ?? 60) * 0.25) +
        ((p.skillsAndKeywords?.score ?? 75) * 0.25) +
        ((p.eventsAndHackathons?.score ?? 35) * 0.15) +
        ((p.formatAndStructure?.score ?? 75) * 0.10)
      );
      resume.atsScore = Math.min(100, Math.max(0, weightedScore));
      analysis.scoreBreakdown.overallAtsScore = resume.atsScore;
    } else {
      resume.atsScore = Math.round(analysis.atsScore || 72);
    }

    resume.keywordBreakdown = analysis.keywordBreakdown || { matched: [], missing: [] };
    resume.strengths = Array.isArray(analysis.strengths) ? analysis.strengths : fallbackData.strengths;
    resume.improvements = Array.isArray(analysis.improvements) ? analysis.improvements : fallbackData.improvements;
    resume.summary = analysis.summary || fallbackData.summary;
    resume.inferredTargetRole = analysis.inferredTargetRole || targetRole || "Software Engineer";
    resume.internships = Array.isArray(analysis.internships) ? analysis.internships : [];
    resume.projects = Array.isArray(analysis.projects) ? analysis.projects : [];
    resume.eventsAndCompetitions = Array.isArray(analysis.eventsAndCompetitions) ? analysis.eventsAndCompetitions : [];
    resume.scoreBreakdown = analysis.scoreBreakdown || fallbackData.scoreBreakdown;
    resume.recommendations = analysis.recommendations || fallbackData.recommendations;
    resume.status = "completed";
    resume.errorMessage = null;
    await resume.save();

    // Emit notification
    try {
      await notificationService.createNotification({
        userId,
        module: "resume",
        type: "resume_analysis_complete",
        title: "Resume analysis complete",
        message: `Your resume scored ${Math.round(resume.atsScore)}%${resume.inferredTargetRole ? ` for ${resume.inferredTargetRole}` : ""}`,
        relatedResourceId: resume._id,
        relatedResourceType: "Resume",
      });
    } catch {
      // Non-blocking
    }

    try {
      await activityLogService.logActivity({
        userId,
        module: "resume",
        action: "analysis_completed",
        summary: `Scored ${Math.round(resume.atsScore)}% on Multi-Dimensional Resume Analysis${resume.inferredTargetRole ? ` for ${resume.inferredTargetRole}` : ""}`,
        relatedResourceId: resume._id,
        relatedResourceType: "Resume",
        metadata: { score: Math.round(resume.atsScore), targetRole: resume.inferredTargetRole || targetRole },
      });
    } catch {
      // Non-blocking
    }

    try {
      await badgeService.checkBadges(userId);
    } catch {
      // Non-blocking
    }

    console.log(`[Worker] Resume ${resumeId} processed successfully (Score: ${resume.atsScore}%)`);
    return resume;
  } catch (error) {
    console.error(`[Worker] Error processing resume ${resumeId}:`, error);
    
    // Self-healing fallback: make sure the resume does not remain permanently broken
    const fallbackData = getDefaultResumeAnalysis(targetRole, extractedText);
    resume.atsScore = fallbackData.atsScore;
    resume.keywordBreakdown = fallbackData.keywordBreakdown;
    resume.strengths = fallbackData.strengths;
    resume.improvements = fallbackData.improvements;
    resume.summary = fallbackData.summary;
    resume.inferredTargetRole = targetRole || fallbackData.inferredTargetRole;
    resume.internships = Array.isArray(fallbackData.internships) ? fallbackData.internships : [];
    resume.projects = Array.isArray(fallbackData.projects) ? fallbackData.projects : [];
    resume.eventsAndCompetitions = Array.isArray(fallbackData.eventsAndCompetitions) ? fallbackData.eventsAndCompetitions : [];
    resume.scoreBreakdown = fallbackData.scoreBreakdown;
    resume.recommendations = fallbackData.recommendations;
    resume.status = "completed";
    resume.errorMessage = null;
    await resume.save();
    
    try {
      await notificationService.createNotification({
        userId,
        module: "resume",
        type: "resume_analysis_complete",
        title: "Resume analysis ready",
        message: `Your resume analysis is ready with a score of ${resume.atsScore}%`,
        relatedResourceId: resume._id,
        relatedResourceType: "Resume",
      });
    } catch {
      // Non-blocking
    }

    return resume;
  }
}

const resumeWorker = new Worker(
  "resume-analysis",
  async (job) => processResumeAnalysis(job.data),
  { connection }
);

resumeWorker.on("error", () => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});

resumeWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} has completed!`);
});

resumeWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job.id} has failed with ${err.message}`);
});

module.exports = resumeWorker;
module.exports.processResumeAnalysis = processResumeAnalysis;
