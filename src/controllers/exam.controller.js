const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const PDFParser = require("pdf2json");
const mammoth = require("mammoth");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const Exam = require("../models/Exam.model");
const ExamSubmission = require("../models/ExamSubmission.model");
const User = require("../models/User.model");
const Notification = require("../models/Notification.model");
const ProctoringViolation = require("../models/ProctoringViolation.model");
const notificationService = require("../services/notification.service");
const emailService = require("../services/email.service");
const { invalidateUserCache } = require("../middleware/auth.middleware");
const { evaluateAndAutoUnblockUser } = require("../services/proctoringBlock.service");
const {
  fetchMcqsFromBank,
  parseCodingProblemFromUrl,
  getEmptyStarterCodes,
  PRE_DEVELOPED_MCQ_BANK,
  PRE_DEVELOPED_CODING_BANK,
} = require("../services/questionBank.service");
const { generateContent } = require("../services/ai.service");
const compilerService = require("../services/compiler.service");

/**
 * Heuristically detect programming language from candidate code if not specified
 */
function detectCodeLanguage(code = "") {
  const trimmed = String(code || "").trim();
  if (trimmed.includes("#include") || trimmed.includes("std::") || trimmed.includes("cout <<") || trimmed.includes("cin >>")) {
    return "cpp";
  }
  if (trimmed.includes("public class") || trimmed.includes("System.out.print") || trimmed.includes("public static void main")) {
    return "java";
  }
  if (trimmed.includes("function ") || trimmed.includes("console.log") || trimmed.includes("const ") || trimmed.includes("let ") || trimmed.includes("=>")) {
    return "javascript";
  }
  if (trimmed.toUpperCase().includes("SELECT ") || trimmed.toUpperCase().includes("CREATE TABLE") || trimmed.toUpperCase().includes("INSERT INTO")) {
    return "sql";
  }
  if (trimmed.includes("#include <stdio.h>") || trimmed.includes("printf(")) {
    return "c";
  }
  return "python";
}

/**
 * Recalculate ranks for all submissions of an exam
 */
async function recalculateExamRanks(examId) {
  try {
    const submissions = await ExamSubmission.find({ examId })
      .sort({ totalScore: -1, durationSeconds: 1, submittedAt: 1 })
      .exec();

    let currentRank = 1;
    for (let i = 0; i < submissions.length; i++) {
      submissions[i].rank = currentRank++;
      await submissions[i].save();
    }
  } catch (err) {
    console.error("Error recalculating exam ranks:", err);
  }
}

// ── ADMIN: CREATE EXAM ────────────────────────────────────────────────────────
const createExam = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    examType, // "mcq", "coding", "mixed"
    category = "General Assessment",
    difficulty = "Medium",
    durationMinutes = 60,
    passingScorePercentage = 60,
    targetAudience = "all", // "all", "mentees", "selected"
    assignedStudents = [],
    sections = [],
    proctoringConfig,
    isScheduled = false,
    scheduledStartTime = null,
    scheduledEndTime = null,
  } = req.body;

  if (!title || !examType || !sections || sections.length === 0) {
    throw new ApiError(400, "Title, exam type, and at least one section are required");
  }

  if (!["mcq", "coding", "mixed"].includes(examType)) {
    throw new ApiError(400, "Invalid exam type. Must be 'mcq', 'coding', or 'mixed'");
  }

  // Calculate total marks across all sections
  let totalMarks = 0;
  sections.forEach((sec, sIdx) => {
    if (!sec.sectionId) sec.sectionId = `sec-${sIdx + 1}-${Date.now()}`;
    if (sec.type === "mcq") {
      sec.mcqQuestions?.forEach((q, qIdx) => {
        if (!q.questionId) q.questionId = `q-${sIdx + 1}-${qIdx + 1}`;
        totalMarks += Number(q.positiveMarks) || 1;
      });
    } else if (sec.type === "coding") {
      sec.codingQuestions?.forEach((c, cIdx) => {
        if (!c.id) c.id = `code-${sIdx + 1}-${cIdx + 1}`;
        totalMarks += Number(c.marks) || 10;
        // Strictly sanitize starter code to prevent any solution code leak
        if (!c.starterCodes || typeof c.starterCodes !== "object") {
          c.starterCodes = getEmptyStarterCodes(c.title);
        }
      });
    }
  });

  const isScheduleActive = Boolean(isScheduled && scheduledStartTime);
  const durationMin = Number(durationMinutes) || 60;
  let computedEndTime = null;
  if (isScheduleActive) {
    if (scheduledEndTime) {
      computedEndTime = new Date(scheduledEndTime);
    } else {
      computedEndTime = new Date(new Date(scheduledStartTime).getTime() + durationMin * 60 * 1000);
    }
  }

  const now = new Date();
  let initialStatus = "active";
  if (isScheduleActive) {
    const startTimeDate = new Date(scheduledStartTime);
    if (startTimeDate > now) {
      initialStatus = "scheduled";
    } else if (computedEndTime && computedEndTime < now) {
      initialStatus = "completed";
    }
  }

  // Resolve assignedStudents if targetAudience is "mentees"
  let resolvedAssignedStudents = Array.isArray(assignedStudents) ? assignedStudents : [];
  if (targetAudience === "mentees") {
    const creatorUser = await User.findById(req.user._id).lean();
    const menteeIds = (creatorUser?.mentees || []).map((id) => id.toString());
    const directMentees = await User.find({ assignedMentor: req.user._id }).distinct("_id");
    resolvedAssignedStudents = Array.from(
      new Set([...resolvedAssignedStudents, ...menteeIds, ...directMentees.map((d) => d.toString())])
    );
    // Ensure bidirectional link
    if (resolvedAssignedStudents.length > 0) {
      await User.updateMany(
        { _id: { $in: resolvedAssignedStudents } },
        { $set: { assignedMentor: req.user._id } }
      );
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { mentees: { $each: resolvedAssignedStudents } },
      });
    }
  }

  const exam = await Exam.create({
    title,
    description,
    examType,
    category,
    difficulty,
    durationMinutes: durationMin,
    passingScorePercentage: Number(passingScorePercentage) || 60,
    totalMarks: totalMarks || 100,
    targetAudience,
    assignedStudents: resolvedAssignedStudents,
    sections,
    proctoringConfig: proctoringConfig || {
      webcamRequired: false,
      fullscreenEnforced: true,
      tabSwitchLimit: 3,
      aiFaceDetection: false,
      copyPasteDisabled: false,
    },
    isResultDisclosed: false, // Default: Marks concealed from students
    isPublished: true,
    isScheduled: Boolean(isScheduleActive),
    scheduledStartTime: isScheduleActive ? new Date(scheduledStartTime) : null,
    scheduledEndTime: computedEndTime,
    status: initialStatus,
    createdBy: req.user._id,
  });

  // Send real-time notifications to assigned students/mentees
  if (resolvedAssignedStudents.length > 0 || targetAudience === "all") {
    try {
      const recipientIds =
        targetAudience === "all"
          ? (await User.find({ role: "student" }).distinct("_id")).map((id) => id.toString())
          : resolvedAssignedStudents;

      const notifTitle = targetAudience === "mentees" ? "New Mentor Assessment Assigned" : "New Assessment Available";
      const notifMessage = `Your mentor ${req.user.name || "Faculty"} has assigned a new test: "${title}".`;

      // Dispatch in-app notifications and email alerts to all recipients
      const recipients = await User.find({ _id: { $in: recipientIds } }).select("name email").lean();
      for (const recipient of recipients) {
        const notif = await Notification.create({
          user: recipient._id,
          type: "exam_assigned",
          title: notifTitle,
          message: notifMessage,
          actionUrl: "/tests",
          read: false,
        });
        notificationService.pushToOpenConnections(recipient._id, notif);

        // Send professional email notification asynchronously
        emailService.sendExamAssignedEmail(recipient, exam, req.user.name || "Your Mentor").catch((e) =>
          console.error(`[Email] Failed to send exam assigned email to ${recipient.email}:`, e.message)
        );
      }
    } catch (notifErr) {
      console.error("[Exam] Failed to send creation notifications:", notifErr);
    }
  }

  return res
    .status(201)
    .json(new ApiResponse(201, exam, "Exam created successfully!"));
});

// ── ADMIN: GET ALL EXAMS LIST ────────────────────────────────────────────────
const getAdminExams = asyncHandler(async (req, res) => {
  const { examType, search, status } = req.query;

  const filter = {};
  if (examType && examType !== "all") {
    filter.examType = examType;
  }
  if (status && status !== "all") {
    filter.status = status;
  }
  if (search) {
    filter.title = { $regex: search, $options: "i" };
  }

  const exams = await Exam.find(filter)
    .sort({ createdAt: -1 })
    .populate("assignedStudents", "name email profile.registerNumber")
    .lean();

  const now = new Date();

  // Aggregate submission stats for each exam
  const examIds = exams.map((e) => e._id);
  const submissionsCountMap = await ExamSubmission.aggregate([
    { $match: { examId: { $in: examIds } } },
    {
      $group: {
        _id: "$examId",
        totalSubmissions: { $sum: 1 },
        avgScore: { $avg: "$totalScore" },
        passedCount: {
          $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] },
        },
      },
    },
  ]);

  const statsLookup = {};
  submissionsCountMap.forEach((s) => {
    statsLookup[s._id.toString()] = {
      totalSubmissions: s.totalSubmissions,
      avgScore: Math.round(s.avgScore || 0),
      passedCount: s.passedCount,
    };
  });

  const enrichedExams = exams.map((e) => {
    let computedStatus = e.status || "active";
    const effectiveEndTime = e.scheduledEndTime
      ? new Date(e.scheduledEndTime)
      : e.scheduledStartTime
      ? new Date(new Date(e.scheduledStartTime).getTime() + (Number(e.durationMinutes) || 60) * 60 * 1000)
      : null;

    if (computedStatus !== "stopped" && e.isScheduled) {
      if (e.scheduledStartTime && new Date(e.scheduledStartTime) > now) {
        computedStatus = "scheduled";
      } else if (effectiveEndTime && effectiveEndTime < now) {
        computedStatus = "completed";
      } else if (e.scheduledStartTime && new Date(e.scheduledStartTime) <= now) {
        computedStatus = "active";
      }
    }

    return {
      ...e,
      status: computedStatus,
      stats: statsLookup[e._id.toString()] || {
        totalSubmissions: 0,
        avgScore: 0,
        passedCount: 0,
      },
    };
  });

  return res
    .status(200)
    .json(new ApiResponse(200, enrichedExams, "Exams retrieved successfully"));
});

