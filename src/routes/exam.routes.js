const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const verifyJWT = require("../middleware/auth.middleware");
const verifyRole = require("../middleware/role.middleware");
const checkProctoringBlock = require("../middleware/proctoringBlock.middleware");
const {
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
  getStudentAvailableExams,
  getStudentExamForTaking,
  submitStudentExam,
  getStudentMyResults,
  reportStudentExamBlocked,
  getStudentExamBlockStatus,
  unblockStudentExamSession,
  blockStudentExamSession,
  assignExamStudents,
} = require("../controllers/exam.controller");

const router = Router();

const examSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: {
    success: false,
    message: "Too many submission attempts, please wait a moment",
  },
});

const reportBlockedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: {
    success: false,
    message: "Too many status report requests",
  },
});

// Protect all exam routes with authentication
router.use(verifyJWT);

// ── ADMIN & MENTOR ROUTES ──────────────────────────────────────────────────
router.post("/admin/create", verifyRole(["admin", "mentor"]), createExam);
router.get("/admin", verifyRole(["admin", "mentor"]), getAdminExams);
router.get("/admin/live-takers", verifyRole(["admin", "mentor"]), getActiveExamsWithLiveTakers);
router.get("/admin/:examId", verifyRole(["admin", "mentor"]), getAdminExamDetail);
router.delete("/admin/:examId", verifyRole(["admin", "mentor"]), deleteExam);
router.patch(
  "/admin/:examId/stop",
  verifyRole(["admin", "mentor"]),
  stopExam
);
router.patch(
  "/admin/:examId/reschedule",
  verifyRole(["admin", "mentor"]),
  rescheduleExam
);
router.patch(
  "/admin/:examId/toggle-disclosure",
  verifyRole(["admin", "mentor"]),
  toggleResultDisclosure
);
router.patch(
  "/admin/:examId/toggle-retakes",
  verifyRole(["admin", "mentor"]),
  toggleExamRetakes
);
router.patch(
  "/admin/:examId/assign-students",
  verifyRole(["admin", "mentor"]),
  assignExamStudents
);
router.get(
  "/admin/:examId/results",
  verifyRole(["admin", "mentor"]),
  getExamResults
);
router.patch(
  "/admin/:examId/students/:studentId/unblock",
  verifyRole(["admin", "mentor"]),
  unblockStudentExamSession
);
router.patch(
  "/admin/:examId/students/:studentId/block",
  verifyRole(["admin", "mentor"]),
  blockStudentExamSession
);
router.post(
  "/admin/parse-coding-link",
  verifyRole(["admin", "mentor"]),
  parseCodingLink
);
router.post(
  "/admin/generate-ai-mcqs",
  verifyRole(["admin", "mentor"]),
  generateAiMcqs
);
router.post(
  "/admin/generate-ai-coding",
  verifyRole(["admin", "mentor"]),
  generateAiCoding
);

// ── STUDENT ROUTES ──────────────────────────────────────────────────────────
router.get("/student/available", getStudentAvailableExams);
router.get("/student/my-results", getStudentMyResults);
router.get("/student/:examId", checkProctoringBlock, getStudentExamForTaking);
router.get("/student/:examId/block-status", getStudentExamBlockStatus);
router.post("/student/:examId/report-blocked", reportBlockedLimiter, reportStudentExamBlocked);
router.post("/student/:examId/submit", checkProctoringBlock, examSubmitLimiter, submitStudentExam);

module.exports = router;
