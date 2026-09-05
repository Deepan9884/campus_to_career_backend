const { Worker } = require("bullmq");
const { connection } = require("../services/queue.service");
const githubService = require("../services/github.service");
const { selectFiles } = require("../services/fileSelection.service");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const RepoAnalysis = require("../models/RepoAnalysis.model");

const MAX_FILE_LINES = 200;
const MAX_PROMPT_LENGTH = 45000;

function buildAnalysisPrompt(repoMeta, readme, fileContents, tree) {
  const hasTests = tree.some(f => f.path.includes('test') || f.path.includes('spec') || f.path.includes('__tests__'));
  const hasCI = tree.some(f => f.path.includes('.github/workflows') || f.path.includes('.gitlab-ci') || f.path.includes('ci.yml'));
  const hasDocs = tree.some(f => f.path.includes('docs/') || f.path.toLowerCase().includes('documentation'));
  
  let prompt = `You are a senior technical recruiter and engineering manager conducting a comprehensive GitHub repository evaluation. Your goal is to provide an honest, detailed analysis from an HR and hiring perspective.

**REPOSITORY INFORMATION:**
- Name: ${repoMeta.full_name}
- Description: ${repoMeta.description || "No description provided"}
- Primary Language: ${repoMeta.language || "Unknown"}
- Stars: ${repoMeta.stargazers_count || 0}
- Forks: ${repoMeta.forks_count || 0}
- Last Updated: ${repoMeta.updated_at || "Unknown"}
- Has Tests: ${hasTests ? "Yes" : "No"}
- Has CI/CD: ${hasCI ? "Yes" : "No"}
- Has Documentation: ${hasDocs ? "Yes" : "No"}

`;
  
  if (readme) {
    const readmeLines = readme.split("\n");
    let truncatedReadme = readmeLines.length > 100 ? readmeLines.slice(0, 100).join("\n") + "\n[README truncated...]" : readme;
    if (truncatedReadme.length > 8000) {
      truncatedReadme = truncatedReadme.slice(0, 8000) + "\n[...README truncated]";
    }
    prompt += `**README CONTENT:**\n\`\`\`markdown\n${truncatedReadme}\n\`\`\`\n\n`;
  }
  
  prompt += `**SOURCE CODE FILES ANALYZED:**\n`;
  
  let currentLength = prompt.length;
  let filesAdded = 0;
  
  for (const fc of fileContents) {
    const fileSection = `\n--- ${fc.path} (${fc.lines} lines${fc.truncated ? ", truncated" : ""}) ---\n\`\`\`\n${fc.content}\n\`\`\`\n`;
    
    if (currentLength + fileSection.length > MAX_PROMPT_LENGTH) {
      prompt += `\n[Note: ${fileContents.length - filesAdded} additional files omitted due to size constraints]\n`;
      break;
    }
    
    prompt += fileSection;
    currentLength += fileSection.length;
    filesAdded++;
  }
  
  prompt += `\n**YOUR TASK:**
Provide a comprehensive, HR-focused analysis as a JSON object. Be honest, specific, and actionable. Base EVERYTHING on the actual code you see above.

**REQUIRED JSON STRUCTURE:**
{
  "overview": "string - 3-4 sentences: What does this project do? What problem does it solve? What's the technical approach?",
  "projectType": "string - Category: 'Full-Stack Web App', 'API Service', 'Mobile App', 'CLI Tool', 'Library/Package', 'Data Pipeline', 'DevOps Tool', etc.",
  "primaryTechStack": ["array of strings - Main technologies: e.g., 'React', 'Node.js', 'MongoDB', 'Python', 'Django'"],
  
  "quality": {
    "overallScore": number (0-100) - Overall code quality score,
    "codeOrganization": "string - Is the code well-structured? Clear separation of concerns? Proper file organization?",
    "readability": "string - Is the code clean and easy to understand? Good naming conventions? Comments where needed?",
    "bestPractices": "string - Follows language/framework conventions? Modern patterns? Error handling? Input validation?",
    "documentation": "string - Quality of README, inline comments, API documentation",
    "testing": "string - Test coverage, quality of tests, testing approach (if tests exist)",
    "strengths": ["array of strings - Specific things done well"],
    "improvements": ["array of strings - Specific areas that need improvement"]
  },
  
  "technicalSkills": {
    "languages": ["array - Programming languages used"],
    "frameworks": ["array - Frameworks/libraries used"],
    "tools": ["array - Development tools (Git, Docker, etc.)"],
    "patterns": ["array - Design patterns, architectures (REST API, MVC, Microservices, etc.)"],
    "databases": ["array - Databases used (if any)"],
    "cloudServices": ["array - Cloud platforms/services (AWS, Vercel, Firebase, etc.)"]
  },
  
  "security": {
    "overallRating": "string - 'Excellent', 'Good', 'Fair', or 'Needs Attention'",
    "issues": ["array - Specific security concerns found (hardcoded secrets, SQL injection risks, XSS vulnerabilities, etc.)"],
    "goodPractices": ["array - Security measures properly implemented"],
    "recommendations": ["array - Security improvements to make"]
  },
  
  "professionalReadiness": {
    "overallScore": number (0-100) - Production readiness score,
    "productionReady": boolean - Is this production-quality code?,
    "teamCollaboration": "string - Evidence of professional development practices (commits, branches, code organization)",
    "projectComplexity": "string - 'Beginner', 'Intermediate', 'Advanced', or 'Expert'",
    "businessValue": "string - Real-world applicability, solves actual problems?",
    "scalability": "string - Can this handle growth? Performant design?"
  },
  
  "resumeImpact": {
    "bullets": ["array - 3-5 resume bullet points in action-verb format, quantify impact where possible"],
    "interviewTalkingPoints": ["array - 3-4 key points to discuss in technical interviews"],
    "uniqueSellingPoints": ["array - 2-3 things that make this project stand out"],
    "improvementSuggestions": ["array - 2-3 ways to make this project more impressive"]
  },
  
  "recruiterView": {
    "hiringPotential": "string - 'High', 'Medium', or 'Low'",
    "standoutFeatures": ["array - What would impress a hiring manager?"],
    "redFlags": ["array - Concerns a recruiter might have (be honest but constructive)"],
    "idealRoles": ["array - 3-5 job titles this project qualifies for: e.g., 'Junior Full-Stack Developer', 'Backend Engineer', 'DevOps Engineer'"],
    "experienceLevel": "string - 'Entry', 'Mid', or 'Senior' - What level does this work demonstrate?"
  },
  
  "benchmarks": {
    "peerComparison": "string - How does this compare to typical projects from candidates at this experience level?",
    "industryStandards": "string - Does this meet current industry standards and expectations?",
    "competitiveAdvantage": "string - What gives this candidate an edge over other applicants?"
  }
}

**IMPORTANT GUIDELINES:**
- Be honest and constructive - this helps the developer improve
- Base everything on actual code shown above - no assumptions
- For scores, use the full 0-100 range (don't default to 70-80)
- In "improvements" and "redFlags", be specific and actionable
- In "resumeImpact.bullets", use action verbs and quantify when possible (e.g., "Built RESTful API serving 10+ endpoints")
- Consider what a hiring manager actually looks for: problem-solving, code quality, business value, team-readiness
`;
  
  return prompt;
}