// ── ADMIN: GET SINGLE EXAM DETAIL ────────────────────────────────────────────
const getAdminExamDetail = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  const exam = await Exam.findById(examId)
    .populate("assignedStudents", "name email avatar profile.registerNumber")
    .populate("createdBy", "name email");

  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, exam, "Exam details retrieved successfully"));
});

// ── ADMIN: DELETE EXAM ────────────────────────────────────────────────────────
const deleteExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  const exam = await Exam.findByIdAndDelete(examId);
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  // Also clean up submissions
  await ExamSubmission.deleteMany({ examId });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Exam and associated submissions deleted successfully"));
});

// ── ADMIN: TOGGLE RESULT DISCLOSURE ──────────────────────────────────────────
const toggleResultDisclosure = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { isResultDisclosed } = req.body;

  const exam = await Exam.findById(examId);
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  // If explicit boolean passed, use it; otherwise toggle
  exam.isResultDisclosed =
    typeof isResultDisclosed === "boolean"
      ? isResultDisclosed
      : !exam.isResultDisclosed;

  await exam.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        examId: exam._id,
        isResultDisclosed: exam.isResultDisclosed,
      },
      `Exam results are now ${exam.isResultDisclosed ? "DISCLOSED to students" : "CONCEALED / HIDDEN from students"}`
    )
  );
});

// ── ADMIN: TOGGLE EXAM RETAKES PERMISSION ────────────────────────────────────
const toggleExamRetakes = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { allowRetakes } = req.body;

  const exam = await Exam.findById(examId);
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  exam.allowRetakes =
    typeof allowRetakes === "boolean" ? allowRetakes : !exam.allowRetakes;

  await exam.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        examId: exam._id,
        allowRetakes: exam.allowRetakes,
      },
      `Exam retakes are now ${exam.allowRetakes ? "PERMITTED" : "DISABLED"}`
    )
  );
});

// ── ADMIN: STOP EXAM IMMEDIATELY & FINALIZE / AUTO-GRADE SUBMISSIONS ────────
const stopExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  const exam = await Exam.findById(examId);
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  exam.status = "stopped";
  exam.stoppedAt = new Date();
  exam.stoppedBy = req.user._id;
  exam.isPublished = false;
  await exam.save();

  // Find all in-progress or pending submissions for this exam and finalize scores
  const inProgressSubmissions = await ExamSubmission.find({
    examId,
    status: { $in: ["in_progress", "disqualified", "blocked"] },
  });

  for (const sub of inProgressSubmissions) {
    if (sub.status !== "submitted" && sub.status !== "evaluated") {
      sub.status = "submitted";
      sub.submittedAt = sub.submittedAt || new Date();
      await sub.save();
    }
  }

  // Recalculate ranks for all candidate submissions up to stoppage
  await recalculateExamRanks(examId);

  // Send real-time notification to any assigned students taking the exam
  try {
    const studentIds = await ExamSubmission.distinct("userId", { examId });
    for (const sid of studentIds) {
      const notif = await Notification.create({
        user: sid,
        type: "exam_stopped",
        title: "Assessment Concluded",
        message: `The examination '${exam.title}' has been concluded by the faculty/administrator. Your results have been calculated up to the stoppage point.`,
        actionUrl: "/tests",
        read: false,
      });
      notificationService.pushToOpenConnections(sid, notif);
      
      // Send email alert to student explaining the lock
      emailService.sendProctoringBlockedEmail(student, {
        examTitle: (await Exam.findById(examId).select("title").lean())?.title || "Assessment",
        reason: reason || "Manual disqualification by faculty / mentor",
        violationCount: 3,
        mentorName: req.user.name || "Your Mentor",
      }).catch((e) => console.error("[Email] Failed to send block email:", e.message));
    }
  } catch (err) {
    console.error("[Exam] Failed to broadcast stop notification:", err);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        examId: exam._id,
        status: "stopped",
        stoppedAt: exam.stoppedAt,
        finalizedSubmissionsCount: inProgressSubmissions.length,
      },
      `Exam '${exam.title}' stopped successfully. All candidate results have been evaluated up to the stoppage time.`
    )
  );
});

// ── ADMIN: GET ACTIVE EXAMS WITH LIVE TAKERS (GROUPED BY EXAM) ───────────────
const getActiveExamsWithLiveTakers = asyncHandler(async (_req, res) => {
  const activeExams = await Exam.find({
    status: { $in: ["active", "scheduled"] },
    isPublished: true,
  })
    .sort({ createdAt: -1 })
    .lean();

  const activeExamIds = activeExams.map((e) => e._id);

  // Find all recent submissions or active takers for these exams
  const recentSubmissions = await ExamSubmission.find({
    examId: { $in: activeExamIds },
  })
    .populate("userId", "name email avatar targetRole isProctoringBlocked proctoringBlockedAt profile")
    .sort({ updatedAt: -1 })
    .lean();

  const groupedMap = new Map();
  activeExams.forEach((e) => {
    groupedMap.set(e._id.toString(), {
      examId: e._id,
      title: e.title,
      examType: e.examType,
      category: e.category,
      difficulty: e.difficulty,
      durationMinutes: e.durationMinutes,
      totalMarks: e.totalMarks,
      status: e.status,
      isScheduled: e.isScheduled,
      scheduledStartTime: e.scheduledStartTime,
      scheduledEndTime: e.scheduledEndTime,
      activeCandidates: [],
      totalCandidates: 0,
      blockedCount: 0,
      warningCount: 0,
    });
  });

  recentSubmissions.forEach((sub) => {
    const examGroup = groupedMap.get(sub.examId.toString());
    if (examGroup) {
      const user = sub.userId || {};
      const isBlocked = Boolean(user.isProctoringBlocked || sub.isBlocked);
      const isWarning = !isBlocked && (sub.violationsCount || 0) > 0;

      examGroup.totalCandidates += 1;
      if (isBlocked) examGroup.blockedCount += 1;
      if (isWarning) examGroup.warningCount += 1;

      examGroup.activeCandidates.push({
        submissionId: sub._id,
        studentId: user._id || sub.userId,
        name: sub.studentName || user.name || "Student",
        email: sub.studentEmail || user.email || "",
        avatar: user.avatar || sub.studentAvatar || "",
        registerNumber: sub.registerNumber || user.profile?.registerNumber || "N/A",
        targetRole: user.targetRole || "Candidate",
        status: isBlocked ? "blocked" : isWarning ? "warning" : sub.status || "in_progress",
        violationsCount: sub.violationsCount || 0,
        violationDetails: sub.violationDetails || [],
        proctoringIntegrity: sub.proctoringIntegrity || 100,
        totalScore: sub.totalScore || 0,
        durationSeconds: sub.durationSeconds || 0,
        submittedAt: sub.submittedAt,
        updatedAt: sub.updatedAt,
      });
    }
  });

  const groupedList = Array.from(groupedMap.values());

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalActiveExams: activeExams.length,
        totalActiveCandidates: recentSubmissions.length,
        exams: groupedList,
      },
      "Live exam takers retrieved successfully"
    )
  );
});

