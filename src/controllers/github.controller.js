const User = require("../models/User.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const Event = require("../models/Event.model");
const githubService = require("../services/github.service");
const githubBudget = require("../services/githubBudget.service");
const { selectFiles } = require("../services/fileSelection.service");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const queueService = require("../services/queue.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const MAX_FILE_LINES = 500;

function buildAnalysisPrompt(repoMeta, readme, fileContents) {
  let prompt = `You are an expert code reviewer and technical writer. Analyze the following GitHub repository and provide a structured assessment.

Repository: ${repoMeta.full_name}
Description: ${repoMeta.description || "No description provided"}
Language: ${repoMeta.language || "Unknown"}
Stars: ${repoMeta.stargazers_count || 0}
Last updated: ${repoMeta.updated_at || "Unknown"}

`;
  if (readme) {
    prompt += `README:\n\`\`\`\n${readme}\n\`\`\`\n\n`;
  }

  prompt += `Files analyzed (you only have access to these — do NOT make claims about files not listed here):\n`;
  for (const fc of fileContents) {
    prompt += `\n--- ${fc.path} (${fc.lines} lines${fc.truncated ? ", truncated" : ""}) ---\n`;
    prompt += `\`\`\`\n${fc.content}\n\`\`\`\n`;
  }

  prompt += `
Provide your evaluation as a JSON object with these exact fields:
- "overview" (string): 2-3 sentences on what the repo does and how it's built. Base this ONLY on the files you were shown.
- "quality" (string): Code organization, readability, notable patterns observed — ONLY from what was actually fetched. Do not guess about files you did not see.
- "security" (string): Any concerns visible in what was fetched (hardcoded secrets, missing input validation, etc.). If no obvious issues, say "No obvious security issues in the files reviewed."
- "resumeImpact" (array of strings): 2-4 resume-bullet-style strings a candidate could use to describe this project.

Be honest and specific — highlight genuine strengths but also identify concrete gaps. Only base your assessment on the files shown above.`;

  return prompt;
}

const analysisResponseSchema = {
  type: "object",
  properties: {
    overview: { type: "string" },
    quality: { type: "string" },
    security: { type: "string" },
    resumeImpact: { type: "array", items: { type: "string" } },
  },
  required: ["overview", "quality", "security", "resumeImpact"],
};

const linkedinPostResponseSchema = {
  type: "object",
  properties: {
    draft: { type: "string" },
    headline: { type: "string" },
    achievementParagraph: { type: "string" },
    variations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          style: { type: "string" },
          content: { type: "string" },
        },
        required: ["style", "content"],
      },
    },
    suggestedHashtags: {
      type: "array",
      items: { type: "string" },
    },
    suggestedMentions: {
      type: "array",
      items: { type: "string" },
    },
    keyTakeaways: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["draft", "achievementParagraph", "variations", "suggestedHashtags"],
};

