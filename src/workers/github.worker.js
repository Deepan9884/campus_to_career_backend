const { Worker } = require("bullmq");
const { connection } = require("../services/queue.service");
const githubService = require("../services/github.service");
const { selectFiles } = require("../services/fileSelection.service");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const RepoAnalysis = require("../models/RepoAnalysis.model");

const MAX_FILE_LINES = 500;

function buildAnalysisPrompt(repoMeta, readme, fileContents) {
  let prompt = `You are an expert code reviewer and technical writer. Analyze the following GitHub repository and provide a structured assessment.\n\nRepository: ${repoMeta.full_name}\nDescription: ${repoMeta.description || "No description provided"}\nLanguage: ${repoMeta.language || "Unknown"}\nStars: ${repoMeta.stargazers_count || 0}\nLast updated: ${repoMeta.updated_at || "Unknown"}\n\n`;
  if (readme) {
    prompt += `README:\n\`\`\`\n${readme}\n\`\`\`\n\n`;
  }
  prompt += `Files analyzed (you only have access to these — do NOT make claims about files not listed here):\n`;
  for (const fc of fileContents) {
    prompt += `\n--- ${fc.path} (${fc.lines} lines${fc.truncated ? ", truncated" : ""}) ---\n`;
    prompt += `\`\`\`\n${fc.content}\n\`\`\`\n`;
  }
  prompt += `\nProvide your evaluation as a JSON object with these exact fields:\n- "overview" (string): 2-3 sentences on what the repo does and how it's built. Base this ONLY on the files you were shown.\n- "quality" (string): Code organization, readability, notable patterns observed — ONLY from what was actually fetched. Do not guess about files you did not see.\n- "security" (string): Any concerns visible in what was fetched (hardcoded secrets, missing input validation, etc.). If no obvious issues, say "No obvious security issues in the files reviewed."\n- "resumeImpact" (array of strings): 2-4 resume-bullet-style strings a candidate could use to describe this project.\n\nBe honest and specific — highlight genuine strengths but also identify concrete gaps. Only base your assessment on the files shown above.`;
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

async function processGithubAnalysis(data) {
  const { analysisId, repoFullName, owner, repo, userId } = data;
  
  console.log(`[Worker] Starting github-analysis job for Repo ${repoFullName}`);
  
  const analysis = await RepoAnalysis.findById(analysisId);
  if (!analysis) {
    console.error(`[Worker] RepoAnalysis ${analysisId} not found`);
    return;
  }

  try {
    const repoMeta = await githubService.getRepoMeta(owner, repo);
    let readme = "";
    try {
      readme = await githubService.getReadme(owner, repo);
    } catch {
      readme = "(No README found)";
    }

    let tree = [];
    try {
      tree = await githubService.getRepoTree(owner, repo, repoMeta.default_branch);
    } catch {
      tree = [];
    }

    const selectedPaths = selectFiles(tree, 5);
    const fileContents = [];

    for (const filePath of selectedPaths) {
      if (filePath.toLowerCase() === "readme" || filePath.toLowerCase().startsWith("readme.")) {
        continue;
      }
      try {
        const content = await githubService.getFileContent(owner, repo, filePath);
        const lines = content.split("\n");
        const truncated = lines.length > MAX_FILE_LINES;
        const truncatedContent = truncated ? lines.slice(0, MAX_FILE_LINES).join("\n") : content;
        fileContents.push({
          path: filePath,
          content: truncatedContent,
          lines: lines.length,
          truncated,
        });
      } catch {
        // Skip files that fail to fetch
      }
    }

    analysis.filesAnalyzed = ["README.md", ...fileContents.map((f) => f.path)];
    await analysis.save();

    const prompt = buildAnalysisPrompt(repoMeta, readme, fileContents);
    const aiResult = await aiService.generateContent({
      prompt,
      responseSchema: analysisResponseSchema,
      feature: "github-repo-analysis",
      userId,
    });

    if (!aiResult.success) {
      analysis.status = "failed";
      analysis.errorMessage = aiResult.message;
      await analysis.save();
      throw new Error(aiResult.message);
    }

    const scores = aiResult.data;
    analysis.overview = scores.overview || null;
    analysis.quality = scores.quality || null;
    analysis.security = scores.security || null;
    analysis.resumeImpact = scores.resumeImpact || [];
    analysis.status = "completed";
    await analysis.save();

    await notificationService.createNotification({
      userId,
      module: "github",
      type: "github_analysis_complete",
      title: "GitHub analysis complete",
      message: `Analysis of ${repoFullName} is ready — ${analysis.filesAnalyzed?.length || 0} files reviewed`,
      relatedResourceId: analysis._id,
      relatedResourceType: "RepoAnalysis",
    });

    await activityLogService.logActivity({
      userId,
      module: "github",
      action: "repo_analyzed",
      summary: `Analyzed ${repoFullName} — ${analysis.filesAnalyzed?.length || 0} files reviewed`,
      relatedResourceId: analysis._id,
      relatedResourceType: "RepoAnalysis",
      metadata: { repoFullName, filesAnalyzedCount: analysis.filesAnalyzed?.length || 0 },
    });

    await badgeService.checkBadges(userId);
    console.log(`[Worker] RepoAnalysis ${analysisId} processed successfully`);

  } catch (error) {
    console.error(`[Worker] Error processing RepoAnalysis ${analysisId}:`, error);
    analysis.status = "failed";
    analysis.errorMessage = error.message;
    await analysis.save();
    
    await notificationService.createNotification({
      userId,
      module: "github",
      type: "github_analysis_failed",
      title: "GitHub analysis failed",
      message: `There was an error analyzing ${repoFullName}. Please try again.`,
      relatedResourceId: analysis._id,
      relatedResourceType: "RepoAnalysis",
    });
  }
}

const githubWorker = new Worker(
  "github-analysis",
  async (job) => processGithubAnalysis(job.data),
  { connection }
);

githubWorker.on("error", (err) => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});

githubWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} has completed!`);
});

githubWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job.id} has failed with ${err.message}`);
});

module.exports = githubWorker;
module.exports.processGithubAnalysis = processGithubAnalysis;