// ── ADMIN: GET EXAM RESULTS (TABULAR ROWS & COLUMNS + PDF DATA) ──────────────
const getExamResults = asyncHandler(async (req, res) => {
  const { examId } = req.params;

  const exam = await Exam.findById(examId).lean();
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  // Fetch all student submissions sorted by totalScore descending
  const submissions = await ExamSubmission.find({ examId })
    .sort({ totalScore: -1, durationSeconds: 1, submittedAt: 1 })
    .populate("userId", "name email avatar profile")
    .lean();

  // Re-rank and map tabular rows
  const resultsTable = submissions.map((sub, idx) => {
    const studentProfile = sub.userId?.profile || {};
    const registerNo =
      studentProfile.registerNumber ||
      sub.registerNumber ||
      sub.userId?._id?.toString().slice(-6).toUpperCase() ||
      "N/A";

    return {
      submissionId: sub._id,
      studentId: sub.userId?._id || sub.userId,
      rank: idx + 1,
      studentName: sub.studentName || sub.userId?.name || "Student",
      studentEmail: sub.studentEmail || sub.userId?.email || "",
      studentAvatar: sub.studentAvatar || sub.userId?.avatar || "",
      registerNumber: registerNo,
      department: studentProfile.department || "Computer Science",
      batch: studentProfile.batch || "2022-2026",
      questionScores: sub.questionScores || [],
      sectionScores: sub.sectionScores || [],
      totalScore: sub.totalScore,
      maxScore: sub.maxScore || exam.totalMarks,
      percentage: sub.percentage,
      passed: sub.passed,
      durationSeconds: sub.durationSeconds,
      proctoringIntegrity: sub.proctoringIntegrity,
      violationsCount: sub.violationsCount,
      status: sub.status,
      submittedAt: sub.submittedAt,
    };
  });

  // Calculate cohort summary stats
  const totalSubmissions = resultsTable.length;
  const passedCount = resultsTable.filter((r) => r.passed).length;
  const avgScore =
    totalSubmissions > 0
      ? Math.round(
          resultsTable.reduce((acc, r) => acc + r.totalScore, 0) / totalSubmissions
        )
      : 0;
  const highestScore =
    totalSubmissions > 0 ? Math.max(...resultsTable.map((r) => r.totalScore)) : 0;
  const lowestScore =
    totalSubmissions > 0 ? Math.min(...resultsTable.map((r) => r.totalScore)) : 0;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        exam: {
          _id: exam._id,
          title: exam.title,
          examType: exam.examType,
          category: exam.category,
          difficulty: exam.difficulty,
          durationMinutes: exam.durationMinutes,
          passingScorePercentage: exam.passingScorePercentage,
          totalMarks: exam.totalMarks,
          isResultDisclosed: exam.isResultDisclosed,
          sections: exam.sections,
        },
        summary: {
          totalSubmissions,
          passedCount,
          failedCount: totalSubmissions - passedCount,
          passPercentage:
            totalSubmissions > 0
              ? Math.round((passedCount / totalSubmissions) * 100)
              : 0,
          avgScore,
          highestScore,
          lowestScore,
        },
        resultsTable,
      },
      "Exam results retrieved successfully"
    )
  );
});

// ── ADMIN: PARSE CODING PROBLEM FROM URL (LEETCODE / HACKERRANK / GFG) ───────
const parseCodingLink = asyncHandler(async (req, res) => {
  const { urlOrTitle } = req.body;

  if (!urlOrTitle) {
    throw new ApiError(400, "URL or problem title is required");
  }

  const problemData = await parseCodingProblemFromUrl(urlOrTitle);

  return res
    .status(200)
    .json(new ApiResponse(200, problemData, "Problem details parsed successfully"));
});

// ── ADMIN: GENERATE AI MCQs ──────────────────────────────────────────────────
const generateAiMcqs = asyncHandler(async (req, res) => {
  const { topics = ["DSA"], difficulty = "medium", count = 5 } = req.body;

  const topicStr = Array.isArray(topics) ? topics.join(", ") : String(topics);
  const prompt = `You are a Principal Computer Science examiner. Generate exactly ${count} high-quality, technically rigorous Multiple Choice Questions (MCQs) for an official campus placement exam.

Topic: ${topicStr}
Difficulty Level: ${difficulty} (easy / medium / hard)

Requirements:
1. Provide realistic, non-trivial questions (including code snippets if relevant).
2. Exactly 4 clear options for each question.
3. 1 correct option index (0, 1, 2, or 3).
4. Detailed technical explanation.
5. Strict JSON array output matching this schema:
[
  {
    "question": "Question text here...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctOptionIndex": 0,
    "correctAnswer": "Option A",
    "positiveMarks": ${difficulty === "hard" ? 3 : difficulty === "medium" ? 2 : 1},
    "negativeMarks": ${difficulty === "hard" ? 0.75 : difficulty === "medium" ? 0.5 : 0.25},
    "explanation": "Why Option A is correct...",
    "topic": "${topicStr.split(",")[0].trim()}",
    "difficulty": "${difficulty}"
  }
]
Output ONLY the raw JSON array.`;

  try {
    const aiResult = await generateContent({
      prompt,
      feature: "exam_generator",
    });

    const rawText =
      aiResult?.raw ||
      (typeof aiResult?.data === "string"
        ? aiResult.data
        : JSON.stringify(aiResult?.data || ""));

    let parsed = [];
    if (Array.isArray(aiResult?.data)) {
      parsed = aiResult.data;
    } else {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      const formatted = parsed.map((q, idx) => ({
        questionId: `ai-mcq-${Date.now()}-${idx}`,
        question: q.question,
        options: q.options || [],
        correctOptionIndex: Number(q.correctOptionIndex) || 0,
        correctAnswer: q.options?.[q.correctOptionIndex] || q.correctAnswer || "",
        positiveMarks: q.positiveMarks || (difficulty === "hard" ? 3 : 2),
        negativeMarks: q.negativeMarks || 0.5,
        explanation: q.explanation || "",
        topic: q.topic || topicStr,
        difficulty: q.difficulty || difficulty,
      }));

      return res
        .status(200)
        .json(new ApiResponse(200, formatted, "AI MCQs generated successfully"));
    }
  } catch (err) {
    console.warn("AI generation failed, falling back to pre-developed bank:", err.message);
  }

  // Fallback to pre-developed question bank
  const fallback = fetchMcqsFromBank({
    topics: Array.isArray(topics) ? topics : [topics],
    difficulty,
    count,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      fallback.map((q, idx) => ({
        questionId: `bank-mcq-${Date.now()}-${idx}`,
        ...q,
      })),
      "Fetched questions from pre-developed question bank"
    )
  );
});

// ── ADMIN: GENERATE AI CODING CHALLENGE ──────────────────────────────────────
const generateAiCoding = asyncHandler(async (req, res) => {
  const { topic = "Algorithms", difficulty = "Medium" } = req.body;

  const prompt = `You are a FAANG Senior Staff Engineer designing an official coding assessment challenge.
Topic: ${topic}
Difficulty: ${difficulty}

Generate a complete coding problem in JSON format with:
- title: concise descriptive title
- difficulty: "${difficulty}"
- category: "${topic}"
- problemStatement: Markdown formatted with description and 2 examples
- inputFormat: description of stdin format
- outputFormat: description of stdout format
- constraints: list of strings (e.g. 1 <= N <= 10^5)
- marks: ${difficulty === "Hard" ? 20 : difficulty === "Medium" ? 15 : 10}
- testCases: Array of 4 test cases (2 sample, 2 hidden with isHidden: true)

Output ONLY valid JSON matching this schema:
{
  "title": "Problem Title",
  "difficulty": "${difficulty}",
  "category": "${topic}",
  "problemStatement": "...",
  "inputFormat": "...",
  "outputFormat": "...",
  "constraints": ["..."],
  "marks": 15,
  "testCases": [
    { "input": "...", "expectedOutput": "...", "description": "...", "isHidden": false },
    { "input": "...", "expectedOutput": "...", "description": "...", "isHidden": false },
    { "input": "...", "expectedOutput": "...", "description": "...", "isHidden": true },
    { "input": "...", "expectedOutput": "...", "description": "...", "isHidden": true }
  ]
}`;

  try {
    const aiResult = await generateContent({
      prompt,
      feature: "exam_generator",
    });

    const rawText =
      aiResult?.raw ||
      (typeof aiResult?.data === "string"
        ? aiResult.data
        : JSON.stringify(aiResult?.data || ""));

    let parsed = null;
    if (aiResult?.data && typeof aiResult.data === "object" && !Array.isArray(aiResult.data)) {
      parsed = aiResult.data;
    } else {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }

    if (parsed) {
      const challenge = {
        id: `ai-code-${Date.now()}`,
        title: parsed.title || "Algorithm Challenge",
        difficulty: parsed.difficulty || difficulty,
        category: parsed.category || topic,
        problemStatement: parsed.problemStatement,
        diagramUrl: "",
        inputFormat: parsed.inputFormat || "Standard Input",
        outputFormat: parsed.outputFormat || "Standard Output",
        constraints: parsed.constraints || [],
        marks: parsed.marks || 15,
        starterCodes: getEmptyStarterCodes(parsed.title), // STRICT: NO solution code!
        testCases: parsed.testCases || [],
      };

      return res
        .status(200)
        .json(new ApiResponse(200, challenge, "AI coding challenge generated"));
    }
  } catch (err) {
    console.warn("AI coding generation failed, using catalog:", err.message);
  }

  const sample = PRE_DEVELOPED_CODING_BANK[0];
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...sample,
        id: `code-${Date.now()}`,
        starterCodes: getEmptyStarterCodes(sample.title),
      },
      "Fetched coding challenge from catalog"
    )
  );
});

// ── PDF & DOCUMENT EXTRACTION HELPERS ─────────────────────────────────────────
function extractPdfText(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataError", (err) => {
      reject(new Error(err?.parserError || "Failed to parse PDF"));
    });
    parser.on("pdfParser_dataReady", (pdfData) => {
      try {
        const texts = [];
        pdfData.Pages.forEach((page) => {
          page.Texts.forEach((t) => {
            t.R.forEach((r) => {
              try {
                texts.push(decodeURIComponent(r.T));
              } catch {
                texts.push(r.T);
              }
            });
          });
        });
        resolve(texts.join(" "));
      } catch (e) {
        reject(new Error("Failed to extract text from PDF: " + e.message));
      }
    });
    parser.loadPDF(filePath);
  });
}

async function extractTextFromExamFile(filePath, ext) {
  if (ext === ".pdf") {
    return await extractPdfText(filePath);
  } else if (ext === ".docx") {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } else if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }
  throw new Error(`Unsupported file extension: ${ext}`);
}

