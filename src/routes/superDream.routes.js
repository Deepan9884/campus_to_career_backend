const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const verifyRole = require("../middleware/role.middleware");
const {
  getMySuperDreamState,
  syncMySuperDreamState,
  logSuperDreamMovement,
  getAdminSuperDreamCohort,
  assignSuperDreamMentee,
  unassignSuperDreamMentee,
  getAdminStudentSuperDream,
  mentorVerifyDeliverable,
  mentorSignoffEvaluation,
  resetMySuperDreamState,
} = require("../controllers/superDream.controller");

const router = Router();

// Apply JWT authentication to all routes
router.use(verifyJWT);

// Student routes
router.get("/my-state", getMySuperDreamState);
router.put("/sync", syncMySuperDreamState);
router.post("/movement", logSuperDreamMovement);
router.delete("/reset", resetMySuperDreamState);

// Mentor / Admin protected routes
router.get("/cohort", verifyRole(["admin", "mentor"]), getAdminSuperDreamCohort);
router.post("/assign-mentee", verifyRole(["admin", "mentor"]), assignSuperDreamMentee);
router.post("/unassign-mentee", verifyRole(["admin", "mentor"]), unassignSuperDreamMentee);
router.get("/student/:studentId", verifyRole(["admin", "mentor"]), getAdminStudentSuperDream);
router.post("/student/:studentId/verify", verifyRole(["admin", "mentor"]), mentorVerifyDeliverable);
router.post("/student/:studentId/signoff", verifyRole(["admin", "mentor"]), mentorSignoffEvaluation);

module.exports = router;
