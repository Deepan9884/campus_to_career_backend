const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { generateValidators } = require("../validators/roadmap.validators");
const roadmapController = require("../controllers/roadmap.controller");

const router = Router();

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("generateLimiter: req.user not set");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many roadmap generation requests, please try again later",
  },
});

router.post(
  "/generate",
  verifyJWT,
  generateLimiter,
  generateValidators,
  validate,
  roadmapController.generateRoadmap,
);

router.get("/history", verifyJWT, roadmapController.getRoadmapHistory);

router.get("/by-gap/:gapAnalysisId", verifyJWT, roadmapController.getRoadmapByGapAnalysis);

router.get("/:id", verifyJWT, roadmapController.getRoadmapById);

router.delete("/:id", verifyJWT, roadmapController.deleteRoadmap);

module.exports = router;
