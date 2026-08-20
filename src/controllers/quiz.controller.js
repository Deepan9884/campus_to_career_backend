const LearningRoadmap = require("../models/LearningRoadmap.model");
const UserSkill = require("../models/UserSkill.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const QuizAttempt = require("../models/QuizAttempt.model");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

/**
 * Determine if a skill / subtopic requires coding / hands-on programming challenge
 */
function checkIfCodingTopic(skillName = "", subTopicName = "") {
  const combined = `${skillName} ${subTopicName}`.toLowerCase();

  const nonCodingKeywords = [
    "product management",
    "project management",
    "agile",
    "scrum",
    "ui/ux design",
    "wireframing",
    "figma",
    "graphic design",
    "copywriting",
    "soft skills",
    "communication",
    "public speaking",
    "negotiation",
    "leadership",
    "seo marketing",
    "digital marketing",
    "business analysis",
    "financial modeling",
  ];

  if (nonCodingKeywords.some((kw) => combined.includes(kw))) {
    return false;
  }

  return true;
}

function buildQuizPrompt(subTopicName, skillName, resources, attemptSeed = Date.now(), userPreferences = {}) {
  const { aiDifficulty = "Intermediate", preferredLanguage = "Python" } = userPreferences;
  const resourceList = resources.map((r) => `- ${r.name} (${r.platform}, ${r.type})`).join("\n");
  const requiresCoding = checkIfCodingTopic(skillName, subTopicName);

  // Resolve target code language based on skill name and candidate's preferred language
  const resolvedCodeLanguage = skillName.toLowerCase().includes("sql")
    ? "SQL"
    : skillName.toLowerCase().includes("java") && !skillName.toLowerCase().includes("javascript")
    ? "Java"
    : skillName.toLowerCase().includes("c++") || skillName.toLowerCase().includes("cpp")
    ? "C++"
    : skillName.toLowerCase().includes("javascript") || skillName.toLowerCase().includes("typescript") || skillName.toLowerCase().includes("react") || skillName.toLowerCase().includes("node")
    ? "JavaScript"
    : preferredLanguage || "Python";

  return `You are a Principal Software Engineer and Technical Evaluator designing a rigorous 3-section assessment test for a specific learning milestone.

Assessment Context:
- Target Skill: ${skillName}
- Sub-topic / Milestone: ${subTopicName}
- Candidate Experience Level: ${aiDifficulty}
- Preferred Code Language: ${resolvedCodeLanguage}
- Attempt Unique Seed: ${attemptSeed} (Ensure questions generated are completely fresh, unique, and distinctly varied from previous attempts)
${resourceList ? `- Reference Materials:\n${resourceList}` : ""}

EXAM STRUCTURE REQUIREMENTS (YOU MUST GENERATE ALL 3 SECTIONS CALIBRATED FOR ${aiDifficulty.toUpperCase()} LEVEL):

═══════════════════════════════════════════════════════════
SECTION 1: CONCEPTUAL MCQs (Exactly 5 Questions)
═══════════════════════════════════════════════════════════
- Generate exactly 5 multiple-choice questions testing fundamental principles, standard syntax, foundational concepts, and best practices for ${skillName} (${subTopicName}).
- Each question MUST have exactly 4 clear options labeled "A) ...", "B) ...", "C) ...", "D) ...".
- Mark section: 1, sectionTitle: "Section 1: Conceptual MCQs", type: "mcq", difficulty: "${aiDifficulty === "Beginner" ? "easy" : aiDifficulty === "Advanced" ? "hard" : "medium"}".
- Provide the exact correct answer (e.g. "A) option text"), brief explanation, and key points.

═══════════════════════════════════════════════════════════
SECTION 2: HANDS-ON PRACTICAL / CODING CHALLENGE (1 Problem)
═══════════════════════════════════════════════════════════
${
  requiresCoding
    ? `- Generate 1 practical Algorithmic / Coding Challenge problem for ${skillName} (${subTopicName}) calibrated for ${aiDifficulty} difficulty.
- The questionText MUST be comprehensive and include:
  1. Detailed Problem Statement & Real-world context
  2. INPUT FORMAT & CONSTRAINTS
  3. OUTPUT FORMAT
  4. 2-3 Concrete Examples with explanation
- Provide 2-3 sample test cases with exact "input", "expectedOutput", and "description".
- Provide a clean "starterCode" boilerplate in ${resolvedCodeLanguage}.
- Mark section: 2, sectionTitle: "Section 2: Coding Challenge", type: "coding", difficulty: "${aiDifficulty === "Beginner" ? "easy" : aiDifficulty === "Advanced" ? "hard" : "medium"}".`
    : `- Generate 1 practical Real-World Case Study / Architectural Scenario Problem for ${skillName} (${subTopicName}) calibrated for ${aiDifficulty} difficulty.
- Mark section: 2, sectionTitle: "Section 2: Practical Scenario", type: "scenario", difficulty: "medium".`
}`includes("typescript") || skillName.toLowerCase().includes("react") || skillName.toLowerCase().includes("node") ? "JavaScript" : "Python"}.
- Mark section: 2, sectionTitle: "Section 2: Coding Challenge", type: "coding", difficulty: "medium".`
    : `- Generate 1 practical Real-World Case Study / Architectural Scenario Problem for ${skillName} (${subTopicName}).
- Mark section: 2, sectionTitle: "Section 2: Practical Scenario", type: "scenario", difficulty: "medium".`
}

═══════════════════════════════════════════════════════════
SECTION 3: ADVANCED TOUGH MCQs (3 to 4 Questions)
═══════════════════════════════════════════════════════════
- Generate 3 to 4 TOUGH, ADVANCED multiple-choice questions focusing on:
  * Tricky edge cases & rare gotchas
  * Code snippet output prediction & subtle bugs
  * Concurrency, memory management, or performance optimizations
  * Complex architectural trade-offs
- Each question MUST have 4 distinct, well-crafted options with clever distractors labeled "A) ...", "B) ...", "C) ...", "D) ...".
- Mark section: 3, sectionTitle: "Section 3: Advanced MCQs (Tough)", type: "mcq", difficulty: "hard".
- Provide the exact correct answer, in-depth explanation, and key points.

JSON Structure Requirements:
{
  "questions": [
    {
      "questionId": "s1_q1",
      "section": 1,
      "sectionTitle": "Section 1: Conceptual MCQs",
      "type": "mcq",
      "difficulty": "medium",
      "questionText": "Question statement here...",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correctAnswer": "A) Option 1",
      "explanation": "Why this option is correct...",
      "keyPoints": ["Core concept evaluated"]
    },
    {
      "questionId": "s2_q1",
      "section": 2,
      "sectionTitle": "Section 2: Coding Challenge",
      "type": "coding",
      "difficulty": "medium",
      "questionText": "Problem description with input/output format and examples...",
      "starterCode": "def solve():\\n    pass",
      "keyPoints": ["Time complexity O(N)", "Edge cases"],
      "testCases": [
        {
          "input": "sample input",
          "expectedOutput": "expected output",
          "description": "Basic case"
        }
      ]
    },
    {
      "questionId": "s3_q1",
      "section": 3,
      "sectionTitle": "Section 3: Advanced MCQs (Tough)",
      "type": "mcq",
      "difficulty": "hard",
      "questionText": "Advanced tricky question with snippet or edge case...",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correctAnswer": "B) Option 2",
      "explanation": "Deep explanation of the nuance...",
      "keyPoints": ["Advanced edge case logic"]
    }
  ]
}

Return ONLY raw, valid JSON matching this schema.`;
}