const analysisResponseSchema = {
  type: "object",
  properties: {
    overview: { type: "string" },
    projectType: { type: "string" },
    primaryTechStack: { type: "array", items: { type: "string" } },
    quality: {
      type: "object",
      properties: {
        overallScore: { type: "number" },
        codeOrganization: { type: "string" },
        readability: { type: "string" },
        bestPractices: { type: "string" },
        documentation: { type: "string" },
        testing: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
    },
    technicalSkills: {
      type: "object",
      properties: {
        languages: { type: "array", items: { type: "string" } },
        frameworks: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "string" } },
        patterns: { type: "array", items: { type: "string" } },
        databases: { type: "array", items: { type: "string" } },
        cloudServices: { type: "array", items: { type: "string" } },
      },
    },
    security: {
      type: "object",
      properties: {
        overallRating: { type: "string" },
        issues: { type: "array", items: { type: "string" } },
        goodPractices: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
      },
    },
    professionalReadiness: {
      type: "object",
      properties: {
        overallScore: { type: "number" },
        productionReady: { type: "boolean" },
        teamCollaboration: { type: "string" },
        projectComplexity: { type: "string" },
        businessValue: { type: "string" },
        scalability: { type: "string" },
      },
    },
    resumeImpact: {
      type: "object",
      properties: {
        bullets: { type: "array", items: { type: "string" } },
        interviewTalkingPoints: { type: "array", items: { type: "string" } },
        uniqueSellingPoints: { type: "array", items: { type: "string" } },
        improvementSuggestions: { type: "array", items: { type: "string" } },
      },
    },
    recruiterView: {
      type: "object",
      properties: {
        hiringPotential: { type: "string" },
        standoutFeatures: { type: "array", items: { type: "string" } },
        redFlags: { type: "array", items: { type: "string" } },
        idealRoles: { type: "array", items: { type: "string" } },
        experienceLevel: { type: "string" },
      },
    },
    benchmarks: {
      type: "object",
      properties: {
        peerComparison: { type: "string" },
        industryStandards: { type: "string" },
        competitiveAdvantage: { type: "string" },
      },
    },
  },
  required: ["overview", "quality", "security", "resumeImpact", "recruiterView"],
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
        const truncatedContent = truncated ? lines.slice(0, MAX_FILE_LINES).join("\n") + "\n[... truncated]" : content;
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

    const prompt = buildAnalysisPrompt(repoMeta, readme, fileContents, tree);
    const aiResult = await aiService.generateContent({
      prompt,
      responseSchema: analysisResponseSchema,
      feature: "github-repo-analysis",
      userId,
      maxLength: 65000,
    });

    if (!aiResult.success) {
      analysis.status = "failed";
      analysis.errorMessage = aiResult.message;
      await analysis.save();
      throw new Error(aiResult.message);
    }

    const data = aiResult.data;
    
    // Save all comprehensive analysis data
    analysis.overview = data.overview || null;
    analysis.projectType = data.projectType || null;
    analysis.primaryTechStack = data.primaryTechStack || [];
    analysis.quality = data.quality || {};
    analysis.technicalSkills = data.technicalSkills || {};
    analysis.security = data.security || {};
    analysis.professionalReadiness = data.professionalReadiness || {};
    analysis.resumeImpact = data.resumeImpact || {};
    analysis.recruiterView = data.recruiterView || {};
    analysis.benchmarks = data.benchmarks || {};
    
    // Save repo stats
    analysis.repoStats = {
      stars: repoMeta.stargazers_count || 0,
      forks: repoMeta.forks_count || 0,
      language: repoMeta.language || "Unknown",
      size: repoMeta.size || 0,
      lastUpdated: repoMeta.updated_at ? new Date(repoMeta.updated_at) : null,
      hasReadme: !!readme && readme !== "(No README found)",
      hasTests: tree.some(f => f.path.includes('test') || f.path.includes('spec') || f.path.includes('__tests__')),
      hasCI: tree.some(f => f.path.includes('.github/workflows') || f.path.includes('.gitlab-ci') || f.path.includes('ci.yml')),
      hasDocumentation: tree.some(f => f.path.includes('docs/') || f.path.toLowerCase().includes('documentation')),
    };
    
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
