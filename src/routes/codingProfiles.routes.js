const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { cacheMiddleware, invalidateCache } = require("../middleware/cache.middleware");
const codingProfilesController = require("../controllers/codingProfiles.controller");

const router = Router();

router.use(verifyJWT);

// GET /api/coding/coding-profiles/all - Cache for 5 minutes
router.get(
  "/coding-profiles/all",
  cacheMiddleware({ ttl: 300, prefix: "coding:all", includeUser: true }),
  codingProfilesController.getAllProfiles
);

// POST /api/coding-profiles  { platform, profileUrl } - Invalidate cache on update
router.post(
  "/coding-profiles",
  invalidateCache({ patterns: ["coding:*"] }),
  codingProfilesController.upsertProfile
);

// POST /api/coding-profiles/:platform/refresh - Invalidate cache on refresh
router.post(
  "/coding-profiles/:platform/refresh",
  invalidateCache({ patterns: ["coding:*"] }),
  codingProfilesController.refreshProfile
);

// GET /api/coding-profiles/:platform?force=true - Cache for 10 minutes
router.get(
  "/coding-profiles/:platform",
  cacheMiddleware({ ttl: 600, prefix: "coding:profile", includeUser: true }),
  codingProfilesController.getProfile
);

// GET /api/coding-profiles/:platform/recommendations - Cache for 1 hour
router.get(
  "/coding-profiles/:platform/recommendations",
  verifyJWT,
  cacheMiddleware({ ttl: 3600, prefix: "coding:recommendations", includeUser: true }),
  codingProfilesController.getRecommendations
);

module.exports = router;