function buildLinkedInPostPrompt(data) {
  const postType = data.postType || (data.repoFullName ? "github" : data.eventName ? "event" : "custom");
  const tone = data.tone || "exhaustive";
  const length = data.length || "exhaustive";
  const includeEmoji = data.includeEmoji !== false;
  const includeHashtags = data.includeHashtags !== false;
  const customHighlights = data.customHighlights || "";
  const mentions = Array.isArray(data.mentions) ? data.mentions.join(", ") : data.mentions || "";

  let contextDescription = "";

  if (postType === "event") {
    contextDescription = `
Source Type: Event / Hackathon / Competition Achievement
Event Name: ${data.eventName || "Hackathon / Competition"}
Event Type: ${data.eventType || "Hackathon"}
Organizer: ${data.organizer || "Not specified"}
Result / Placement: ${data.result || "Participant / Winner"}
Prize / Award: ${data.prize || "Recognition"}
Project Title: ${data.projectTitle || "Project"}
Problem Statement: ${data.problemStatement || "Real-world engineering challenge"}
Role in Team: ${data.role || "Developer"}
Team Name / Size: ${data.teamName || "Team"} (${data.teamSize || 1} members)
Tech Stack: ${Array.isArray(data.techStack) ? data.techStack.join(", ") : data.techStack || "Modern Tech Stack"}
What Was Built: ${data.whatDidYouBuild || data.description || "High impact software solution"}
What Was Learned: ${data.whatDidYouLearn || "Advanced technical and collaborative skills"}
Challenges Faced: ${data.challengesFaced || "Complex architecture and tight delivery timelines"}
Key Takeaways: ${Array.isArray(data.keyTakeaways) ? data.keyTakeaways.join("; ") : data.keyTakeaways || ""}
Project / Live Link: ${data.projectLink || ""}`;
  } else if (postType === "github") {
    contextDescription = `
Source Type: GitHub Repository / Engineering Project Showcase
Repository: ${data.repoFullName || "Software Project"}
Project Overview: ${data.overview || data.description || "Production-grade repository"}
Code Quality & Architecture Highlights: ${data.quality || "Modular, scalable architecture"}
Resume Highlights & Impact Points: ${Array.isArray(data.resumeImpact) ? data.resumeImpact.join("; ") : data.resumeImpact || "High performance and reliability"}
Tech Stack: ${Array.isArray(data.techStack) ? data.techStack.join(", ") : data.techStack || (Array.isArray(data.filesAnalyzed) ? data.filesAnalyzed.slice(0, 5).join(", ") : "")}
Repository URL: ${data.repoUrl || ""}`;
  } else if (postType === "milestone") {
    contextDescription = `
Source Type: Career Milestone / Certificate / Internship / Coding Streak
Milestone Category: ${data.milestoneType || "Career Achievement"}
Title / Program: ${data.title || data.eventName || "Milestone"}
Organization / Company: ${data.organization || data.organizer || "Industry Organization"}
Role / Topic: ${data.role || "Software Engineering"}
Tech Stack & Tools: ${Array.isArray(data.techStack) ? data.techStack.join(", ") : data.techStack || ""}
Key Achievements & Metrics: ${data.keyAchievements || data.description || "Reached major milestone with practical outcomes"}
Key Learnings: ${data.whatDidYouLearn || data.overview || "Deep technical mastery and real-world execution"}`;
  } else {
    contextDescription = `
Source Type: Custom Tech Post / Idea Spark / Thought Leadership
Topic / Title: ${data.title || data.topic || data.eventName || "Tech Innovation & Learnings"}
Key Highlights & Content Notes: ${data.customHighlights || data.overview || data.description || "Insights and technical breakthroughs"}
Tech Stack / Topics: ${Array.isArray(data.techStack) ? data.techStack.join(", ") : data.techStack || "Software Engineering"}`;
  }

  return `You are an elite tech content strategist and viral LinkedIn post copywriter for top software engineers, hackathon winners, and ambitious student developers.

Create a compelling, exhaustive, and authentic LinkedIn post that maximizes engagement, comments, and visibility in recruiters' and tech leaders' feeds.

${contextDescription}

Additional User Preferences:
- Tone Style: ${tone} (e.g. exhaustive storytelling, deep technical, executive impact, celebratory)
- Detail Level: ${length} (exhaustive multi-paragraph deep-dive with quantifiable impact)
- Custom User Highlights to Emphasize: ${customHighlights || "None specified"}
- Teammates / Mentors / Organizers to Tag: ${mentions || "None specified"}
- Include Emojis: ${includeEmoji ? "Yes, use tasteful and punchy tech/celebratory emojis" : "No, strictly text only"}
- Include Hashtags: ${includeHashtags ? "Yes, provide 4-7 trending tech and career hashtags" : "No"}

Key Writing Guidelines:
1. "draft" (Primary Post):
   - Hook: Start with a strong 1-2 line hook that halts scrolling (e.g., sharing a big win, a high-stakes challenge, or a hard-earned milestone).
   - The Story & Problem: Set the stage on what problem was being solved, why it was hard, or the competition context.
   - The Solution & Tech Architecture: Explain what was built, naming the specific tech stack and architectural choices.
   - The Win & Measurable Outcomes: Emphasize quantifiable metrics, rankings (e.g., 🥇 1st place out of 80+ teams, 40% latency reduction, 24-hour sprint).
   - The Exhaustive Paragraph of Achievement: Include a rich, thorough paragraph dedicated to the sweat equity, obstacles tackled (debugging late at night, pivot decisions), and what this milestone represents.
   - Gratitude & Shoutouts: Tag/mention teammates, mentors, organizers, or open-source tools if provided.
   - CTA (Call to Action): Ask an engaging question or invite connections/feedback.
   - Hashtags: End with relevant trending hashtags.
   - First-person perspective ("I" or "We").

2. "achievementParagraph":
   - An isolated, exhaustive, and inspiring paragraph focusing deeply on the achievement, technical triumphs, and perseverance. Ideal for copying into portfolios or resumes.

3. "variations":
   - Provide exactly 3 distinct styles:
     * Style 1: "Storytelling & Journey" (Emotional hook, struggle, breakthrough, victory, reflection)
     * Style 2: "Deep Technical & Architecture Breakdown" (Focusing heavily on system design, tech stack nuances, API performance, trade-offs)
     * Style 3: "Executive & Punchy Summary" (Clean bullet points, quick stats, high-impact summary)

4. "suggestedHashtags": 5-8 relevant trending hashtags (e.g. #WebDevelopment #HackathonWinner #SoftwareEngineering #React #AI #OpenSource).
5. "suggestedMentions": Relevant mention placeholders (e.g. @Organizer, @Teammate).
6. "keyTakeaways": 3-4 bullet-point takeaways.

Return ONLY a valid JSON object matching the requested schema.`;
}

