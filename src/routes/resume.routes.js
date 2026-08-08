const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { upload } = require("../middleware/resumeMulter");
const { uploadValidators } = require("../validators/resume.validators");
const resumeController = require("../controllers/resume.controller");

const router = Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.user?._id) {
      throw new Error(
        "uploadLimiter: req.user not set — verifyJWT must run before this middleware",
      );
    }
    return req.user._id.toString();
  },
  message: { success: false, message: "Too many resume uploads, please try again later" },
});

router.post(
  "/upload",
  verifyJWT,
  uploadLimiter,
  (req, res, next) => {
    upload.single("resume")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ success: false, message: "File too large. Maximum size is 5 MB." });
        }
        if (err.code === "INVALID_FILE_TYPE" || err.message?.includes("Only .pdf and .docx")) {
          return res.status(400).json({ success: false, message: err.message });
        }
        return res
          .status(400)
          .json({ success: false, message: err.message || "File upload error" });
      }
      next();
    });
  },
  uploadValidators,
  validate,
  resumeController.uploadResume,
);

router.get("/history", verifyJWT, resumeController.getResumeHistory);

router.get("/:id", verifyJWT, resumeController.getResumeById);

router.post("/improve-bullet", verifyJWT, resumeController.improveBulletPoint);

router.delete("/:id", verifyJWT, resumeController.deleteResume);

module.exports = router;