function regexHeuristicExtractor(text, defaultTopic = "General Assessment", defaultDifficulty = "medium") {
  const questions = [];
  const chunks = text
    .split(/(?=(?:^|\n|\r)\s*(?:Q(?:uestion)?\s*)?\d+[\.\:\)\-]\s+)/i)
    .filter((c) => c.trim().length > 20);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    const optSplit = chunk.split(
      /(?=(?:^|\n|\r|\s)\s*(?:[A-Da-d][\.\)]|\([A-Da-d]\))\s+)/
    );
    if (optSplit.length >= 2) {
      const qText = optSplit[0]
        .replace(/^(?:Q(?:uestion)?\s*)?\d+[\.\:\)\-]\s*/i, "")
        .trim();
      const rawOptions = optSplit.slice(1);
      const options = [];
      let correctIdx = 0;

      const ansMatch = chunk.match(
        /(?:Ans(?:wer)?|Key|Correct(?:\s*Option)?)\s*[:=\-]?\s*([A-Da-d]|\d+)/i
      );
      if (ansMatch) {
        const val = ansMatch[1].toUpperCase();
        if (val === "A" || val === "1") correctIdx = 0;
        else if (val === "B" || val === "2") correctIdx = 1;
        else if (val === "C" || val === "3") correctIdx = 2;
        else if (val === "D" || val === "4") correctIdx = 3;
      }

      for (let j = 0; j < Math.min(4, rawOptions.length); j++) {
        let cleanOpt = rawOptions[j]
          .replace(/^[A-Da-d][\.\)]\s*|\([A-Da-d]\)\s*/i, "")
          .replace(/(?:Ans(?:wer)?|Key|Correct(?:\s*Option)?)\s*[:=\-]?\s*[A-Da-d0-9].*$/is, "")
          .trim();
        if (/\*|\[x\]|\(correct\)/i.test(rawOptions[j])) {
          correctIdx = j;
          cleanOpt = cleanOpt.replace(/\*|\[x\]|\(correct\)/gi, "").trim();
        }
        options.push(cleanOpt || `Option ${String.fromCharCode(65 + j)}`);
      }

      while (options.length < 4) {
        options.push(`Option ${String.fromCharCode(65 + options.length)}`);
      }

      questions.push({
        questionId: `doc-mcq-heur-${Date.now()}-${i}`,
        question: qText || `Extracted Question ${i + 1}`,
        options,
        correctOptionIndex: correctIdx,
        correctAnswer: options[correctIdx] || options[0],
        positiveMarks: defaultDifficulty === "hard" ? 3 : 2,
        negativeMarks: 0.5,
        explanation: "Parsed from question paper document structure.",
        topic: defaultTopic,
        difficulty: defaultDifficulty,
      });
    }
  }

  return questions;
}

async function parseExamQuestionsWithAI(
  rawText,
  sectionType = "mcq",
  defaultTopic = "General Aptitude",
  defaultDifficulty = "medium"
) {
  if (!rawText || rawText.trim().length < 15) {
    throw new ApiError(400, "Document contains insufficient text to extract questions.");
  }

  const prompt = `You are a Principal Assessment Engineer and Test Question Extractor.
Extract ALL Multiple Choice Questions (MCQs) along with their choices, marked or correct answers, explanations, topics, and difficulties from the following test paper text.

DOCUMENT TEXT:
"""
${rawText.slice(0, 15000)}
"""

Target Section Type: ${sectionType}
Default Topic: ${defaultTopic}
Default Difficulty: ${defaultDifficulty}

EXTRACTION RULES:
1. Identify every individual question statement.
2. Extract all 4 choices/options (A, B, C, D) cleanly without leading prefixes like 'A.', '1.', etc.
3. Detect the indicated, marked, or highlighted correct answer (e.g. marked with 'Ans:', 'Answer:', 'Key:', '[X]', bolding, or an answer key list at the bottom). If no correct answer is explicitly marked, infer the single most technically accurate answer.
4. "correctOptionIndex": 0-indexed integer (0 for A, 1 for B, 2 for C, 3 for D).
5. "correctAnswer": Exact string matching options[correctOptionIndex].
6. "explanation": 1-2 sentences of clear technical explanation for why that answer is correct.
7. "topic": Specific sub-topic (e.g. "React", "SQL Queries", "OOP Concepts", etc.).
8. "difficulty": "easy", "medium", or "hard".
9. "positiveMarks": ${defaultDifficulty === "hard" ? 3 : 2}, "negativeMarks": 0.5.

Return STRICT JSON array output matching this schema:
[
  {
    "question": "Full question statement here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctOptionIndex": 0,
    "correctAnswer": "Option A",
    "explanation": "Why Option A is correct...",
    "topic": "${defaultTopic}",
    "difficulty": "${defaultDifficulty}",
    "positiveMarks": 2,
    "negativeMarks": 0.5
  }
]
Output ONLY the raw JSON array.`;

  try {
    const aiResult = await generateContent({
      prompt,
      feature: "exam_generator",
    });

    const rawOutput =
      aiResult?.raw ||
      (typeof aiResult?.data === "string"
        ? aiResult.data
        : JSON.stringify(aiResult?.data || ""));

    let parsed = [];
    if (Array.isArray(aiResult?.data)) {
      parsed = aiResult.data;
    } else {
      const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((q, idx) => ({
        questionId: `doc-mcq-${Date.now()}-${idx}`,
        question: q.question || `Extracted Question ${idx + 1}`,
        options:
          Array.isArray(q.options) && q.options.length >= 2
            ? q.options
            : ["Option A", "Option B", "Option C", "Option D"],
        correctOptionIndex:
          typeof q.correctOptionIndex === "number" &&
          q.correctOptionIndex >= 0 &&
          q.correctOptionIndex < 4
            ? q.correctOptionIndex
            : 0,
        correctAnswer:
          q.options?.[q.correctOptionIndex] ||
          q.correctAnswer ||
          q.options?.[0] ||
          "",
        positiveMarks:
          Number(q.positiveMarks) || (q.difficulty === "hard" ? 3 : 2),
        negativeMarks:
          Number(q.negativeMarks) || (q.difficulty === "hard" ? 0.75 : 0.5),
        explanation: q.explanation || "Extracted from uploaded document.",
        topic: q.topic || defaultTopic,
        difficulty: q.difficulty || defaultDifficulty,
      }));
    }
  } catch (err) {
    console.warn("[Document Extraction AI] Fallback to regex heuristic parser:", err.message);
  }

  const heuristic = regexHeuristicExtractor(rawText, defaultTopic, defaultDifficulty);
  if (heuristic.length > 0) {
    return heuristic;
  }

  throw new ApiError(422, "Could not identify distinct questions with options from the provided document.");
}

// ── ADMIN: EXTRACT QUESTIONS FROM FILE (.pdf, .docx, .txt) ────────────────────
const extractQuestionsFromFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Please upload a valid .pdf, .docx, or .txt question paper document.");
  }

  const { path: filePath, originalname } = req.file;
  const ext = path.extname(originalname).toLowerCase();
  const {
    sectionType = "mcq",
    topic = "General Aptitude",
    difficulty = "medium",
  } = req.body;

  let rawText = "";
  try {
    rawText = await extractTextFromExamFile(filePath, ext);
  } catch (err) {
    throw new ApiError(422, `Failed to parse document: ${err.message}`);
  } finally {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn("Could not remove temp upload file:", e.message);
    }
  }

  if (!rawText || rawText.trim().length < 20) {
    throw new ApiError(400, "The uploaded file does not contain readable text or questions.");
  }

  const extractedQuestions = await parseExamQuestionsWithAI(
    rawText,
    sectionType,
    topic,
    difficulty
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalExtracted: extractedQuestions.length,
        fileName: originalname,
        questions: extractedQuestions,
      },
      `Successfully extracted ${extractedQuestions.length} questions from ${originalname}`
    )
  );
});

// ── ADMIN: EXTRACT QUESTIONS FROM RAW TEXT ────────────────────────────────────
const extractQuestionsFromText = asyncHandler(async (req, res) => {
  const {
    text,
    sectionType = "mcq",
    topic = "General Aptitude",
    difficulty = "medium",
  } = req.body;

  if (!text || text.trim().length < 20) {
    throw new ApiError(400, "Please provide question text with at least 20 characters.");
  }

  const extractedQuestions = await parseExamQuestionsWithAI(
    text,
    sectionType,
    topic,
    difficulty
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalExtracted: extractedQuestions.length,
        questions: extractedQuestions,
      },
      `Successfully extracted ${extractedQuestions.length} questions`
    )
  );
});

/**
 * Strict authorization check: Verifies if a student is assigned to take an exam.
 */
function isStudentAuthorizedForExam(exam, studentId, user) {
  if (!exam || !exam.isPublished || exam.status === "stopped") {
    return false;
  }
  const studentIdStr = studentId ? studentId.toString() : "";

  // 1. If targetAudience is "all" or general (open to all students):
  if (!exam.targetAudience || exam.targetAudience === "all") {
    return true;
  }

  // 2. If assignedStudents explicitly contains this student:
  if (Array.isArray(exam.assignedStudents) && exam.assignedStudents.length > 0) {
    if (exam.assignedStudents.some((id) => id && id.toString() === studentIdStr)) {
      return true;
    }
  }

  // 3. If targetAudience is "mentees":
  if (exam.targetAudience === "mentees") {
    const creatorIdStr = exam.createdBy ? exam.createdBy.toString() : "";
    const studentMentorStr = user?.assignedMentor ? user.assignedMentor.toString() : "";
    if (creatorIdStr && studentMentorStr && creatorIdStr === studentMentorStr) {
      return true;
    }
  }

  return false;
}

