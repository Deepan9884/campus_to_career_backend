const User = require("../models/User.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
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
  },
  required: ["draft"],
};

function buildLinkedInPostPrompt(analysis) {
  return `You are a professional tech content writer. Write a concise LinkedIn post draft (2-4 sentences) that highlights this GitHub project for a developer's network.

Project: ${analysis.repoFullName}
Description: ${analysis.overview || "No overview available"}
Key technologies: ${analysis.filesAnalyzed?.slice(0, 5).join(", ") || "Not specified"}
Resume highlights: ${analysis.resumeImpact?.join("; ") || "Not available"}

Requirements:
- 2-4 sentences max
- Professional but engaging tone
- Highlight what the project does and key tech/achievements
- Include 1-2 relevant hashtags at the end
- Do NOT include emojis
- Do NOT mention "GitHub" explicitly (the platform is implied)
- Do NOT use phrases like "Check out my project" or "I built"
- Write in first person as if the developer is sharing their work

Return ONLY a JSON object with a "draft" field containing the post text.`;
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
  const { repoFullName, overview, quality, resumeImpact, repoUrl } = req.body;

  const analysis = {
    repoFullName,
    overview,
    quality,
    resumeImpact,
    repoUrl,
    filesAnalyzed: [],
  };

  const prompt = buildLinkedInPostPrompt(analysis);
  const aiResult = await aiService.generateContent({
    prompt,
    responseSchema: linkedinPostResponseSchema,
    feature: "github-linkedin-post",
    userId: req.user._id,
  });

  if (!aiResult.success) {
    throw ApiError.internal(aiResult.message);
  }

  const draft = aiResult.data?.draft || "";
  if (!draft) {
    throw ApiError.internal("Failed to generate post draft");
  }

  return ApiResponse.success({ draft }).send(res);
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
