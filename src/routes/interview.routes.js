const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const checkProctoringBlock = require("../middleware/proctoringBlock.middleware");
const { createPromptValidator } = require("../services/promptSecurity.service");
const validate = require("../middleware/validate.middleware");
const {
  startInterviewValidators,
  submitAnswerValidators,
  finishRoundValidators,
} = require("../validators/interview.validators");
const interviewController = require("../controllers/interview.controller");

const router = Router();

// Prompt injection defense middleware
const promptSecurityCheck = createPromptValidator({
  fields: ["answer", "response", "input", "message"],
  maxLength: 8000,
  blockSensitiveTopics: true,
  strictMode: false,
});

const startLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error("startLimiter: req.user not set — verifyJWT must run before this middleware");
    }
    return req.user._id.toString();
  },
  message: {
    success: false,
    message: "Too many interview sessions started, please try again later",
  },
});

router.post(
  "/start",
  verifyJWT,
  checkProctoringBlock,
  startLimiter,
  startInterviewValidators,
  validate,
  interviewController.startSession,
);

router.post(
  "/:id/rounds/:roundType/answer",
  verifyJWT,
  checkProctoringBlock,
  promptSecurityCheck,
  submitAnswerValidators,
  validate,
  interviewController.submitAnswer,
);

router.post(
  "/:id/rounds/:roundType/finish",
  verifyJWT,
  checkProctoringBlock,
  finishRoundValidators,
  validate,
  interviewController.finishRound,
);

router.get("/history", verifyJWT, interviewController.getSessionHistory);

router.get("/:id", verifyJWT, interviewController.getSessionById);

router.delete("/:id", verifyJWT, interviewController.deleteSession);

module.exports = router;