// ── STUDENT: GET AVAILABLE EXAMS ─────────────────────────────────────────────
const getStudentAvailableExams = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const user = await User.findById(studentId).lean();
  const mentorId = user?.assignedMentor;

  // Find all mentors who have this student in their mentees list:
  const mentorUsers = await User.find({
    mentees: studentId,
    role: { $in: ["mentor", "admin"] },
  }).distinct("_id");

  const validMentorIds = Array.from(
    new Set([
      ...(mentorId ? [mentorId.toString()] : []),
      ...mentorUsers.map((m) => m.toString()),
    ])
  );

  // Build query to fetch tests available for this student:
  const query = {
    isPublished: { $ne: false },
    status: { $ne: "stopped" },
    $or: [
      // 1. Explicitly assigned by individual candidate selection (ObjectId or String)
      { assignedStudents: studentId },
      { assignedStudents: studentId.toString() },
      // 2. Mentees cohort created by any of student's assigned mentors
      ...(validMentorIds.length > 0
        ? [{ targetAudience: "mentees", createdBy: { $in: validMentorIds } }]
        : []),
      // 3. Open to all students
      { targetAudience: "all" },
      { targetAudience: { $exists: false } },
      { targetAudience: null },
      { targetAudience: "" },
    ],
  };

  const exams = await Exam.find(query)
    .sort({ createdAt: -1 })
    .select("-sections.mcqQuestions.correctOptionIndex -sections.mcqQuestions.correctAnswer -sections.mcqQuestions.explanation")
    .lean();

  // Check which exams student has already submitted
  const submissions = await ExamSubmission.find({
    userId: studentId,
    examId: { $in: exams.map((e) => e._id) },
  }).lean();

  const subMap = {};
  submissions.forEach((s) => {
    // Only real finished submissions count as submitted
    const isCompleted =
      !s.isBlocked && (s.status === "submitted" || s.status === "evaluated");
    const isDisqualifiedOrBlocked =
      Boolean(s.isBlocked || s.status === "disqualified" || s.status === "blocked");
    const isInProgress = s.status === "in_progress";

    subMap[s.examId.toString()] = {
      isSubmitted: isCompleted,
      isBlocked: isDisqualifiedOrBlocked,
      isInProgress,
      submittedAt: s.submittedAt,
      status: s.status,
    };
  });

  const now = new Date();

  const studentExams = exams.map((exam) => {
    let computedStatus = exam.status || "active";
    const effectiveEndTime = exam.scheduledEndTime
      ? new Date(exam.scheduledEndTime)
      : exam.scheduledStartTime
      ? new Date(new Date(exam.scheduledStartTime).getTime() + (Number(exam.durationMinutes) || 60) * 60 * 1000)
      : null;

    if (computedStatus !== "stopped" && exam.isScheduled) {
      if (exam.scheduledStartTime && new Date(exam.scheduledStartTime) > now) {
        computedStatus = "scheduled";
      } else if (effectiveEndTime && effectiveEndTime < now) {
        computedStatus = "completed";
      } else if (exam.scheduledStartTime && new Date(exam.scheduledStartTime) <= now) {
        computedStatus = "active";
      }
    }

    const subInfo = subMap[exam._id.toString()];
    const hasAttempted = Boolean(subInfo?.isSubmitted);
    const isStudentBlocked = Boolean(subInfo?.isBlocked);
    const isStudentInProgress = Boolean(subInfo?.isInProgress);

    const isExamConcluded = Boolean(computedStatus === "stopped" || computedStatus === "completed");

    const canStart =
      !isExamConcluded &&
      computedStatus === "active" &&
      !isStudentBlocked &&
      (!hasAttempted || Boolean(exam.allowRetakes));

    return {
      _id: exam._id,
      title: exam.title,
      description: exam.description,
      examType: exam.examType,
      category: exam.category,
      difficulty: exam.difficulty,
      durationMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      passingScorePercentage: exam.passingScorePercentage,
      sectionsCount: exam.sections?.length || 0,
      proctoringConfig: exam.proctoringConfig,
      isResultDisclosed: exam.isResultDisclosed,
      allowRetakes: Boolean(exam.allowRetakes), // Only true if explicitly enabled by admin
      isScheduled: Boolean(exam.isScheduled),
      scheduledStartTime: exam.scheduledStartTime,
      scheduledEndTime: effectiveEndTime ? effectiveEndTime.toISOString() : null,
      status: computedStatus,
      isLockedBySchedule: Boolean(exam.isScheduled && exam.scheduledStartTime && new Date(exam.scheduledStartTime) > now),
      isExamStopped: isExamConcluded,
      canStart,
      hasAttempted,
      isStudentBlocked,
      isStudentInProgress,
      submissionStatus: subInfo || null,
    };
  });

  return res
    .status(200)
    .json(new ApiResponse(200, studentExams, "Available exams retrieved"));
});

// ── STUDENT: GET EXAM DATA FOR TAKING (SANITIZED) ─────────────────────────────
const getStudentExamForTaking = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id;

  const exam = await Exam.findById(examId).lean();
  if (!exam || !exam.isPublished) {
    throw new ApiError(404, "Exam not found or is inactive");
  }

  // Strictly enforce batch/student assignment authorization
  const isAuthorized = isStudentAuthorizedForExam(exam, studentId, req.user);
  if (!isAuthorized) {
    throw new ApiError(
      403,
      "You are not assigned to this examination batch. Access is restricted to designated candidates."
    );
  }

  // Check if exam was stopped by admin
  if (exam.status === "stopped") {
    throw new ApiError(
      403,
      "This examination has been concluded by the faculty/administrator."
    );
  }

  // Check if exam is scheduled and within window
  if (exam.isScheduled) {
    const now = new Date();
    if (exam.scheduledStartTime && new Date(exam.scheduledStartTime) > now) {
      throw new ApiError(
        403,
        `This assessment is scheduled to begin on ${new Date(exam.scheduledStartTime).toLocaleString()}. Please wait until the start time.`
      );
    }
    const effectiveEndTime = exam.scheduledEndTime
      ? new Date(exam.scheduledEndTime)
      : exam.scheduledStartTime
      ? new Date(new Date(exam.scheduledStartTime).getTime() + (Number(exam.durationMinutes) || 60) * 60 * 1000)
      : null;
    if (effectiveEndTime && effectiveEndTime < now) {
      throw new ApiError(
        403,
        "The scheduled window for this examination has concluded."
      );
    }
  }

  // Check if student already has a submission record
  const existingSub = await ExamSubmission.findOne({
    examId,
    userId: studentId,
  });

  // Check if user account is globally blocked or subject to 30-minute auto-unblock
  const userBlockStatus = await evaluateAndAutoUnblockUser(req.user);
  const isUserGloballyBlocked = userBlockStatus.isBlocked;

  // If user was unblocked or is not globally blocked, auto-clear any stale submission block
  if (!isUserGloballyBlocked && existingSub && existingSub.isBlocked) {
    existingSub.isBlocked = false;
    if (existingSub.status === "disqualified" || existingSub.status === "blocked") {
      existingSub.status = "in_progress";
    }
    await existingSub.save();
  }

  const isExamBlocked = Boolean(
    isUserGloballyBlocked || (existingSub && existingSub.isBlocked)
  );

  if (isExamBlocked) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          _id: exam._id,
          title: exam.title,
          category: exam.category,
          durationMinutes: exam.durationMinutes,
          sections: [],
          isBlocked: true,
          remainingSeconds: userBlockStatus.remainingSeconds,
          remainingMinutes: userBlockStatus.remainingMinutes,
          blockedReason:
            existingSub?.blockedReason ||
            `Your exam access has been suspended for 30 minutes due to proctoring policy violations. Only your assigned mentor can unblock you early, or access will auto-restore in ${userBlockStatus.remainingMinutes} minute(s).`,
          blockedAt: existingSub?.blockedAt || userBlockStatus.blockedAt || new Date(),
        },
        "Exam session locked: Awaiting mentor unblock or 30-minute auto-unblock"
      )
    );
  }

  // Check if student already submitted and retakes are not permitted
  if (
    existingSub &&
    !existingSub.isBlocked &&
    !exam.allowRetakes &&
    (existingSub.status === "submitted" || existingSub.status === "evaluated")
  ) {
    throw new ApiError(
      403,
      "You have already completed this examination. Retakes are not permitted unless explicitly enabled by your administrator."
    );
  }

  // Sanitize MCQ questions so correct answers are not leaked to client!
  const sanitizedSections = exam.sections.map((sec) => ({
    sectionId: sec.sectionId,
    title: sec.title,
    type: sec.type,
    difficulty: sec.difficulty,
    topics: sec.topics,
    timeLimitMinutes: sec.timeLimitMinutes,
    mcqQuestions: (sec.mcqQuestions || []).map((q) => ({
      questionId: q.questionId,
      question: q.question,
      options: q.options,
      positiveMarks: q.positiveMarks,
      negativeMarks: q.negativeMarks,
      topic: q.topic,
      difficulty: q.difficulty,
      // correctOptionIndex and explanation are deliberately omitted
    })),
    codingQuestions: (sec.codingQuestions || []).map((c) => ({
      id: c.id,
      title: c.title,
      difficulty: c.difficulty,
      category: c.category,
      problemStatement: c.problemStatement,
      diagramUrl: c.diagramUrl || "",
      inputFormat: c.inputFormat,
      outputFormat: c.outputFormat,
      constraints: c.constraints,
      marks: c.marks,
      starterCodes: getEmptyStarterCodes(c.title), // STRICT: only empty starter templates
      testCases: (c.testCases || []).filter((tc) => !tc.isHidden), // only show sample test cases
    })),
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: exam._id,
        title: exam.title,
        description: exam.description,
        examType: exam.examType,
        category: exam.category,
        difficulty: exam.difficulty,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        passingScorePercentage: exam.passingScorePercentage,
        proctoringConfig: exam.proctoringConfig,
        allowRetakes: Boolean(exam.allowRetakes),
        isScheduled: Boolean(exam.isScheduled),
        scheduledStartTime: exam.scheduledStartTime ? new Date(exam.scheduledStartTime).toISOString() : null,
        scheduledEndTime: exam.scheduledEndTime ? new Date(exam.scheduledEndTime).toISOString() : null,
        sections: sanitizedSections,
        alreadySubmitted: Boolean(existingSub),
      },
      "Exam session ready"
    )
  );
});

