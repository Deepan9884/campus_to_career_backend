const { genAI, defaultModel, fallbackModel } = require("../config/gemini");
const rateLimiter = require("./aiRateLimiter.service");
const AIUsageLog = require("../models/AIUsageLog.model");
const crypto = require("crypto");
const IORedis = require("ioredis");

const redis = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
});

redis.on("error", (err) => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const ERROR_TYPES = {
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  TIMEOUT: "TIMEOUT",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  API_ERROR: "API_ERROR",
  UNKNOWN: "UNKNOWN",
};

const RETRYABLE_ERROR_MESSAGES = [
  "network",
  "timeout",
  "internal",
  "unavailable",
  "503",
  "500",
  "429",
  "too many requests",
  "rate limit",
  "service unavailable",
];

function isRetryable(error) {
  const msg = (error.message || "").toLowerCase();
  return RETRYABLE_ERROR_MESSAGES.some((keyword) => msg.includes(keyword));
}

function isBadRequest(error) {
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("400") ||
    msg.includes("bad request") ||
    msg.includes("invalid argument") ||
    msg.includes("permission") ||
    msg.includes("not found") ||
    msg.includes("403")
  );
}

function classifyError(error) {
  const msg = (error.message || "").toLowerCase();

  if (
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("resource exhausted")
  ) {
    return { type: ERROR_TYPES.QUOTA_EXCEEDED, retryable: true };
  }
  if (msg.includes("timeout") || msg.includes("deadline")) {
    return { type: ERROR_TYPES.TIMEOUT, retryable: true };
  }

  if (isBadRequest(error)) {
    return { type: ERROR_TYPES.API_ERROR, retryable: false };
  }

  if (isRetryable(error)) {
    return { type: ERROR_TYPES.API_ERROR, retryable: true };
  }

  return { type: ERROR_TYPES.UNKNOWN, retryable: false };
}

function buildSuccessResult(response, model) {
  const result = {
    success: true,
    data: null,
    raw: null,
    model,
    tokensEstimate: null,
  };

  if (!response) return result;

  result.raw = response.text || null;

  if (response.usageMetadata?.totalTokenCount) {
    result.tokensEstimate = response.usageMetadata.totalTokenCount;
  }

  // Attempt to parse JSON from the text response
  if (result.raw) {
    let text = result.raw;

    // Strip markdown code fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(text);
      console.log("[AI] Successfully parsed JSON, keys:", Object.keys(parsed));
      result.data = parsed;
    } catch (e) {
      console.error("[AI] JSON parse failed, text length:", text.length, "error:", e.message);
      console.error("[AI] First 500 chars:", text.substring(0, 500));
      
      // Attempt to fix common JSON issues (scientific notation numbers)
      try {
        const fixedText = text.replace(/([0-9]+\.[0-9]+)e[+-]?[0-9]+/gi, (match) => {
          return Number(match).toFixed(2);
        });
        const parsed = JSON.parse(fixedText);
        console.log("[AI] Fixed JSON parse succeeded");
        result.data = parsed;
      } catch (e2) {
        console.error("[AI] Fixed JSON parse also failed:", e2.message);
        // Text mode — data is the raw text
        result.data = text;
      }
    }
  }

  return result;
}

function buildErrorResult(errorType, message, retryable) {
  return {
    success: false,
    data: null,
    raw: null,
    model: null,
    tokensEstimate: null,
    errorType,
    message,
    retryable,
  };
}

async function logUsage({ userId, feature, model, success, errorType, tokensEstimate }) {
  try {
    await AIUsageLog.create({
      userId,
      feature,
      model,
      success,
      errorType: errorType || null,
      tokensEstimate: tokensEstimate || null,
    });
  } catch (err) {
    console.error("[AIUsageLog] Failed to persist usage log:", {
      feature,
      userId,
      error: err.message,
    });
  }
}

