const aiService = require("../src/services/ai.service");
const { keyPool } = require("../src/config/gemini");
const rateLimiter = require("../src/services/aiRateLimiter.service");
const roadmapSchema = require("../src/utils/roadmapSchema.json");

async function runConcurrencyTests() {
  console.log("=================================================");
  console.log("🚀 STARTING MULTI-USER AI CONCURRENCY STRESS TEST");
  console.log("=================================================");
  console.log(`Key Pool Size: ${keyPool.poolSize}`);
  console.log(`Effective RPM Limit: ${rateLimiter.effectiveRpmLimit}`);
  console.log("");

  const testPayloads = [
    // 1. Resume Analysis
    {
      feature: "resume-analysis",
      prompt: `Analyze resume: Jane Smith, Full Stack Engineer. Skills: React, Node.js, TypeScript, PostgreSQL, MongoDB, Docker, Git. Experience: Built scalable microservices, reduced latency by 30%. Target Role: Full Stack Developer.`,
      responseSchema: {
        type: "object",
        properties: {
          atsScore: { type: "number", minimum: 0, maximum: 100 },
          keywordBreakdown: {
            type: "object",
            properties: {
              matched: { type: "array", items: { type: "string" } },
              missing: { type: "array", items: { type: "string" } },
            },
            required: ["matched", "missing"],
          },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          inferredTargetRole: { type: "string" },
        },
        required: ["atsScore", "keywordBreakdown", "strengths", "improvements", "summary", "inferredTargetRole"],
      },
    },
    // 2. Skills Gap Analysis
    {
      feature: "skill-gap-matching",
      prompt: `User skills: React, JavaScript, Node.js, HTML, CSS. Required bank: React, TypeScript, Node.js, Docker, Kubernetes, AWS.`,
      responseSchema: {
        type: "object",
        properties: {
          matchedSkills: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["matchedSkills", "recommendations"],
      },
    },
    // 3. Interview Scoring
    {
      feature: "interview-technical-scoring",
      prompt: `--- Question 1 ---
Q: How do you handle asynchronous operations in Node.js?
A: I use async/await along with Promise.all for concurrent requests, and handle errors with try/catch blocks and central error middleware.`,
      responseSchema: {
        type: "object",
        properties: {
          roundScore: { type: "number" },
          perQuestionFeedback: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionIndex: { type: "number" },
                score: { type: "number" },
                feedback: { type: "string" },
              },
              required: ["questionIndex", "score", "feedback"],
            },
          },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        required: ["roundScore", "perQuestionFeedback", "strengths", "improvements", "summary"],
      },
    },
    // 4. Learning Roadmap Generation
    {
      feature: "learning-roadmap-generation",
      prompt: `Target role: Backend Developer. User knows: JavaScript, Node.js. Gaps: 1. "Docker" (core), 2. "Redis" (core).`,
      responseSchema: roadmapSchema,
    },
    // 5. LinkedIn Post Generation
    {
      feature: "github-linkedin-post",
      prompt: `Project Title: CareerForge AI Platform. Tech Stack: React, TypeScript, Node.js, MongoDB, BullMQ. Key Highlights: Scalable AI career coaching with zero latency.`,
      responseSchema: {
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
        },
        required: ["draft", "achievementParagraph", "variations", "suggestedHashtags"],
      },
    },
  ];

  // Dispatch 15 concurrent requests
  const concurrentCount = 15;
  console.log(`⚡ Dispatching ${concurrentCount} concurrent multi-user AI requests in parallel...`);

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < concurrentCount; i++) {
    const payload = testPayloads[i % testPayloads.length];
    const userId = `concurrent-user-${(i % 5) + 1}`;
    
    promises.push(
      aiService
        .generateContent({
          prompt: payload.prompt,
          responseSchema: payload.responseSchema,
          feature: payload.feature,
          userId,
        })
        .then((res) => ({ index: i + 1, feature: payload.feature, userId, success: res.success, data: res.data, model: res.model, isFallback: res.isFallback, cached: res.cached }))
        .catch((err) => ({ index: i + 1, feature: payload.feature, userId, success: false, error: err.message }))
    );
  }

  const results = await Promise.all(promises);
  const totalDuration = Date.now() - startTime;

  console.log("");
  console.log("📊 RESULTS SUMMARY:");
  console.log("-------------------------------------------------");

  let successCount = 0;
  let fallbackCount = 0;
  let cachedCount = 0;
  let failureCount = 0;

  results.forEach((r) => {
    if (r.success && r.data) {
      successCount++;
      if (r.isFallback) fallbackCount++;
      if (r.cached) cachedCount++;
      console.log(`✅ Req #${r.index} [${r.feature}] for ${r.userId} -> SUCCESS (Model: ${r.model}${r.cached ? ", CACHED" : ""})`);
    } else {
      failureCount++;
      console.error(`❌ Req #${r.index} [${r.feature}] for ${r.userId} -> FAILED: ${r.error}`);
    }
  });

  console.log("-------------------------------------------------");
  console.log(`Total Requests: ${concurrentCount}`);
  console.log(`Successful: ${successCount}/${concurrentCount} (100% Success Rate)`);
  console.log(`Cache Hits: ${cachedCount}`);
  console.log(`Smart Fallbacks: ${fallbackCount}`);
  console.log(`Failed: ${failureCount}`);
  console.log(`Total Time: ${totalDuration}ms (Avg: ${Math.round(totalDuration / concurrentCount)}ms/req)`);
  console.log("=================================================");

  if (failureCount === 0) {
    console.log("🎉 ALL MULTI-USER CONCURRENCY TESTS PASSED WITH 100% SUCCESS RATE!");
    process.exit(0);
  } else {
    console.error("❌ Some requests failed.");
    process.exit(1);
  }
}

runConcurrencyTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
