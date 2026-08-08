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
} = require("../controllers/admin.controller");

const router = Router();

// Apply JWT authentication and Mentor/Admin role protection to all admin routes
router.use(verifyJWT);
router.use(verifyRole(["admin", "mentor"]));

router.get("/students", getStudentsList);
router.get("/students/search-registered", searchRegisteredStudents);
router.get("/students/:studentId", getStudent360Detail);
router.get("/analytics", getCohortAnalytics);
router.post("/students/:studentId/feedback", sendStudentFeedback);

// Mentee management routes
router.get("/mentees", getMyMentees);
router.post("/mentees", addMentee);
router.delete("/mentees/:studentId", removeMentee);

// Mentor profile & credential settings routes
router.get("/profile", getMentorProfile);
router.patch("/profile", updateMentorProfile);
router.post("/change-password", changeMentorPassword);

module.exports = router;