async function generateContent({ prompt, responseSchema, model, feature = "general", userId }) {
  const modelName = model || defaultModel;
  const resultMeta = { feature, model: modelName, userId };

  // Step 1: Check rate limiter before making any API call
  const throttle = await rateLimiter.process({ feature });
  if (!throttle.allowed) {
    const reason = throttle.reason || "QUOTA_EXCEEDED";
    const message =
      reason === "RPD_EXCEEDED"
        ? "Our AI service has reached its daily limit. Please try again tomorrow."
        : "Our AI service is busy right now. Please wait a moment and try again.";

    const errorResult = buildErrorResult(ERROR_TYPES.QUOTA_EXCEEDED, message, false);
    await logUsage({ ...resultMeta, success: false, errorType: ERROR_TYPES.QUOTA_EXCEEDED });
    return errorResult;
  }

  // Step 2: Check Cache
  const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");
  const cacheKey = `ai_cache:${modelName}:${feature}:${promptHash}`;
  
  try {
    const cachedResponse = await redis.get(cacheKey);
    if (cachedResponse) {
      console.log(`[AI] Cache HIT for feature: ${feature}`);
      const parsed = JSON.parse(cachedResponse);
      return {
        success: true,
        data: parsed.data,
        raw: parsed.raw,
        model: modelName,
        tokensEstimate: 0,
        cached: true
      };
    }
  } catch (err) {
    console.warn("[AI] Redis cache get error:", err.message);
  }

  // Step 3: Attempt the API call with retry
  let lastError = null;
  let lastClassification = null;

  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const config = {};

      if (responseSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = responseSchema;
      }

      // Increase output token limit for large structured responses (roadmaps, etc.)
      config.maxOutputTokens = 8192;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config,
      });

      const result = buildSuccessResult(response, modelName);
      
      // Save to cache
      if (result.success && (result.data || result.raw)) {
        try {
          await redis.setex(
            cacheKey,
            CACHE_TTL_SECONDS,
            JSON.stringify({ data: result.data, raw: result.raw })
          );
        } catch (err) {
          console.warn("[AI] Redis cache set error:", err.message);
        }
      }

      await logUsage({ ...resultMeta, success: true, tokensEstimate: result.tokensEstimate });
      return result;
    } catch (error) {
      lastError = error;
      lastClassification = classifyError(error);

      // Don't retry bad requests
      if (!lastClassification.retryable) {
        break;
      }
    }
  }

  // In development mode, if API key is not configured, quota is exhausted, or errors occur, fallback to realistic mock data
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[AI] Gemini API error (${lastError?.message}). Using dev mock data fallback for feature: ${feature}`);
    const mockData = generateDevMockData(feature, prompt, responseSchema);
    if (mockData) {
      const mockResult = {
        success: true,
        data: mockData,
        raw: JSON.stringify(mockData),
        model: "dev-mock-model",
        tokensEstimate: 150,
        isDevMock: true,
      };
      await logUsage({ ...resultMeta, success: true, tokensEstimate: 150 });
      return mockResult;
    }
  }

  // All retries exhausted
  const errorResult = buildErrorResult(
    lastClassification?.type || ERROR_TYPES.UNKNOWN,
    lastClassification?.retryable
      ? "AI service temporarily unavailable. Please try again."
      : lastError?.message || "An unexpected error occurred while contacting the AI service.",
    lastClassification?.retryable || false,
  );

  await logUsage({
    ...resultMeta,
    success: false,
    errorType: lastClassification?.type || ERROR_TYPES.UNKNOWN,
  });

  return errorResult;
}

function generateDevMockData(feature, prompt, responseSchema) {
  if (feature === "resume-analysis") {
    return {
      atsScore: 84,
      keywordBreakdown: {
        matched: ["JavaScript", "TypeScript", "React", "Node.js", "Express", "REST APIs", "Git", "SQL"],
        missing: ["Docker", "CI/CD", "Jest/Unit Testing", "Kubernetes", "AWS"]
      },
      strengths: [
        "Strong full-stack foundations with clear modern JavaScript/TypeScript ecosystem experience",
        "Demonstrated practical project delivery and component architecture",
        "Clear, structured section layout with concise technical descriptions"
      ],
      improvements: [
        "Include quantifiable metric outcomes (e.g. 'Improved render performance by 35%')",
        "Highlight automated testing and continuous deployment pipeline experience",
        "Detail system scalability and caching strategies utilized"
      ],
      summary: "High-potential technical resume showcasing solid modern web development skills and hands-on project accomplishments.",
      inferredTargetRole: "Full Stack Engineer"
    };
  }

  if (feature === "github-repo-analysis") {
    return {
      overview: "Well-structured repository implementing modern software patterns with clear separation of concerns.",
      quality: "Clean modular architecture, consistent naming conventions, and intuitive project hierarchy.",
      security: "No obvious vulnerabilities or hardcoded secrets found in reviewed files. Proper environment variable usage observed.",
      resumeImpact: [
        "Architected and deployed scalable full-stack web application with responsive UI and modular services",
        "Implemented secure JWT authentication, rate limiting, and robust input validation workflows",
        "Designed RESTful API endpoints optimizing database queries and data transfer latency"
      ]
    };
  }

  if (feature === "skills-gap" || feature === "skills") {
    return {
      readinessScore: 80,
      matchedSkills: ["JavaScript", "React", "Node.js", "Git", "REST APIs"],
      missingSkills: ["Docker", "TypeScript", "Unit Testing", "CI/CD"],
      recommendations: [
        "Build a project integrating Docker containers and automated CI/CD workflows",
        "Deepen testing proficiency with Jest and React Testing Library"
      ]
    };
  }

  if (feature === "github-linkedin-post" || feature === "linkedin-post") {
    let title = "Engineering Project";
    let tech = "React, TypeScript, Node.js, MongoDB";

    const titleMatch = prompt.match(/Project Title:\s*(.+)/i) || prompt.match(/Repository:\s*(.+)/i) || prompt.match(/Event Name:\s*(.+)/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }
    const techMatch = prompt.match(/Tech Stack:\s*(.+)/i);
    if (techMatch && techMatch[1]) {
      tech = techMatch[1].trim();
    }

    return {
      headline: `🚀 Thrilled to showcase ${title} & our engineering journey!`,
      draft: `🚀 Thrilled to share a major milestone with **${title}**!\n\nOver the past sprint, our team tackled complex architectural requirements and successfully designed, built, and shipped a high-performance solution using **${tech}**.\n\n💡 What we engineered:\n• Architected a responsive, intuitive interface with modular components and real-time state synchronization.\n• Engineered high-throughput REST APIs, robust backend data pipelines, and optimized database indexing.\n• Implemented secure authentication, granular input validation, and strict error handling middleware.\n\n🏆 Key Milestone & Impact:\nWe pushed beyond standard project constraints to eliminate latency bottlenecks, improve responsiveness by 45%, and deliver seamless multi-device workflows.\n\n🌟 Exhaustive Achievement Breakdown:\nBuilding ${title} demanded deep perseverance and technical clarity. Navigating concurrency hurdles, fine-tuning data serialization, and restructuring asynchronous operations during late-night debugging sessions tested our resilience. Overcoming each roadblock reinforced the value of modular system design, clean code practices, and thoughtful architectural trade-offs.\n\nHuge shoutout to my team and mentors for the continuous collaboration and support throughout this build! 🙌\n\nWhat are your favorite patterns when building with ${tech.split(",")[0] || "modern tech"}? Would love to connect and hear your thoughts!\n\n#SoftwareEngineering #WebDevelopment #FullStack #TechCommunity #Innovation #OpenSource`,
      achievementParagraph: `Building ${title} demanded deep perseverance and technical clarity. Navigating concurrency hurdles, fine-tuning data serialization, and restructuring asynchronous operations during late-night debugging sessions tested our resilience. Overcoming each roadblock reinforced the value of modular system design, clean code practices, and thoughtful architectural trade-offs.`,
      variations: [
        {
          style: "Storytelling & Journey",
          content: `🌟 From an initial concept to a deployed product — here is the story behind **${title}**!\n\nWhen we started building with ${tech}, the central challenge was ensuring seamless performance and reliability under heavy loads. 36 hours of rapid iterations and architecture pivots later, we reached our milestone.\n\nKey Highlights:\n✨ Seamless, responsive frontend with immediate feedback\n⚡ Scalable backend services handling async tasks\n🛡️ Robust validation and automated error guards\n\nBuilding this reinforced that great software isn't just about code — it's about resilience, continuous learning, and teamwork.\n\n#TechJourney #WebDev #CodingMilestone #DeveloperLife #Innovation`
        },
        {
          style: "Deep Technical & Architecture Breakdown",
          content: `🛠️ Technical Deep-Dive: Architecture Breakdown of **${title}**\n\nHere is how we structured the system using ${tech}:\n\n1️⃣ Client Layer: Modular reactive components with strict typing and fast client-side state handling.\n2️⃣ Backend Services: Express / Node.js architecture with isolated controllers, data validation layers, and centralized error middleware.\n3️⃣ Performance & Reliability: Optimized query indexing, cached high-frequency responses, and enforced rate-limiting.\n\nCheck out the project and let me know your thoughts on our architectural choices!\n\n#SoftwareArchitecture #SystemDesign #TypeScript #BackendEngineering #Performance`
        },
        {
          style: "Executive & Punchy Summary",
          content: `🎉 Milestone Achieved! Excited to announce the launch of **${title}**.\n\n📊 Key Outcomes:\n• 100% production-ready full-stack architecture built with ${tech}\n• 45% faster query and response latency\n• Robust security & automated validation\n\nThankful for the team and excited for the next engineering challenge! 🚀\n\n#SoftwareEngineering #Milestone #OpenSource #Tech`
        }
      ],
      suggestedHashtags: ["#SoftwareEngineering", "#WebDevelopment", "#FullStack", "#TechCommunity", "#Innovation"],
      suggestedMentions: ["@Teammate", "@Organizer", "@Mentor"],
      keyTakeaways: [
        `Architected modular full-stack application for ${title}`,
        "Conquered tough latency bottlenecks through database indexing and caching",
        "Delivered under high-pressure timelines with clean code standards"
      ]
    };
  }

  if (feature === "roadmap") {
    return {
      role: "Full Stack Developer",
      summary: "Structured 12-week roadmap guiding from core fundamentals to production-ready engineering.",
      milestones: [
        {
          title: "Phase 1: Advanced Frontend & TypeScript",
          duration: "Weeks 1-4",
          topics: ["TypeScript Types & Generics", "State Management & Performance", "Design Systems"],
          projects: ["Real-time Analytics Dashboard"]
        },
        {
          title: "Phase 2: Scalable Backend Architecture",
          duration: "Weeks 5-8",
          topics: ["Node.js Microservices", "Database Optimization & Caching", "API Security & Rate Limiting"],
          projects: ["High-Throughput API Gateway"]
        },
        {
          title: "Phase 3: DevOps, Testing & Production Readiness",
          duration: "Weeks 9-12",
          topics: ["Docker & Kubernetes", "CI/CD Automation", "Monitoring & Logging"],
          projects: ["Production-Ready Monorepo Deployment"]
        }
      ]
    };
  }

  if (feature === "interview-scoring" || feature === "interview") {
    return {
      score: 85,
      strengths: [
        "Structured thinking utilizing clear STAR method breakdown",
        "Strong articulation of technical trade-offs and decision criteria",
        "Clear communication and concise delivery"
      ],
      improvements: [
        "Include more concrete metrics regarding performance benchmarks",
        "Discuss edge cases and exception recovery mechanisms"
      ],
      feedback: "Excellent response displaying practical engineering maturity and confident communication.",
      criteriaScores: {
        technicalAccuracy: 86,
        communication: 88,
        problemSolving: 84
      }
    };
  }

  if (responseSchema?.properties) {
    const mock = {};
    for (const [key, val] of Object.entries(responseSchema.properties)) {
      if (val.type === "string") mock[key] = `Sample ${key}`;
      else if (val.type === "number") mock[key] = 80;
      else if (val.type === "array") mock[key] = ["Sample point 1", "Sample point 2"];
      else if (val.type === "object") mock[key] = {};
    }
    return mock;
  }

  return { message: "Mock development response" };
}

/**
 * Streaming version of generateContent.
 * Returns an async generator yielding text chunks.
 */
async function generateContentStream({ prompt, model, feature = "general", userId }) {
  const modelName = model || defaultModel;
  const resultMeta = { feature, model: modelName, userId };

  // Check rate limiter
  const throttle = await rateLimiter.process({ feature });
  if (!throttle.allowed) {
    throw new Error("QUOTA_EXCEEDED");
  }

  try {
    const responseStream = await genAI.models.generateContentStream({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let fullText = "";
    
    // Create an async generator to yield chunks to the caller
    async function* streamGenerator() {
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          yield chunk.text;
        }
      }
      
      // Log usage after stream completes
      await logUsage({ ...resultMeta, success: true });
    }
    
    return streamGenerator();
  } catch (error) {
    await logUsage({ ...resultMeta, success: false, errorType: ERROR_TYPES.API_ERROR });
    throw error;
  }
}

module.exports = {
  generateContent,
  generateContentStream,
  getQuotaStatus: rateLimiter.getQuotaStatus.bind(rateLimiter),
  getUsageSummary: rateLimiter.getUsageSummary.bind(rateLimiter),
  ERROR_TYPES,
};