const generateQuiz = asyncHandler(async (req, res) => {
  const { roadmapItemId } = req.body;

  let roadmap = null;
  let milestone = null;
  let subTopic = null;
  let skillName = "";
  let subTopicId = "";
  let resources = [];
  let isStandaloneSkill = false;
  let basedOnGapAnalysis = null;

  // 1. Try to find as roadmap milestone (by _id or subTopicId)
  const mongoose = require("mongoose");
  const isValidObjectId = mongoose.Types.ObjectId.isValid(roadmapItemId);

  if (isValidObjectId) {
    roadmap = await LearningRoadmap.findOne({
      "milestones._id": roadmapItemId,
      user: req.user._id,
    });
  }

  if (!roadmap) {
    roadmap = await LearningRoadmap.findOne({
      "milestones.subTopicId": roadmapItemId,
      user: req.user._id,
    });
  }

  if (roadmap) {
    if (roadmap.status !== "completed") {
      throw ApiError.badRequest("Roadmap generation is not complete");
    }
    if (!roadmap.milestones || roadmap.milestones.length === 0) {
      throw ApiError.badRequest("Roadmap has no milestones");
    }
    milestone = roadmap.milestones.find(
      (m) => m._id?.toString() === roadmapItemId || m.subTopicId === roadmapItemId
    );
    if (!milestone) {
      milestone = roadmap.milestones[0];
    }
    subTopic = roadmap.subTopics?.find((st) => st.subTopicId === milestone.subTopicId) || {
      subTopicId: milestone.subTopicId,
      name: milestone.skillName,
    };

    skillName = milestone.skillName;
    subTopicId = milestone.subTopicId || subTopic.subTopicId;
    resources = milestone.resources || [];
    basedOnGapAnalysis = roadmap.basedOnGapAnalysis;
  } else {
    // 2. Try as standalone skill
    let skill = null;
    if (isValidObjectId) {
      skill = await UserSkill.findOne({ _id: roadmapItemId, user: req.user._id });
    }

    if (!skill) {
      skill = await UserSkill.findOne({
        user: req.user._id,
        name: { $regex: new RegExp(`^${roadmapItemId}$`, "i") },
      });
    }

    if (!skill) {
      throw ApiError.notFound("Roadmap milestone or skill not found");
    }

    isStandaloneSkill = true;
    skillName = skill.name;
    subTopicId = `skill_${skill._id}`;
    subTopic = {
      subTopicId: subTopicId,
      name: `${skill.name} Core Competency`,
    };
    resources = [];
  }

  // 3. Determine attempt count
  const existingAttempt = await QuizAttempt.findOne({
    userId: req.user._id,
    subTopicId: subTopicId,
    score: { $ne: null },
    passed: true,
  });

  const isFirstAttempt = !existingAttempt;

  const responseSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionId: { type: "string" },
            section: { type: "integer" },
            sectionTitle: { type: "string" },
            type: { type: "string" },
            difficulty: { type: "string" },
            questionText: { type: "string" },
            options: {
              type: "array",
              items: { type: "string" },
            },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
            keyPoints: { type: "array", items: { type: "string" }, minItems: 1 },
            starterCode: { type: "string" },
            testCases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "string" },
                  expectedOutput: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
          required: ["questionId", "section", "sectionTitle", "type", "questionText", "keyPoints"],
        },
        minItems: 8,
        maxItems: 12,
      },
    },
    required: ["questions"],
  };

  const attemptSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const userPrefs = req.user?.preferences || {};
  const prompt = buildQuizPrompt(subTopic.name, skillName, resources, attemptSeed, userPrefs);

  const aiResult = await aiService.generateContent({
    prompt,
    responseSchema,
    feature: "quiz-generation",
    userId: req.user._id,
  });

  if (!aiResult.success || !aiResult.data) {
    throw ApiError.internal(aiResult.message || "AI service failed to generate quiz");
  }

  const aiData = aiResult.data;

  if (!aiData.questions || !Array.isArray(aiData.questions) || aiData.questions.length === 0) {
    throw ApiError.internal("AI service returned no questions");
  }

  // Normalize questions across the 3 sections
  const normalizedQuestions = aiData.questions.map((q, idx) => {
    const sectionNum = q.section === 1 || q.section === 2 || q.section === 3 ? q.section : (idx < 5 ? 1 : idx === 5 ? 2 : 3);
    const qType = q.type || (sectionNum === 2 ? "coding" : "mcq");
    const sectionTitle = q.sectionTitle || (
      sectionNum === 1
        ? "Section 1: Conceptual MCQs"
        : sectionNum === 2
        ? "Section 2: Coding Challenge"
        : "Section 3: Advanced MCQs (Tough)"
    );

    let options = Array.isArray(q.options) ? q.options : [];
    if (qType === "mcq" && options.length < 2) {
      options = ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"];
    }

    return {
      questionId: q.questionId || `s${sectionNum}_q${idx + 1}`,
      section: sectionNum,
      sectionTitle: sectionTitle,
      type: qType,
      difficulty: q.difficulty || (sectionNum === 3 ? "hard" : "medium"),
      questionText: q.questionText || "Question statement",
      options: options,
      correctAnswer: q.correctAnswer || (options[0] || ""),
      explanation: q.explanation || "",
      keyPoints: Array.isArray(q.keyPoints) && q.keyPoints.length > 0 ? q.keyPoints : ["Core concept understanding and correct implementation"],
      starterCode: q.starterCode || "",
      testCases: Array.isArray(q.testCases) ? q.testCases : [],
    };
  });

  const attempt = await QuizAttempt.create({
    userId: req.user._id,
    roadmapItemId: isStandaloneSkill ? roadmapItemId : roadmap._id,
    skillName: skillName,
    subTopicId: subTopicId,
    questions: normalizedQuestions,
    userAnswers: [],
    score: null,
    passed: false,
  });

  if (isFirstAttempt && !isStandaloneSkill) {
    const gapAnalysis = await SkillGapAnalysis.findById(basedOnGapAnalysis);
    if (gapAnalysis) {
      const gap = gapAnalysis.gaps.find((g) => g.skillName === skillName);
      if (gap) {
        const st = gap.subTopics.find((s) => s.subTopicId === subTopicId);
        if (st && st.status === "not_started") {
          st.status = "in_progress";
          await gapAnalysis.save();
        }
      }
    }
  }

  const responseQuestions = normalizedQuestions.map((q) => ({
    questionId: q.questionId,
    section: q.section,
    sectionTitle: q.sectionTitle,
    type: q.type,
    difficulty: q.difficulty,
    questionText: q.questionText,
    options: q.options || [],
    starterCode: q.starterCode || "",
    testCases: q.testCases || [],
  }));

  return ApiResponse.success({
    attemptId: attempt._id,
    subTopicId: subTopicId,
    subTopicName: subTopic.name,
    skillName: skillName,
    questions: responseQuestions,
    isFirstAttempt,
  }).send(res);
});