// ── STUDENT: SUBMIT EXAM RESPONSES (EVALUATE & CONCEAL MARKS) ────────────────
const submitStudentExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id;
  const {
    answers = {}, // { questionId: answerText or selectedOptionIndex }
    codingResults = {}, // { challengeId: { passedCount, totalCount, score, executionTimeMs } }
    durationSeconds = 0,
    violationsCount = 0,
    violationDetails = [],
    proctoringIntegrity = 100,
  } = req.body;

  const exam = await Exam.findById(examId).lean();
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  // Check if exam is stopped or unpublished
  if (exam.status === "stopped" || (!exam.isPublished && exam.status !== "active")) {
    throw new ApiError(
      403,
      "This examination has been concluded by the faculty/administrator."
    );
  }

  // Check scheduled window expiration
  if (exam.isScheduled) {
    const now = new Date();
    const effectiveEndTime = exam.scheduledEndTime
      ? new Date(exam.scheduledEndTime)
      : exam.scheduledStartTime
      ? new Date(new Date(exam.scheduledStartTime).getTime() + (Number(exam.durationMinutes) || 60) * 60 * 1000)
      : null;
    // Allow a 5-minute network tolerance window
    if (effectiveEndTime && now.getTime() > effectiveEndTime.getTime() + 5 * 60 * 1000) {
      throw new ApiError(
        403,
        "The submission window for this scheduled examination has expired."
      );
    }
  }

  // Strictly enforce batch/student assignment authorization
  const isAuthorized = isStudentAuthorizedForExam(exam, studentId, req.user);
  if (!isAuthorized) {
    throw new ApiError(
      403,
      "You are not authorized to submit responses for this examination batch."
    );
  }

  // Check existing submission
  const existingSub = await ExamSubmission.findOne({
    examId,
    userId: studentId,
  });

  // Check if student is blocked/disqualified in database
  const dbViolation = await ProctoringViolation.findOne({
    userId: studentId,
    moduleId: examId,
  }).lean();

  const userBlockStatus = await evaluateAndAutoUnblockUser(req.user);

  const isUserBlocked = Boolean(
    userBlockStatus.isBlocked ||
    existingSub?.isBlocked ||
    dbViolation?.isBlocked ||
    (dbViolation && dbViolation.violationCount >= 3)
  );

  if (isUserBlocked) {
    throw new ApiError(
      403,
      `Your exam access is locked for 30 minutes due to proctoring policy violations. Submissions are not permitted. Only your assigned mentor can unblock you early, or access will auto-restore in ${userBlockStatus.remainingMinutes || 30} minute(s).`
    );
  }

  // Strictly block duplicate submission if retakes are not allowed
  if (existingSub && !exam.allowRetakes && (existingSub.status === "submitted" || existingSub.status === "evaluated")) {
    throw new ApiError(
      403,
      "You have already submitted this examination. Retakes are not permitted."
    );
  }

  const user = await User.findById(studentId).lean();
  const registerNumber =
    user?.profile?.registerNumber ||
    user?.registerNumber ||
    studentId.toString().slice(-6).toUpperCase();

  let totalScore = 0;
  let maxPossibleMarks = 0;
  const questionScores = [];
  const sectionScores = [];

  // Evaluate each section (with multi-language server-side test case execution and verified client run integration)
  for (const sec of (exam.sections || [])) {
    let sectionScore = 0;
    let sectionMax = 0;
    const secType = String(sec.type || "").toLowerCase().trim();

    // 1. MCQ Evaluation
    const mcqList = Array.isArray(sec.mcqQuestions) && sec.mcqQuestions.length > 0
      ? sec.mcqQuestions
      : secType === "mcq" && Array.isArray(sec.questions)
      ? sec.questions
      : [];

    mcqList.forEach((q) => {
      const qId = q.questionId || q.id || q._id;
      const qMax = Number(q.positiveMarks) || Number(q.marks) || 1;
      sectionMax += qMax;
      maxPossibleMarks += qMax;

      const rawAns = answers[qId];
      let selectedIdx = -1;

      if (typeof rawAns === "number") {
        selectedIdx = rawAns;
      } else if (typeof rawAns === "string") {
        const parsed = parseInt(rawAns, 10);
        if (!isNaN(parsed) && String(parsed) === rawAns.trim()) {
          selectedIdx = parsed;
        } else {
          // Check matching option text
          selectedIdx = (q.options || []).findIndex((opt) => opt === rawAns);
        }
      }

      const isCorrect = selectedIdx === q.correctOptionIndex;
      let awardedScore = 0;

      if (isCorrect) {
        awardedScore = qMax;
      } else if (selectedIdx !== -1 && q.negativeMarks) {
        awardedScore = -Math.abs(Number(q.negativeMarks));
      }

      sectionScore += awardedScore;
      questionScores.push({
        questionId: qId,
        questionTitle: (q.question || q.title || "").slice(0, 80),
        type: "mcq",
        userAnswer: selectedIdx !== -1 ? (q.options || [])[selectedIdx] || String(selectedIdx) : "Not Answered",
        selectedOptionIndex: selectedIdx,
        correctOptionIndex: q.correctOptionIndex,
        isCorrect,
        score: awardedScore,
        maxMarks: qMax,
        feedback: isCorrect ? "Correct answer" : "Incorrect answer",
      });
    });

    // 2. Coding Evaluation
    const codingList = Array.isArray(sec.codingQuestions) && sec.codingQuestions.length > 0
      ? sec.codingQuestions
      : (secType === "coding" || secType === "code") && Array.isArray(sec.questions)
      ? sec.questions
      : [];

    for (const c of codingList) {
      const cId = c.id || c.questionId || c._id;
      const cMax = Number(c.marks) || 10;
      sectionMax += cMax;
      maxPossibleMarks += cMax;

      const candidateCode = (answers[cId] || "").trim();
      const clientExec = codingResults[cId] || {};
      const candidateLang = (clientExec.language || detectCodeLanguage(candidateCode) || "python").toLowerCase();

      let serverPassed = 0;
      let serverTotal = Array.isArray(c.testCases) ? c.testCases.length : 0;
      let execTimeMs = Number(clientExec.executionTimeMs) || 15;

      // Evaluate candidate code against test cases directly on the server if code is present
      if (candidateCode) {
        try {
          const execResult = await compilerService.executeCode({
            code: candidateCode,
            language: candidateLang,
            testCases: c.testCases || [],
            questionText: c.problemStatement || c.title,
          });

          serverPassed = Number(execResult.passedCount) || 0;
          serverTotal = Number(execResult.totalCount) || (c.testCases?.length || 1);
          if (execResult.testCaseResults?.[0]?.executionTimeMs) {
            execTimeMs = execResult.testCaseResults[0].executionTimeMs;
          }
        } catch (execErr) {
          console.error(`[Exam Submission] Error executing candidate code for question ${cId}:`, execErr);
        }
      }

      const clientPassed = Number(clientExec.passedCount) || 0;
      const clientTotal = Number(clientExec.totalCount) || (c.testCases?.length || 1);

      // Best verified passed tests across server execution and client verified runs
      const totalTests = Math.max(serverTotal, clientTotal, Array.isArray(c.testCases) ? c.testCases.length : 1, 1);
      const passedTests = candidateCode ? Math.min(totalTests, Math.max(serverPassed, clientPassed)) : 0;

      const ratio = totalTests > 0 ? passedTests / totalTests : 0;
      // Guarantee 100% full marks if all test cases passed (ratio >= 0.99)
      const awardedScore = ratio >= 0.99 ? cMax : Math.round(ratio * cMax);
      const isPassed = ratio >= 0.6 && awardedScore > 0;

      sectionScore += awardedScore;
      questionScores.push({
        questionId: cId,
        questionTitle: c.title || "Coding Challenge",
        type: "coding",
        userAnswer: candidateCode,
        isCorrect: isPassed,
        score: awardedScore,
        maxMarks: cMax,
        testCasesPassed: passedTests,
        totalTestCases: totalTests,
        executionTimeMs: execTimeMs,
        feedback: `${passedTests}/${totalTests} test cases passed`,
      });
    }

    sectionScores.push({
      sectionId: sec.sectionId || `sec-${sectionScores.length + 1}`,
      sectionTitle: sec.title || `Section ${sectionScores.length + 1}`,
      type: sec.type || (codingList.length > 0 ? "coding" : "mcq"),
      score: Math.max(0, sectionScore),
      maxScore: sectionMax,
      percentage: sectionMax > 0 ? Math.round((Math.max(0, sectionScore) / sectionMax) * 100) : 0,
    });

    totalScore += Math.max(0, sectionScore);
  }

  const finalPercentage =
    maxPossibleMarks > 0 ? Math.round((totalScore / maxPossibleMarks) * 100) : 0;
  const isPassed = finalPercentage >= (exam.passingScorePercentage || 60);

  // Compute verified proctoring metrics
  const verifiedViolationsCount = Math.max(
    Number(violationsCount) || 0,
    dbViolation?.violationCount || 0,
    existingSub?.violationsCount || 0
  );

  const verifiedIntegrity = verifiedViolationsCount === 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 - verifiedViolationsCount * 33.3)));

  // Save / Upsert submission
  const submission = await ExamSubmission.findOneAndUpdate(
    { examId, userId: studentId },
    {
      studentName: user?.name || "Student",
      studentEmail: user?.email || "",
      studentAvatar: user?.avatar || "",
      registerNumber,
      sectionScores,
      questionScores,
      totalScore,
      maxScore: maxPossibleMarks || exam.totalMarks,
      percentage: finalPercentage,
      passed: isPassed,
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      proctoringIntegrity: verifiedIntegrity,
      violationsCount: verifiedViolationsCount,
      violationDetails: Array.isArray(violationDetails) ? violationDetails : (dbViolation?.events || []),
      status: "submitted",
      submittedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  // Recalculate ranks asynchronously
  recalculateExamRanks(examId);

  // CRITICAL: DO NOT DISCLOSE MARKS TO THE STUDENT AT SUBMISSION TIME!
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        submissionId: submission._id,
        examTitle: exam.title,
        status: "submitted",
        submittedAt: submission.submittedAt,
        message:
          "Assessment submitted successfully! Your responses and proctoring logs have been recorded securely. Results will be published once reviewed by your faculty/administrator.",
        isResultDisclosed: exam.isResultDisclosed, // false by default
      },
      "Exam submitted successfully!"
    )
  );
});

