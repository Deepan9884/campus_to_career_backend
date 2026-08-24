const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const verifyRole = require("../middleware/role.middleware");
const {
  createExam,
  getAdminExams,
  getAdminExamDetail,
  deleteExam,
  toggleResultDisclosure,
  toggleExamRetakes,
  stopExam,
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
} = require("../controllers/exam.controller");

const router = Router();

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
  "/admin/:examId/toggle-disclosure",
  verifyRole(["admin", "mentor"]),
  toggleResultDisclosure
);
router.patch(
  "/admin/:examId/toggle-retakes",
  verifyRole(["admin", "mentor"]),
  toggleExamRetakes
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
router.get("/student/:examId", getStudentExamForTaking);
router.get("/student/:examId/block-status", getStudentExamBlockStatus);
router.post("/student/:examId/report-blocked", reportStudentExamBlocked);
router.post("/student/:examId/submit", submitStudentExam);

module.exports = router;
