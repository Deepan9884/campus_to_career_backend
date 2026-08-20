const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { connectValidators, analyzeValidators, linkedinPostValidators } = require("../validators/github.validators");
const githubController = require("../controllers/github.controller");

const router = Router();

const connectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("connectLimiter: req.user not set — verifyJWT must run before this middleware");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many GitHub connect attempts, please try again in a few minutes",
  },
});

const reposLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("reposLimiter: req.user not set — verifyJWT must run before this middleware");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many repository list requests, please try again in a few minutes",
  },
});

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("analyzeLimiter: req.user not set — verifyJWT must run before this middleware");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many analysis requests, please wait a moment before trying again",
  },
});

const linkedinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("linkedinLimiter: req.user not set — verifyJWT must run before this middleware");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many LinkedIn post generation requests, please try again later",
  },
});

router.post(
  "/connect",
  verifyJWT,
  connectLimiter,
  connectValidators,
  validate,
  githubController.connectGithub,
);

router.get("/repos", verifyJWT, reposLimiter, githubController.listRepos);

router.post(
  "/analyze",
  verifyJWT,
  analyzeLimiter,
  analyzeValidators,
  validate,
  githubController.analyzeRepo,
);

router.post(
  "/linkedin-post",
  verifyJWT,
  linkedinLimiter,
  linkedinPostValidators,
  validate,
  githubController.generateLinkedInPost,
);

router.get("/history", verifyJWT, githubController.getAnalysisHistory);

router.get("/portfolio/:username", githubController.getPortfolio);

router.get("/:id", verifyJWT, githubController.getAnalysisById);

router.delete("/:id", verifyJWT, githubController.deleteAnalysis);

module.exports = router;