// ── STUDENT: GET MY RESULTS (WITH SCORECARD WHEN DISCLOSED) ──────────────────
const getStudentMyResults = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const submissions = await ExamSubmission.find({ userId: studentId })
    .populate("examId", "title category difficulty examType durationMinutes passingScorePercentage isResultDisclosed")
    .sort({ submittedAt: -1 })
    .lean();

  // Strictly filter out orphaned submissions or non-submitted in-progress sessions
  const validSubmissions = submissions.filter(
    (sub) =>
      sub.examId &&
      sub.examId._id &&
      sub.examId.title &&
      sub.status !== "in_progress"
  );

  const results = validSubmissions.map((sub) => {
    const exam = sub.examId;
    const isDisclosed = Boolean(exam.isResultDisclosed);

    if (!isDisclosed) {
      // Conceal marks and solutions!
      return {
        submissionId: sub._id,
        examId: exam._id,
        examTitle: exam.title || "Assessment",
        category: exam.category || "General",
        examType: exam.examType || "mixed",
        difficulty: exam.difficulty || "Medium",
        submittedAt: sub.submittedAt,
        durationSeconds: sub.durationSeconds,
        isResultDisclosed: false,
        status: "Pending Evaluation & Disclosure",
        message: "Your results are currently confidential and will be disclosed by your administrator.",
      };
    }

    // Results are Disclosed -> Return full scorecard!
    return {
      submissionId: sub._id,
      examId: exam._id,
      examTitle: exam.title,
      category: exam.category,
      examType: exam.examType,
      difficulty: exam.difficulty,
      submittedAt: sub.submittedAt,
      durationSeconds: sub.durationSeconds,
      isResultDisclosed: true,
      rank: sub.rank || 1,
      totalScore: sub.totalScore ?? 0,
      maxScore: sub.maxScore || 100,
      percentage: sub.percentage ?? 0,
      passed: Boolean(sub.passed),
      proctoringIntegrity: sub.proctoringIntegrity ?? 100,
      violationsCount: sub.violationsCount ?? 0,
      isBlocked: Boolean(sub.isBlocked),
      blockedReason: sub.blockedReason || "",
      sectionScores: sub.sectionScores || [],
      questionScores: sub.questionScores || [],
    };
  });

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Student exam results retrieved"));
});

// ── STUDENT: REPORT EXAM SESSION BLOCKED (VIOLATION LIMIT REACHED) ───────────
const reportStudentExamBlocked = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id;
  const {
    violationsCount = 3,
    violationDetails = [],
    reason = "Exceeded maximum anti-cheat proctoring violations limit",
  } = req.body;

  const exam = await Exam.findById(examId).lean();
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  const user = await User.findById(studentId);
  if (user) {
    user.isProctoringBlocked = true;
    user.proctoringBlockedAt = new Date();
    await user.save();
    invalidateUserCache(studentId);
  }

  // Record/update submission in blocked/disqualified state
  let sub = await ExamSubmission.findOne({ examId, userId: studentId });
  if (!sub) {
    sub = new ExamSubmission({
      examId,
      userId: studentId,
      studentName: user?.name || "Candidate",
      studentEmail: user?.email || "",
      registerNumber:
        user?.profile?.registerNumber || user?.registerNumber || "N/A",
      studentAvatar: user?.avatar || "",
      totalScore: 0,
      maxScore: exam.totalMarks || 100,
      percentage: 0,
      passed: false,
      status: "disqualified",
      isBlocked: true,
      blockedReason: reason,
      blockedAt: new Date(),
      violationsCount,
      violationDetails,
      proctoringIntegrity: 0,
    });
  } else {
    sub.isBlocked = true;
    sub.status = "disqualified";
    sub.blockedReason = reason;
    sub.blockedAt = new Date();
    sub.violationsCount = Math.max(sub.violationsCount || 0, violationsCount);
    sub.violationDetails = Array.from(
      new Set([...(sub.violationDetails || []), ...violationDetails])
    );
  }

  await sub.save();

  // Notify mentor if any
  try {
    if (user?.assignedMentor) {
      const mentorNotification = await Notification.create({
        user: user.assignedMentor,
        type: "proctoring_blocked",
        title: `[Mentee Alert] Exam Blocked: ${user.name}`,
        message: `Your mentee ${user.name} was blocked from exam '${exam.title}' due to security violations. Review and unblock from the admin portal.`,
        actionUrl: "/exams",
        read: false,
      });
      notificationService.pushToOpenConnections(
        user.assignedMentor,
        mentorNotification
      );
    }
  } catch (notifErr) {
    console.error("[Proctoring] Failed to send mentor notification:", notifErr);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        isBlocked: true,
        blockedReason: reason,
        blockedAt: sub.blockedAt,
      },
      "Exam session locked. Awaiting mentor unblock authorization."
    )
  );
});

// ── STUDENT: CHECK EXAM BLOCK / UNBLOCK STATUS & STOPPED STATE ──────────────
const getStudentExamBlockStatus = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user._id;

  const [userBlockStatus, sub, exam] = await Promise.all([
    evaluateAndAutoUnblockUser(studentId),
    ExamSubmission.findOne({ examId, userId: studentId }).select("isBlocked unblockedAt status blockedReason").lean(),
    Exam.findById(examId).select("status isPublished").lean(),
  ]);

  const isBlocked = Boolean(userBlockStatus.isBlocked || sub?.isBlocked);
  const isExamStopped = Boolean(exam?.status === "stopped" || (!exam?.isPublished && exam?.status !== "active"));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        isBlocked,
        remainingSeconds: userBlockStatus.remainingSeconds,
        remainingMinutes: userBlockStatus.remainingMinutes,
        unblockedAt: sub?.unblockedAt,
        status: sub?.status,
        blockedReason: sub?.blockedReason,
        examStatus: exam?.status || "active",
        isExamStopped,
      },
      isBlocked
        ? `Exam session is currently blocked for 30 minutes. ${userBlockStatus.remainingMinutes} minute(s) remaining.`
        : isExamStopped
        ? "Assessment has been concluded by administrator"
        : "Exam session is authorized"
    )
  );
});

// ── ADMIN / MENTOR: UNBLOCK CANDIDATE EXAM SESSION ──────────────────────────
const unblockStudentExamSession = asyncHandler(async (req, res) => {
  const { examId, studentId } = req.params;

  const student = await User.findById(studentId);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  student.isProctoringBlocked = false;
  student.proctoringBlockedAt = null;
  student.proctoringBlockTrack = "classic";
  await student.save();
  invalidateUserCache(studentId);

  // Update ExamSubmission to unblocked
  const sub = await ExamSubmission.findOne({ examId, userId: studentId });
  if (sub) {
    sub.isBlocked = false;
    sub.violationsCount = 0;
    sub.unblockedAt = new Date();
    sub.unblockedBy = req.user._id;
    if (sub.status === "disqualified" || sub.status === "blocked") {
      sub.status = "in_progress";
    }
    await sub.save();
  }

  // Reset proctoring violations for this student in this module
  await ProctoringViolation.updateMany(
    { userId: studentId, moduleId: examId },
    { $set: { isBlocked: false, violationCount: 0, events: [], blockedAt: null } }
  );

  // Send real-time unblock notification to the student
  try {
    const notification = await Notification.create({
      user: studentId,
      type: "proctoring_unblocked",
      title: "Exam Access Unlocked",
      message: `Your exam access has been unlocked by ${
        req.user.name || "your mentor"
      }. You may now resume your examination.`,
      actionUrl: "/tests",
      read: false,
    });
    notificationService.pushToOpenConnections(studentId, notification);

    // Send email to student confirming access restored
    emailService.sendProctoringUnblockedEmail(student, {
      examTitle: examId ? (await Exam.findById(examId).select("title").lean())?.title || "Assessment" : "Assessment",
      mentorName: req.user.name || "Your Mentor",
    }).catch((e) => console.error("[Email] Failed to send unblock email:", e.message));
  } catch (err) {
    console.error("[Proctoring] Failed to send unblock notification:", err);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        studentId,
        examId,
        isBlocked: false,
      },
      `${student.name} has been unblocked successfully. They can now resume the exam.`
    )
  );
});

