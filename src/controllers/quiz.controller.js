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

function buildQuizPrompt(subTopicName, skillName, resources) {
  const resourceList = resources.map((r) => `- ${r.name} (${r.platform}, ${r.type})`).join("\n");

  return `You are an expert technical instructor creating a focused quiz for a specific learning sub-topic.

Skill: ${skillName}
Sub-topic: ${subTopicName}

Learning resources for this sub-topic:
${resourceList}

Generate 3-5 open-ended questions that test practical understanding of this specific sub-topic. Questions should require the student to explain concepts, not just recall facts.

Requirements:
- Questions should test practical knowledge and conceptual understanding
- Avoid yes/no or single-word answer questions
- Each question must have clear "key points" that a correct answer should cover
- Questions should be scoped to the sub-topic content, not the broader skill

Return a JSON object:
{
  "questions": [
    {
      "questionId": "string (e.g., q1, q2, q3)",
      "questionText": "string",
      "keyPoints": ["string", "string", ...]
    }
  ]
}

Do NOT include any explanation or extra fields. The response must be valid JSON matching this schema exactly.`;
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
      skill = await UserSkill.findOne({ name: roadmapItemId, user: req.user._id });
    }
    if (!skill) {
      throw ApiError.notFound("Roadmap item or Skill not found");
    }
    skillName = skill.name;
    subTopicId = `standalone_${skill._id.toString()}`;
    subTopic = { subTopicId, name: skill.name };
    resources = [];
    isStandaloneSkill = true;
  }

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
            questionText: { type: "string" },
            keyPoints: { type: "array", items: { type: "string" }, minItems: 1 },
          },
          required: ["questionId", "questionText", "keyPoints"],
        },
        minItems: 3,
        maxItems: 5,
      },
    },
    required: ["questions"],
  };

  const prompt = buildQuizPrompt(subTopic.name, skillName, resources);

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

  if (!aiData.questions || aiData.questions.length < 3 || aiData.questions.length > 5) {
    throw ApiError.internal("AI returned invalid question count");
  }

  for (const q of aiData.questions) {
    if (
      !q.questionId ||
      !q.questionText ||
      !Array.isArray(q.keyPoints) ||
      q.keyPoints.length === 0
    ) {
      throw ApiError.internal("AI returned malformed question");
    }
  }

  const attempt = await QuizAttempt.create({
    userId: req.user._id,
    roadmapItemId: isStandaloneSkill ? roadmapItemId : roadmap._id, // if standalone, just store the skill ID
    skillName: skillName,
    subTopicId: subTopicId,
    questions: aiData.questions,
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

  const responseQuestions = aiData.questions.map((q) => ({
    questionId: q.questionId,
    questionText: q.questionText,
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

function buildGradingPrompt(questions, answers, skillName, subTopicName) {
  let prompt = `You are an expert technical instructor grading a student's quiz answers for a specific sub-topic.

Skill: ${skillName}
Sub-topic: ${subTopicName}

For each question below, the question text, the expected key points, and the student's free-text answer are provided. Grade each answer individually on a 0-100 scale based on how well it covers the key points and demonstrates understanding. Provide brief constructive feedback for each answer.

`;

  questions.forEach((q, i) => {
    const answer = answers.find((a) => a.questionId === q.questionId);
    const userAnswer = answer ? answer.answerText : "(no answer provided)";
    prompt += `--- Question ${i + 1} ---
Q: ${q.questionText}
Expected key points: ${q.keyPoints.join(", ")}
Student's answer: ${userAnswer}

`;
  });

  prompt += `Return evaluations in a "perQuestionFeedback" array in the EXACT SAME ORDER as the questions above. Each element must have:
- questionIndex (0-based: 0 for the first question, 1 for the second, etc.)
- score (0-100)
- feedback (string)

Be honest and constructive — highlight genuine understanding but also identify specific gaps.`;

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

  if (answers.length !== attempt.questions.length) {
    throw ApiError.badRequest("Number of answers does not match number of questions");
  }

  for (const a of answers) {
    if (!a.questionId || typeof a.answerText !== "string") {
      throw ApiError.badRequest("Each answer must have questionId and answerText");
    }
  }

  const gradingResponseSchema = {
    type: "object",
    properties: {
      perQuestionFeedback: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionIndex: { type: "integer", minimum: 0 },
            score: { type: "number", minimum: 0, maximum: 100 },
            feedback: { type: "string" },
          },
          required: ["questionIndex", "score", "feedback"],
        },
        minItems: 3,
        maxItems: 5,
      },
    },
    required: ["perQuestionFeedback"],
  };

  const prompt = buildGradingPrompt(
    attempt.questions,
    answers,
    attempt.skillName,
    attempt.subTopicId,
  );

  const gradingResult = await aiService.generateContent({
    prompt,
    responseSchema: gradingResponseSchema,
    feature: "quiz-grading",
    userId: req.user._id,
  });

  if (!gradingResult.success || !gradingResult.data) {
    throw ApiError.internal(gradingResult.message || "AI service failed to grade quiz");
  }

  const gradingData = gradingResult.data;

  if (
    !gradingData.perQuestionFeedback ||
    gradingData.perQuestionFeedback.length !== attempt.questions.length
  ) {
    throw ApiError.internal("AI returned invalid grading feedback count");
  }

  const questionResults = [];
  let totalScore = 0;

  for (let i = 0; i < attempt.questions.length; i++) {
    const question = attempt.questions[i];
    const userAnswer = answers.find((a) => a.questionId === question.questionId);
    const feedback = gradingData.perQuestionFeedback.find((f) => f.questionIndex === i);
    const score = feedback ? Math.round(feedback.score) : 0;
    const feedbackText = feedback ? feedback.feedback : "No feedback available";

    totalScore += score;

    questionResults.push({
      questionId: question.questionId,
      questionText: question.questionText,
      userAnswerText: userAnswer?.answerText || "",
      keyPoints: question.keyPoints,
      score,
      feedback: feedbackText,
    });
  }

  const overallScore = Math.round(totalScore / attempt.questions.length);
  const passed = overallScore >= 80;

  attempt.userAnswers = answers.map((a) => {
    const qr = questionResults.find(q => q.questionId === a.questionId);
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
      title: "Quiz passed",
      message: `You passed the quiz for ${attempt.skillName} — ${attempt.subTopicId} with ${overallScore}%`,
      relatedResourceId: attempt._id,
      relatedResourceType: "QuizAttempt",
    });

    const activityLogPromise = activityLogService.logActivity({
      userId: req.user._id,
      module: "quiz",
      action: "quiz_passed",
      summary: `Passed quiz for ${attempt.skillName} — ${attempt.subTopicId} with ${overallScore}%`,
      relatedResourceId: attempt._id,
      relatedResourceType: "QuizAttempt",
      metadata: {
        skillName: attempt.skillName,
        subTopicId: attempt.subTopicId,
        score: overallScore,
      },
    });

    const badgesPromise = badgeService.checkBadges(req.user._id);

    await Promise.allSettled([notificationPromise, activityLogPromise, badgesPromise]).then(
      (results) => {
        results.forEach((result, idx) => {
          if (result.status === "rejected") {
            const serviceName =
              idx === 0 ? "NotificationService" : idx === 1 ? "ActivityLogService" : "BadgeService";
            console.error(
              `[Background Task] ${serviceName} promise rejected in submitQuiz:`,
              result.reason,
            );
          }
        });
      },
    );
  }

  return ApiResponse.success({
    attemptId: attempt._id,
    score: overallScore,
    passed,
    totalQuestions: attempt.questions.length,
    questionResults,
    subTopicStatus: passed ? "passed" : "in_progress",
  }).send(res);
});

module.exports = { generateQuiz, submitQuiz };
