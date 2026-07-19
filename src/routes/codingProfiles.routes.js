const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const codingProfilesController = require("../controllers/codingProfiles.controller");

const router = Router();

router.use(verifyJWT);

// GET /api/coding/coding-profiles/all
router.get("/coding-profiles/all", codingProfilesController.getAllProfiles);

// POST /api/coding-profiles  { platform, profileUrl }
router.post("/coding-profiles", codingProfilesController.upsertProfile);

// POST /api/coding-profiles/:platform/refresh
router.post("/coding-profiles/:platform/refresh", codingProfilesController.refreshProfile);

// GET /api/coding-profiles/:platform?force=true
router.get("/coding-profiles/:platform", codingProfilesController.getProfile);
// GET /api/coding-profiles/:platform/recommendations
router.get("/coding-profiles/:platform/recommendations", verifyJWT, codingProfilesController.getRecommendations);

module.exports = router;