// ── ADMIN / MENTOR: MANUALLY DISQUALIFY / BLOCK CANDIDATE FROM EXAM ──────────
const blockStudentExamSession = asyncHandler(async (req, res) => {
  const { examId, studentId } = req.params;
  const { reason } = req.body;

  const student = await User.findById(studentId);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  student.isProctoringBlocked = true;
  student.proctoringBlockedAt = new Date();
  await student.save();
  invalidateUserCache(studentId);

  // Update ExamSubmission to blocked
  const sub = await ExamSubmission.findOne({ examId, userId: studentId });
  if (sub) {
    sub.isBlocked = true;
    sub.status = "disqualified";
    sub.blockedReason = reason || "Disqualified by mentor/proctor for violation";
    sub.blockedAt = new Date();
    await sub.save();
  }

  // Upsert proctoring violation record
  await ProctoringViolation.findOneAndUpdate(
    { userId: studentId, moduleId: examId },
    {
      $set: {
        isBlocked: true,
        violationCount: 3,
        blockedAt: new Date(),
      },
      $push: {
        events: {
          violationType: "proctor_manual_disqualification",
          detectedAt: new Date(),
        },
      },
    },
    { upsert: true, new: true }
  );

  // Send real-time notification to the student
  try {
    const notification = await Notification.create({
      user: studentId,
      type: "proctoring_blocked",
      title: "Exam Disqualified / Blocked",
      message: `Your exam session was disqualified by ${
        req.user.name || "the proctor"
      }. Reason: ${reason || "Proctoring integrity violation"}.`,
      actionUrl: "/dashboard",
      read: false,
    });
    notificationService.pushToOpenConnections(studentId, notification);
  } catch (err) {
    console.error("[Proctoring] Failed to send block notification:", err);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        studentId,
        examId,
        isBlocked: true,
      },
      `${student.name} has been disqualified and blocked from this examination.`
    )
  );
});

// ── ADMIN: ASSIGN STUDENTS / BATCH TO EXAM ──────────────────────────────────
const assignExamStudents = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const { targetAudience = "selected", assignedStudents = [] } = req.body;

  const exam = await Exam.findById(examId);
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  exam.targetAudience = targetAudience;
  exam.assignedStudents = Array.isArray(assignedStudents) ? assignedStudents : [];
  await exam.save();

  // Send email alerts and notifications to all assigned students
  if (exam.assignedStudents.length > 0) {
    try {
      const assignedUsers = await User.find({ _id: { $in: exam.assignedStudents } }).select("name email").lean();
      for (const student of assignedUsers) {
        const notif = await Notification.create({
          user: student._id,
          type: "exam_assigned",
          title: "New Assessment Assigned",
          message: `Your mentor ${req.user.name || "Faculty"} has assigned you to test "${exam.title}".`,
          actionUrl: "/tests",
          read: false,
        });
        notificationService.pushToOpenConnections(student._id, notif);
        emailService.sendExamAssignedEmail(student, exam, req.user.name || "Your Mentor").catch((e) =>
          console.error(`[Email] Failed to send assignment email to ${student.email}:`, e.message)
        );
      }
    } catch (e) {
      console.error("[Exam] Error notifying assigned students:", e.message);
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        examId: exam._id,
        targetAudience: exam.targetAudience,
        assignedCount: exam.assignedStudents.length,
        assignedStudents: exam.assignedStudents,
      },
      `Successfully assigned ${exam.assignedStudents.length} candidate(s) to exam batch.`
    )
  );
});

// ── ADMIN / MENTOR: RESCHEDULE EXAM ──────────────────────────────────────────
const rescheduleExam = asyncHandler(async (req, res) => {
  const { examId } = req.params;
  const {
    isScheduled = true,
    scheduledStartTime,
    scheduledEndTime,
    durationMinutes,
    resetSubmissions = false,
    notifyStudents = true,
    reason = "",
  } = req.body;

  const exam = await Exam.findById(examId);
  if (!exam) {
    throw new ApiError(404, "Exam not found");
  }

  if (durationMinutes && Number(durationMinutes) > 0) {
    exam.durationMinutes = Number(durationMinutes);
  }

  const durationMin = Number(exam.durationMinutes) || 60;

  if (isScheduled && !scheduledStartTime) {
    throw new ApiError(400, "Scheduled start time is required when scheduling an exam");
  }

  exam.isScheduled = Boolean(isScheduled);

  if (exam.isScheduled && scheduledStartTime) {
    const start = new Date(scheduledStartTime);
    const end = scheduledEndTime
      ? new Date(scheduledEndTime)
      : new Date(start.getTime() + durationMin * 60 * 1000);

    exam.scheduledStartTime = start;
    exam.scheduledEndTime = end;

    const now = new Date();
    if (start > now) {
      exam.status = "scheduled";
    } else if (end < now) {
      exam.status = "completed";
    } else {
      exam.status = "active";
    }
  } else {
    // Immediate active test
    exam.scheduledStartTime = null;
    exam.scheduledEndTime = null;
    exam.status = "active";
  }

  // Restore active published status and clear any stoppage state
  exam.isPublished = true;
  exam.stoppedAt = null;
  exam.stoppedBy = null;

  await exam.save();

  // If mentor requests to reset past submissions so all students can take the exam freshly
  let resetCount = 0;
  if (resetSubmissions) {
    const delResult = await ExamSubmission.deleteMany({ examId });
    resetCount = delResult.deletedCount || 0;

    // Also clear proctoring blocks for this exam module
    await ProctoringViolation.updateMany(
      { moduleId: examId },
      { $set: { isBlocked: false, violationCount: 0, events: [], blockedAt: null } }
    );

    // Also clear user proctoring block flags for relevant candidates so they can take the rescheduled exam
    if (exam.targetAudience === "selected" && exam.assignedStudents && exam.assignedStudents.length > 0) {
      await User.updateMany(
        { _id: { $in: exam.assignedStudents } },
        { $set: { isProctoringBlocked: false, proctoringBlockedAt: null, proctoringBlockTrack: "classic" } }
      );
    } else if (exam.targetAudience === "mentees") {
      await User.updateMany(
        { assignedMentor: req.user._id },
        { $set: { isProctoringBlocked: false, proctoringBlockedAt: null, proctoringBlockTrack: "classic" } }
      );
    } else {
      await User.updateMany(
        { role: "student" },
        { $set: { isProctoringBlocked: false, proctoringBlockedAt: null, proctoringBlockTrack: "classic" } }
      );
    }
  }

  // Broadcast real-time notification to relevant students if requested
  if (notifyStudents) {
    try {
      let recipientQuery = { role: "student" };
      if (exam.targetAudience === "selected" && exam.assignedStudents && exam.assignedStudents.length > 0) {
        recipientQuery = { _id: { $in: exam.assignedStudents } };
      } else if (exam.targetAudience === "mentees") {
        recipientQuery = { assignedMentor: req.user._id };
      }

      const targetUsers = await User.find(recipientQuery).select("_id").lean();
      const formattedDate = exam.scheduledStartTime
        ? new Date(exam.scheduledStartTime).toLocaleString()
        : "Immediately";

      const notifTitle = "Assessment Rescheduled";
      const notifMessage = `The examination '${exam.title}' has been rescheduled to start at ${formattedDate}.${
        reason ? ` Note: ${reason}` : ""
      }`;

      for (const u of targetUsers) {
        const notif = await Notification.create({
          user: u._id,
          type: "exam_rescheduled",
          title: notifTitle,
          message: notifMessage,
          actionUrl: "/tests",
          read: false,
        });
        notificationService.pushToOpenConnections(u._id, notif);
      }
    } catch (notifErr) {
      console.error("[Exam] Failed to send reschedule notifications:", notifErr);
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        exam,
        resetSubmissionsCount: resetCount,
      },
      `Exam '${exam.title}' rescheduled successfully!`
    )
  );
});

module.exports = {
  createExam,
  getAdminExams,
  getAdminExamDetail,
  deleteExam,
  toggleResultDisclosure,
  toggleExamRetakes,
  stopExam,
  rescheduleExam,
  getActiveExamsWithLiveTakers,
  getExamResults,
  parseCodingLink,
  generateAiMcqs,
  generateAiCoding,
  extractQuestionsFromFile,
  extractQuestionsFromText,
  getStudentAvailableExams,
  getStudentExamForTaking,
  submitStudentExam,
  getStudentMyResults,
  reportStudentExamBlocked,
  getStudentExamBlockStatus,
  unblockStudentExamSession,
  blockStudentExamSession,
  assignExamStudents,
};
