const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const verifyRole = require("../middleware/role.middleware");
const { createPromptValidator } = require("../services/promptSecurity.service");
const { cacheMiddleware, invalidateCache } = require("../middleware/cache.middleware");
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
const aiCostController = require("../controllers/aiCost.controller");

const router = Router();

// Prompt injection defense middleware for AI features
const promptSecurityCheck = createPromptValidator({
  fields: ["message", "feedback", "notes", "instructions"],
  maxLength: 5000,
  blockSensitiveTopics: true,
  strictMode: false,
});

// Apply JWT authentication and Mentor/Admin role protection to all admin routes
router.use(verifyJWT);
router.use(verifyRole(["admin", "mentor"]));

// Cache GET routes (5 minute TTL for list views, 2 minutes for detail views)
router.get("/students", cacheMiddleware({ ttl: 300, prefix: "admin:students" }), getStudentsList);
router.get("/students/search-registered", searchRegisteredStudents);
router.get(
  "/students/:studentId",
  cacheMiddleware({ ttl: 120, prefix: "admin:student-detail" }),
  getStudent360Detail
);
router.get("/analytics", cacheMiddleware({ ttl: 300, prefix: "admin:analytics" }), getCohortAnalytics);
router.get("/cohort/export-csv", exportStudentsCohortCsv);

// Mutation endpoints with cache invalidation
router.post(
  "/students/:studentId/feedback",
  invalidateCache({ patterns: ["admin:student-detail:*", "admin:students:*"] }),
  sendStudentFeedback
);
router.post(
  "/students/:studentId/unblock-proctoring",
  invalidateCache({ patterns: ["admin:student-detail:*", "admin:students:*"] }),
  unblockProctoring
);
router.post(
  "/students/batch-unblock",
  invalidateCache({ patterns: ["admin:student-detail:*", "admin:students:*"] }),
  batchUnblockProctoring
);
router.get(
  "/students/:studentId/proctoring-violations",
  cacheMiddleware({ ttl: 60, prefix: "admin:violations" }),
  getStudentProctoringViolations
);

// AI Mentor Co-Pilot & Task Management
router.post(
  "/students/:studentId/generate-intervention",
  promptSecurityCheck,
  invalidateCache({ patterns: ["admin:student-detail:*"] }),
  generateAIIntervention
);
router.post(
  "/students/:studentId/tasks",
  promptSecurityCheck,
  invalidateCache({ patterns: ["admin:tasks:*", "admin:student-detail:*"] }),
  createMentorTask
);
router.get(
  "/students/:studentId/tasks",
  cacheMiddleware({ ttl: 60, prefix: "admin:tasks" }),
  getStudentMentorTasks
);
router.patch(
  "/tasks/:taskId",
  invalidateCache({ patterns: ["admin:tasks:*", "admin:student-detail:*"] }),
  updateMentorTask
);
router.delete(
  "/tasks/:taskId",
  invalidateCache({ patterns: ["admin:tasks:*", "admin:student-detail:*"] }),
  deleteMentorTask
);

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

// AI Cost Tracking & Analytics (Admin only)
router.get(
  "/ai-costs/analytics",
  verifyRole(["admin"]),
  cacheMiddleware({ ttl: 300, prefix: "admin:ai-costs" }),
  aiCostController.getPlatformAnalytics
);
router.get(
  "/ai-costs/user/:userId",
  verifyRole(["admin"]),
  cacheMiddleware({ ttl: 120, prefix: "admin:ai-costs:user" }),
  aiCostController.getUserCostSummary
);
router.get(
  "/ai-costs/budget/:userId",
  verifyRole(["admin"]),
  aiCostController.checkUserBudget
);
router.get(
  "/ai-costs/efficiency",
  verifyRole(["admin"]),
  cacheMiddleware({ ttl: 300, prefix: "admin:ai-costs:efficiency" }),
  aiCostController.getCostEfficiency
);
router.post(
  "/ai-costs/estimate",
  verifyRole(["admin"]),
  aiCostController.estimatePromptCost
);

module.exports = router;
