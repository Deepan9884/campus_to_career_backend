const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { addSkillValidators, analyzeValidators, suggestionsValidators } = require("../validators/skills.validators");
const skillsController = require("../controllers/skills.controller");

const router = Router();

const suggestionsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("suggestionsLimiter: req.user not set");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many suggestion requests, please try again later",
  },
});

const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("analyzeLimiter: req.user not set");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many analysis requests, please try again later",
  },
});

router.get("/roles", skillsController.getAvailableRoles);

router.post("/current", verifyJWT, addSkillValidators, validate, skillsController.addSkill);

router.get("/current", verifyJWT, skillsController.getCurrentSkills);

router.delete("/current/:id", verifyJWT, skillsController.deleteSkill);

router.get("/suggestions", verifyJWT, suggestionsLimiter, suggestionsValidators, validate, skillsController.getSuggestions);

router.post(
  "/analyze",
  verifyJWT,
  analyzeLimiter,
  analyzeValidators,
  validate,
  skillsController.analyzeGap,
);

router.get("/history", verifyJWT, skillsController.getGapHistory);

router.get("/:id", verifyJWT, skillsController.getGapById);

router.delete("/:id", verifyJWT, skillsController.deleteGapAnalysis);

module.exports = router;
