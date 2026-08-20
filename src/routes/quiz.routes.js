const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const checkProctoringBlock = require("../middleware/proctoringBlock.middleware");
const validate = require("../middleware/validate.middleware");
const { generateQuizValidators, submitQuizValidators } = require("../validators/quiz.validators");
const quizController = require("../controllers/quiz.controller");

const router = Router();

const quizGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("quizGenerateLimiter: req.user not set");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many quiz generation requests, please try again later",
  },
});

const quizSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("quizSubmitLimiter: req.user not set");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many quiz submission requests, please try again later",
  },
});

const compilerController = require("../controllers/compiler.controller");

router.post(
  "/generate",
  verifyJWT,
  checkProctoringBlock,
  quizGenerateLimiter,
  generateQuizValidators,
  validate,
  quizController.generateQuiz
);

router.post(
  "/run-code",
  verifyJWT,
  checkProctoringBlock,
  compilerController.runCode
);

router.post(
  "/submit",
  verifyJWT,
  checkProctoringBlock,
  quizSubmitLimiter,
  submitQuizValidators,
  validate,
  quizController.submitQuiz
);

module.exports = router;