const connectGithub = asyncHandler(async (req, res) => {
  const { githubUsername } = req.body;

  let profile;
  try {
    profile = await githubService.getUser(githubUsername);
  } catch (err) {
    if (err.status === 404) {
      throw ApiError.badRequest("GitHub username not found");
    }
    throw ApiError.internal("Failed to verify GitHub username");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { githubUsername: profile.login } },
    { new: true, runValidators: true },
  ).select("-password -refreshToken");

  return ApiResponse.success({
    user,
    github: {
      login: profile.login,
      name: profile.name,
      avatar_url: profile.avatar_url,
      public_repos: profile.public_repos,
      bio: profile.bio,
      html_url: profile.html_url,
    },
  }).send(res);
});

const listRepos = asyncHandler(async (req, res) => {
  if (!req.user.githubUsername) {
    throw ApiError.badRequest(
      "GitHub account not connected. Call POST /api/github/connect first.",
    );
  }

  const repos = await githubService.listPublicRepos(req.user.githubUsername);

  return ApiResponse.success({ repos }).send(res);
});

const analyzeRepo = asyncHandler(async (req, res) => {
  const { repoFullName } = req.body;

  if (!req.user.githubUsername) {
    throw ApiError.badRequest(
      "GitHub account not connected. Call POST /api/github/connect first.",
    );
  }

  const [owner, repo] = repoFullName.split("/");
  if (owner.toLowerCase() !== req.user.githubUsername.toLowerCase()) {
    throw ApiError.badRequest(
      "You can only analyze repositories that belong to your connected GitHub account.",
    );
  }

  const budgetCheck = githubBudget.checkBudget(9);
  if (!budgetCheck.allowed) {
    throw new ApiError(503, budgetCheck.message);
  }

  const analysis = await RepoAnalysis.create({
    user: req.user._id,
    repoFullName,
    repoUrl: `https://github.com/${repoFullName}`,
    status: "processing",
  });

  try {
    const jobData = {
      analysisId: analysis._id.toString(),
      repoFullName,
      owner,
      repo,
      userId: req.user._id.toString(),
    };

    const { processGithubAnalysis } = require("../workers/github.worker");
    await processGithubAnalysis(jobData);

    const updatedAnalysis = await RepoAnalysis.findById(analysis._id);
    return ApiResponse.success(updatedAnalysis).send(res);
  } catch (err) {
    if (err instanceof ApiError) throw err;

    analysis.status = "failed";
    analysis.errorMessage = err.message || "Analysis failed";
    await analysis.save();
    throw ApiError.internal(err.message || "Analysis failed");
  }
});

const getAnalysisHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [analyses, total] = await Promise.all([
    RepoAnalysis.find({ user: req.user._id })
      .select("repoFullName status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RepoAnalysis.countDocuments({ user: req.user._id }),
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

const getAnalysisById = asyncHandler(async (req, res) => {
  const analysis = await RepoAnalysis.findById(req.params.id);

  if (!analysis || analysis.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Analysis not found");
  }

  return ApiResponse.success(analysis).send(res);
});

const deleteAnalysis = asyncHandler(async (req, res) => {
  const analysis = await RepoAnalysis.findById(req.params.id);

  if (!analysis || analysis.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Analysis not found");
  }

  await RepoAnalysis.findByIdAndDelete(req.params.id);

  return ApiResponse.success(null, "Analysis deleted").send(res);
});

const generateLinkedInPost = asyncHandler(async (req, res) => {
  const {
    postType = "github",
    eventId,
    repoFullName,
    overview,
    quality,
    resumeImpact,
    repoUrl,
    tone = "exhaustive",
    length = "exhaustive",
    customHighlights,
    mentions,
    includeEmoji = true,
    includeHashtags = true,
    title,
    topic,
    organization,
    milestoneType,
  } = req.body;

  let mergedData = { ...req.body };

  // If eventId is provided, enrich from Event model
  if (eventId) {
    const eventDoc = await Event.findOne({ _id: eventId, user: req.user._id }).lean();
    if (eventDoc) {
      mergedData = {
        postType: "event",
        eventName: req.body.eventName || eventDoc.eventName,
        eventType: req.body.eventType || eventDoc.eventType,
        organizer: req.body.organizer || eventDoc.organizer,
        role: req.body.role || eventDoc.role,
        teamName: req.body.teamName || eventDoc.teamName,
        teamSize: req.body.teamSize || eventDoc.teamSize,
        teamMembers: req.body.teamMembers || eventDoc.teamMembers,
        projectTitle: req.body.projectTitle || eventDoc.projectTitle,
        problemStatement: req.body.problemStatement || eventDoc.problemStatement,
        techStack: req.body.techStack || eventDoc.techStack,
        description: req.body.description || eventDoc.description,
        result: req.body.result || eventDoc.result,
        prize: req.body.prize || eventDoc.prize,
        whatDidYouBuild: req.body.whatDidYouBuild || eventDoc.reflection?.whatDidYouBuild,
        whatDidYouLearn: req.body.whatDidYouLearn || eventDoc.reflection?.whatDidYouLearn,
        challengesFaced: req.body.challengesFaced || eventDoc.reflection?.challengesFaced,
        keyTakeaways: req.body.keyTakeaways || eventDoc.reflection?.keyTakeaways,
        projectLink: req.body.projectLink || eventDoc.projectLink,
        certificateUrl: eventDoc.certificateUrl,
        ...req.body,
      };
    }
  }

  const prompt = buildLinkedInPostPrompt(mergedData);
  const aiResult = await aiService.generateContent({
    prompt,
    responseSchema: linkedinPostResponseSchema,
    feature: "github-linkedin-post",
    userId: req.user._id,
  });

  if (!aiResult.success) {
    throw ApiError.internal(aiResult.message || "Failed to generate LinkedIn post draft");
  }

  const responseData = aiResult.data || {};
  const draft = responseData.draft || "";
  if (!draft) {
    throw ApiError.internal("Failed to generate post draft");
  }

  // Safe fallback if variations missing in edge case
  const variations = Array.isArray(responseData.variations) && responseData.variations.length > 0
    ? responseData.variations
    : [
        { style: "Storytelling & Journey", content: draft },
        { style: "Deep Technical Breakdown", content: draft },
        { style: "Executive Summary", content: draft },
      ];

  const achievementParagraph = responseData.achievementParagraph || draft.slice(0, 300);
  const suggestedHashtags = Array.isArray(responseData.suggestedHashtags) ? responseData.suggestedHashtags : [];
  const suggestedMentions = Array.isArray(responseData.suggestedMentions) ? responseData.suggestedMentions : [];
  const keyTakeaways = Array.isArray(responseData.keyTakeaways) ? responseData.keyTakeaways : [];

  // Log activity
  try {
    await activityLogService.logActivity({
      user: req.user._id,
      action: "generated_linkedin_post",
      metadata: {
        postType: mergedData.postType || "general",
        title: mergedData.projectTitle || mergedData.eventName || mergedData.repoFullName || mergedData.title || "Post Draft",
      },
    });
  } catch {
    // Non-blocking log failure
  }

  return ApiResponse.success({
    draft,
    headline: responseData.headline || "🚀 Project & Achievement Showcase",
    achievementParagraph,
    variations,
    suggestedHashtags,
    suggestedMentions,
    keyTakeaways,
    sourceData: {
      postType: mergedData.postType,
      title: mergedData.projectTitle || mergedData.eventName || mergedData.repoFullName || mergedData.title,
    },
  }).send(res);
});

const getPortfolio = asyncHandler(async (req, res) => {
  const { username } = req.params;
  
  // Find user by githubUsername (case insensitive)
  const user = await User.findOne({ 
    githubUsername: { $regex: new RegExp(`^${username}$`, "i") } 
  }).select("name githubUsername profile.targetRole profile.skills");

  if (!user) {
    throw ApiError.notFound("Portfolio not found for this GitHub user");
  }

  // Get completed repo analyses for this user
  const analyses = await RepoAnalysis.find({
    user: user._id,
    status: "completed"
  }).sort({ createdAt: -1 });

  return ApiResponse.success({
    user: {
      name: user.name,
      githubUsername: user.githubUsername,
      targetRole: user.profile?.targetRole || "Software Engineer",
      skills: user.profile?.skills || []
    },
    projects: analyses.map(a => ({
      _id: a._id,
      repoFullName: a.repoFullName,
      repoUrl: a.repoUrl,
      overview: a.overview,
      quality: typeof a.quality === "string" ? a.quality : JSON.stringify(a.quality),
      resumeImpact: a.resumeImpact,
      filesAnalyzed: a.filesAnalyzed
    }))
  }).send(res);
});

module.exports = {
  connectGithub,
  listRepos,
  analyzeRepo,
  getAnalysisHistory,
  getAnalysisById,
  deleteAnalysis,
  generateLinkedInPost,
  getPortfolio,
};
