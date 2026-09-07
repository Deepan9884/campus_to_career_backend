const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const verifyRole = require("../middleware/role.middleware");
const { cacheMiddleware, invalidateCache } = require("../middleware/cache.middleware");
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
router.get("/my-state", cacheMiddleware({ ttl: 60, prefix: "super-dream:my-state" }), getMySuperDreamState);
router.put(
  "/sync",
  invalidateCache({ patterns: ["super-dream:my-state:*", "super-dream:cohort:*", "super-dream:student:*"] }),
  syncMySuperDreamState
);
router.post(
  "/movement",
  invalidateCache({ patterns: ["super-dream:my-state:*", "super-dream:cohort:*", "super-dream:student:*"] }),
  logSuperDreamMovement
);
router.delete(
  "/reset",
  invalidateCache({ patterns: ["super-dream:my-state:*", "super-dream:cohort:*", "super-dream:student:*"] }),
  resetMySuperDreamState
);

// Mentor / Admin protected routes
router.get(
  "/cohort",
  verifyRole(["admin", "mentor"]),
  cacheMiddleware({ ttl: 60, prefix: "super-dream:cohort" }),
  getAdminSuperDreamCohort
);
router.post(
  "/assign-mentee",
  verifyRole(["admin", "mentor"]),
  invalidateCache({ patterns: ["super-dream:cohort:*", "admin:students:*", "admin:analytics:*"] }),
  assignSuperDreamMentee
);
router.post(
  "/unassign-mentee",
  verifyRole(["admin", "mentor"]),
  invalidateCache({ patterns: ["super-dream:cohort:*", "admin:students:*", "admin:analytics:*"] }),
  unassignSuperDreamMentee
);
router.get(
  "/student/:studentId",
  verifyRole(["admin", "mentor"]),
  cacheMiddleware({ ttl: 60, prefix: "super-dream:student" }),
  getAdminStudentSuperDream
);
router.post(
  "/student/:studentId/verify",
  verifyRole(["admin", "mentor"]),
  invalidateCache({ patterns: ["super-dream:student:*", "super-dream:cohort:*", "super-dream:my-state:*"] }),
  mentorVerifyDeliverable
);
router.post(
  "/student/:studentId/signoff",
  verifyRole(["admin", "mentor"]),
  invalidateCache({ patterns: ["super-dream:student:*", "super-dream:cohort:*", "super-dream:my-state:*"] }),
  mentorSignoffEvaluation
);

module.exports = router;