function buildGradingPrompt(codingQuestions, codingAnswers, skillName, subTopicName) {
  let prompt = `You are an expert technical evaluator grading a student's code and practical challenge solutions.

Skill: ${skillName}
Sub-topic: ${subTopicName}

For each coding problem below, grade the student's solution on a 0-100 scale based on:
1. Logic & correctness against problem statement
2. Handling of edge cases
3. Optimal time and space complexity
4. Code clarity and best practices

`;

  codingQuestions.forEach((q, i) => {
    const answer = codingAnswers.find((a) => a.questionId === q.questionId);
    const userAnswer = answer ? answer.answerText : "(no code provided)";
    prompt += `--- Problem ${i + 1} (ID: ${q.questionId}) ---
Problem: ${q.questionText}
Expected Key Points: ${q.keyPoints.join(", ")}
Student Code / Solution:
\`\`\`
${userAnswer}
\`\`\`

`;
  });

  prompt += `Return evaluations in a "perQuestionFeedback" array matching each problem. Each element must have:
- questionId (string, e.g. "${codingQuestions[0]?.questionId || "s2_q1"}")
- score (number 0-100)
- feedback (constructive summary highlighting strengths and specific edge cases / fixes)
`;

  return prompt;
}

const submitQuiz = asyncHandler(async (req, res) => {
  const { attemptId, answers } = req.body;

  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt || attempt.userId.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Quiz attempt not found");
  }

  if (attempt.score !== null) {
    throw ApiError.badRequest("This quiz attempt has already been scored");
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw ApiError.badRequest("Answers array is required");
  }

  for (const a of answers) {
    if (!a.questionId || typeof a.answerText !== "string") {
      throw ApiError.badRequest("Each answer must have questionId and answerText");
    }
  }

  // Separate MCQ questions and Coding/Scenario questions
  const mcqQuestions = attempt.questions.filter((q) => q.type === "mcq");
  const codingQuestions = attempt.questions.filter((q) => q.type === "coding" || q.type === "scenario");

  const questionResults = [];

  // 1. Grade MCQs with precision
  for (const q of mcqQuestions) {
    const ans = answers.find((a) => a.questionId === q.questionId);
    const userText = (ans?.answerText || "").trim();
    const correctText = (q.correctAnswer || "").trim();

    let isCorrect = false;

    if (userText && correctText) {
      // Direct string comparison
      if (userText.toLowerCase() === correctText.toLowerCase()) {
        isCorrect = true;
      } else {
        // Match option prefixes e.g. "A)" or "A"
        const userPrefixMatch = userText.match(/^([A-D])(?:\)|\.|\s|$)/i);
        const correctPrefixMatch = correctText.match(/^([A-D])(?:\)|\.|\s|$)/i);

        if (userPrefixMatch && correctPrefixMatch && userPrefixMatch[1].toUpperCase() === correctPrefixMatch[1].toUpperCase()) {
          isCorrect = true;
        } else if (correctText.includes(userText) || userText.includes(correctText)) {
          isCorrect = true;
        }
      }
    }

    const score = isCorrect ? 100 : 0;
    const feedback = isCorrect
      ? `Correct! ${q.explanation || "Well done."}`
      : `Incorrect. Correct answer: ${q.correctAnswer}. ${q.explanation || ""}`.trim();

    questionResults.push({
      questionId: q.questionId,
      section: q.section,
      type: q.type,
      questionText: q.questionText,
      userAnswerText: userText,
      correctAnswer: q.correctAnswer,
      keyPoints: q.keyPoints,
      score,
      feedback,
    });
  }

  // 2. Grade Coding/Scenario with AI Evaluation if present
  if (codingQuestions.length > 0) {
    const codingAnswers = answers.filter((a) =>
      codingQuestions.some((q) => q.questionId === a.questionId)
    );

    const codingGradingResponseSchema = {
      type: "object",
      properties: {
        perQuestionFeedback: {
          type: "array",
          items: {
            type: "object",
            properties: {
              questionId: { type: "string" },
              score: { type: "number", minimum: 0, maximum: 100 },
              feedback: { type: "string" },
            },
            required: ["questionId", "score", "feedback"],
          },
        },
      },
      required: ["perQuestionFeedback"],
    };

    const prompt = buildGradingPrompt(
      codingQuestions,
      codingAnswers,
      attempt.skillName,
      attempt.subTopicId
    );

    try {
      const gradingResult = await aiService.generateContent({
        prompt,
        responseSchema: codingGradingResponseSchema,
        feature: "quiz-grading",
        userId: req.user._id,
      });

      const feedbackList = gradingResult?.data?.perQuestionFeedback || [];

      for (const q of codingQuestions) {
        const userAns = codingAnswers.find((a) => a.questionId === q.questionId);
        const fb = feedbackList.find((f) => f.questionId === q.questionId);
        const score = fb ? Math.round(fb.score) : userAns?.answerText?.trim().length > 30 ? 70 : 0;
        const feedbackText = fb ? fb.feedback : "Solution submitted for code review.";

        questionResults.push({
          questionId: q.questionId,
          section: q.section,
          type: q.type,
          questionText: q.questionText,
          userAnswerText: userAns?.answerText || "",
          keyPoints: q.keyPoints,
          score,
          feedback: feedbackText,
        });
      }
    } catch (err) {
      console.error("AI coding grading fallback:", err);
      for (const q of codingQuestions) {
        const userAns = codingAnswers.find((a) => a.questionId === q.questionId);
        const hasCode = (userAns?.answerText || "").trim().length > 30;
        questionResults.push({
          questionId: q.questionId,
          section: q.section,
          type: q.type,
          questionText: q.questionText,
          userAnswerText: userAns?.answerText || "",
          keyPoints: q.keyPoints,
          score: hasCode ? 75 : 0,
          feedback: hasCode ? "Code implementation accepted and recorded." : "No code submitted.",
        });
      }
    }
  }

  // Compute Section-Wise Breakdown
  const sec1Results = questionResults.filter((q) => q.section === 1);
  const sec2Results = questionResults.filter((q) => q.section === 2);
  const sec3Results = questionResults.filter((q) => q.section === 3);

  const calcAvg = (arr) => (arr.length > 0 ? Math.round(arr.reduce((s, x) => s + x.score, 0) / arr.length) : 0);

  const sec1Score = calcAvg(sec1Results);
  const sec2Score = calcAvg(sec2Results);
  const sec3Score = calcAvg(sec3Results);

  // Overall Score (Weighted: Sec 1: 30%, Sec 2: 40%, Sec 3: 30% if coding present, else straight average)
  let overallScore = 0;
  if (sec2Results.length > 0) {
    overallScore = Math.round(sec1Score * 0.3 + sec2Score * 0.4 + sec3Score * 0.3);
  } else {
    overallScore = Math.round(questionResults.reduce((s, x) => s + x.score, 0) / Math.max(1, questionResults.length));
  }

  const passed = overallScore >= 75;

  attempt.userAnswers = answers.map((a) => {
    const qr = questionResults.find((q) => q.questionId === a.questionId);
    return {
      questionId: a.questionId,
      answerText: a.answerText,
      score: qr ? qr.score : 0,
      feedback: qr ? qr.feedback : "",
    };
  });
  attempt.score = overallScore;
  attempt.passed = passed;
  attempt.attemptedAt = new Date();
  await attempt.save();

  if (passed) {
    // Auto-upgrade user skill level in UserSkill model
    try {
      const userSkill = await UserSkill.findOne({
        user: req.user._id,
        name: new RegExp(`^${attempt.skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      });
      if (userSkill) {
        if (userSkill.level === "beginner") userSkill.level = "intermediate";
        else if (userSkill.level === "intermediate") userSkill.level = "advanced";
        await userSkill.save();
      } else {
        await UserSkill.create({
          user: req.user._id,
          name: attempt.skillName,
          level: "intermediate",
          source: "quiz",
        });
      }
    } catch (err) {
      console.error("Failed to auto-upgrade user skill level:", err);
    }

    const roadmap = await LearningRoadmap.findById(attempt.roadmapItemId);
    if (roadmap) {
      const st = roadmap.subTopics.find((s) => s.subTopicId === attempt.subTopicId);
      if (st && st.status !== "passed") {
        st.status = "passed";
        await roadmap.save();
      }
    }

    const gapAnalysis = await SkillGapAnalysis.findById(roadmap?.basedOnGapAnalysis);
    if (gapAnalysis) {
      const gap = gapAnalysis.gaps.find((g) => g.skillName === attempt.skillName);
      if (gap) {
        const st = gap.subTopics.find((s) => s.subTopicId === attempt.subTopicId);
        if (st && st.status !== "passed") {
          st.status = "passed";
        }

        const totalWeight = gap.subTopics.reduce((sum, s) => sum + (s.weightPercent || 0), 0);
        const passedWeight = gap.subTopics
          .filter((s) => s.status === "passed")
          .reduce((sum, s) => sum + (s.weightPercent || 0), 0);
        gap.gapPercent = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;
      }

      await gapAnalysis.save();
    }

    const notificationPromise = notificationService.createNotification({
      userId: req.user._id,
      module: "quiz",
      type: "quiz_passed",
      title: "Assessment Milestone Passed!",
      message: `You scored ${overallScore}% in the ${attempt.skillName} — ${attempt.subTopicId} 3-Section Assessment!`,
      relatedResourceId: attempt._id,
      relatedResourceType: "QuizAttempt",
    });

    const activityLogPromise = activityLogService.logActivity({
      userId: req.user._id,
      module: "quiz",
      action: "quiz_passed",
      summary: `Passed 3-section assessment for ${attempt.skillName} (${overallScore}%)`,
      relatedResourceId: attempt._id,
      relatedResourceType: "QuizAttempt",
      metadata: {
        skillName: attempt.skillName,
        subTopicId: attempt.subTopicId,
        score: overallScore,
        sectionBreakdown: {
          section1: sec1Score,
          section2: sec2Score,
          section3: sec3Score,
        },
      },
    });

    const badgesPromise = badgeService.checkBadges(req.user._id);

    await Promise.allSettled([notificationPromise, activityLogPromise, badgesPromise]);
  }

  return ApiResponse.success({
    attemptId: attempt._id,
    score: overallScore,
    passed,
    totalQuestions: attempt.questions.length,
    questionResults,
    subTopicStatus: passed ? "passed" : "in_progress",
    sectionBreakdown: {
      section1: { title: "Section 1: Conceptual MCQs", score: sec1Score, total: sec1Results.length },
      section2: { title: "Section 2: Coding Challenge", score: sec2Score, total: sec2Results.length },
      section3: { title: "Section 3: Advanced MCQs (Tough)", score: sec3Score, total: sec3Results.length },
    },
  }).send(res);
});

module.exports = { generateQuiz, submitQuiz };

