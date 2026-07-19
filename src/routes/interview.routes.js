const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  startInterviewValidators,
  answerValidators,
} = require("../validators/interview.validators");
const interviewController = require("../controllers/interview.controller");

const router = Router();

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
  startLimiter,
  startInterviewValidators,
  validate,
  interviewController.startInterview,
);

router.post(
  "/:id/answer",
  verifyJWT,
  answerValidators,
  validate,
  interviewController.answerQuestion,
);

router.post("/:id/finish", verifyJWT, interviewController.finishInterview);

router.get("/history", verifyJWT, interviewController.getInterviewHistory);

router.get("/:id", verifyJWT, interviewController.getInterviewById);

router.delete("/:id", verifyJWT, interviewController.deleteInterview);

module.exports = router;
