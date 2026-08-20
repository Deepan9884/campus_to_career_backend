const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const verifyRole = require("../middleware/role.middleware");
const {
  getStudentsList,
  getStudent360Detail,
  getCohortAnalytics,
  sendStudentFeedback,
  addMentee,
  removeMentee,
  getMyMentees,
  searchRegisteredStudents,
  getMentorProfile,
  updateMentorProfile,
  changeMentorPassword,
  unblockProctoring,
  getStudentProctoringViolations,
  generateAIIntervention,
  createMentorTask,
  getStudentMentorTasks,
  updateMentorTask,
  deleteMentorTask,
  getLiveProctoringFeed,
  batchUnblockProctoring,
  exportStudentsCohortCsv,
} = require("../controllers/admin.controller");

const router = Router();

// Apply JWT authentication and Mentor/Admin role protection to all admin routes
router.use(verifyJWT);
router.use(verifyRole(["admin", "mentor"]));

router.get("/students", getStudentsList);
router.get("/students/search-registered", searchRegisteredStudents);
router.get("/students/:studentId", getStudent360Detail);
router.get("/analytics", getCohortAnalytics);
router.get("/cohort/export-csv", exportStudentsCohortCsv);
router.post("/students/:studentId/feedback", sendStudentFeedback);
router.post("/students/:studentId/unblock-proctoring", unblockProctoring);
router.post("/students/batch-unblock", batchUnblockProctoring);
router.get("/students/:studentId/proctoring-violations", getStudentProctoringViolations);

// AI Mentor Co-Pilot & Task Management
router.post("/students/:studentId/generate-intervention", generateAIIntervention);
router.post("/students/:studentId/tasks", createMentorTask);
router.get("/students/:studentId/tasks", getStudentMentorTasks);
router.patch("/tasks/:taskId", updateMentorTask);
router.delete("/tasks/:taskId", deleteMentorTask);

// Real-Time Live Proctoring Stream
router.get("/proctoring/live-feed", getLiveProctoringFeed);

// Mentee management routes
router.get("/mentees", getMyMentees);
router.post("/mentees", addMentee);
router.delete("/mentees/:studentId", removeMentee);

// Mentor profile & credential settings routes
router.get("/profile", getMentorProfile);
router.patch("/profile", updateMentorProfile);
router.post("/change-password", changeMentorPassword);

module.exports = router;
