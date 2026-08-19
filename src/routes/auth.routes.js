const { Router } = require("express");
const rateLimit = require("express-rate-limit");

const verifyJWT = require("../middleware/auth.middleware");
const validateZod = require("../middleware/validateZod.middleware");
const authController = require("../controllers/auth.controller");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/auth.zod");

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts, please try again later" },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many registration attempts, please try again later" },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many refresh attempts, please try again later" },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset requests, please try again later" },
});

const verifyResetTokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many token verification attempts, please try again later",
  },
});

// --- Public routes ---

router.post("/register", registerLimiter, validateZod(registerSchema), authController.register);

router.post("/login", loginLimiter, validateZod(loginSchema), authController.login);

router.post("/2fa/login", loginLimiter, authController.login2FA);

router.post("/google", loginLimiter, authController.googleLogin);

router.post("/github", loginLimiter, authController.githubLogin);

router.post("/refresh", refreshLimiter, authController.refreshToken);

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateZod(forgotPasswordSchema),
  authController.forgotPassword,
);

router.post("/reset-password", validateZod(resetPasswordSchema), authController.resetPassword);

router.get("/verify-reset-token", verifyResetTokenLimiter, authController.verifyResetTokenHandler);

// --- Protected routes ---

router.post("/logout", verifyJWT, authController.logout);

router.get("/me", verifyJWT, authController.getMe);

router.patch("/me", verifyJWT, validateZod(updateProfileSchema), authController.updateProfile);

router.patch(
  "/me/preferences",
  verifyJWT,
  validateZod(updatePreferencesSchema),
  authController.updatePreferences,
);

router.post("/logout-all", verifyJWT, authController.logoutAll);
router.get("/export", verifyJWT, authController.exportUserData);
router.post("/2fa/generate", verifyJWT, authController.generate2FA);
router.post("/2fa/verify", verifyJWT, authController.verify2FA);
router.post("/2fa/disable", verifyJWT, authController.disable2FA);

module.exports = router;
