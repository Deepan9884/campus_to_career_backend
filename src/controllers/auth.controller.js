const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const crypto = require("crypto");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

const User = require("../models/User.model");
const CodingProfile = require("../models/CodingProfile.model");
const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const AIUsageLog = require("../models/AIUsageLog.model");
const SuperDream = require("../models/SuperDream.model");
const ExamSubmission = require("../models/ExamSubmission.model");
const Notification = require("../models/Notification.model");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const env = require("../config/env");
const { blacklistTokenWithTTL } = require("../services/tokenBlacklist.service");
const auditLogService = require("../services/auditLog.service");
const {
  generateResetToken,
  verifyResetToken,
  getPasswordFragment,
} = require("../utils/resetToken");
const emailService = require("../services/email.service");
const { OAuth2Client } = require("google-auth-library");
const { isEncrypted, decrypt } = require("../services/encryption.service");
const { evaluateAndAutoUnblockUser } = require("../services/proctoringBlock.service");

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Safely ensure a user's display name is plain text, never encrypted ciphertext.
 */
function ensurePlainName(name, email) {
  if (!name) return email ? email.split("@")[0] : "Student";
  if (isEncrypted(name)) {
    try {
      const dec = decrypt(name);
      return isEncrypted(dec) ? (email ? email.split("@")[0] : "Student") : dec;
    } catch {
      return email ? email.split("@")[0] : "Student";
    }
  }
  return name;
}

/**
 * Hash a token for storage using SHA-256 + bcrypt.
 * bcrypt has a 72-byte input limit; JWTs exceed this, so we pre-hash with SHA-256.
 */
async function hashToken(token) {
  const sha256 = crypto.createHash("sha256").update(token).digest("base64");
  return bcryptjs.hash(sha256, 10);
}

/**
 * Compare a raw token against a stored hash (SHA-256 + bcrypt).
 */
async function compareToken(rawToken, storedHash) {
  const sha256 = crypto.createHash("sha256").update(rawToken).digest("base64");
  return bcryptjs.compare(sha256, storedHash);
}

/** Parse a duration string like "7d", "15m", "24h" into milliseconds. */
function parseDurationToMs(str) {
  if (!str || typeof str !== "string") return 7 * 24 * 60 * 60 * 1000; // 7 days
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || 1000);
}

/** Read a cookie manually (falls back to the raw Cookie header). */
function getCookieValue(req, name) {
  if (req.cookies && req.cookies[name]) return req.cookies[name];

  const header = req.headers.cookie;
  if (!header) return undefined;

  const pairs = header.split(";");
  for (const pair of pairs) {
    const [key, value] = pair.trim().split("=");
    if (key === name) {
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

/** Set the httpOnly refreshToken cookie with strict cross-origin protection for production. */
function setRefreshTokenCookie(res, token) {
  const maxAge = parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN);
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax", // Changed from "none" to "strict" for CSRF protection
    maxAge,
  });
}

/* ------------------------------------------------------------------ */
/* Controllers                                                        */
/* ------------------------------------------------------------------ */

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findByEmail(email);
  if (existing) {
    throw ApiError.conflict("Email already registered");
  }

  const user = await User.create({ name, email, password, welcomeEmailSent: true });

  // Audit log: User registration
  await auditLogService.logAuth({
    action: "USER_CREATED",
    userId: user._id,
    userEmail: user.email,
    status: "SUCCESS",
    req,
    details: { role: user.role },
  });

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  
  // Generate email verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  // Send branded welcome email to new student
  emailService.sendWelcomeEmail(user).catch((e) =>
    console.error("[Email] Failed to send welcome email:", e.message)
  );

  // Send email verification link
  emailService.sendVerificationEmail(user, verificationToken).catch((e) =>
    console.error("[Email] Failed to send verification email:", e.message)
  );

  return ApiResponse.created({
    user: {
      _id: user._id,
      name: ensurePlainName(user.name, user.email),
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      targetRole: user.targetRole,
      githubUsername: user.githubUsername,
      profile: user.profile,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    },
    accessToken,
  }).send(res);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw ApiError.badRequest("Email and password are required");
  }

  const user = await User.findByEmail(email).select("+password");
  if (!user) {
    // Audit log: Failed login attempt
    await auditLogService.logAuth({
      action: "LOGIN_FAILED",
      userId: null,
      userEmail: email,
      status: "FAILURE",
      req,
      details: { reason: "User not found" },
    });
    throw ApiError.unauthorized("Invalid credentials");
  }

  // Account Lockout check (5 failed attempts locks for 15 minutes)
  if (user.lockUntil && user.lockUntil > new Date()) {
    // Audit log: Account locked attempt
    await auditLogService.logSecurity({
      action: "ACCOUNT_LOCKED",
      userId: user._id,
      userEmail: user.email,
      severity: "MEDIUM",
      status: "BLOCKED",
      req,
      details: { lockUntil: user.lockUntil },
    });

    const remainingMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / (60 * 1000));
    const remainingHours = remainingMinutes >= 60 ? Math.ceil(remainingMinutes / 60) : null;
    throw ApiError.unauthorized(
      `Account is temporarily locked due to consecutive failed login attempts. Please try again in ${remainingHours ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}` : `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`}.`,
    );
  }

  // Auto-reset failed attempts if lock period has expired
  if (user.lockUntil && user.lockUntil <= new Date()) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
  }

  // Auto-reset failed attempts if last failed login was more than 24 hours ago
  if (user.lastFailedLogin && user.failedLoginAttempts > 0) {
    const hoursSinceLastFail = (Date.now() - user.lastFailedLogin.getTime()) / (60 * 60 * 1000);
    if (hoursSinceLastFail > 24) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLogin = new Date();
    
    // Exponential backoff: progressively longer lockout periods
    // 3 attempts: 5 min, 4: 15 min, 5: 1 hour, 6: 4 hours, 7+: 24 hours
    const lockoutDurations = {
      3: 5 * 60 * 1000,        // 5 minutes
      4: 15 * 60 * 1000,       // 15 minutes
      5: 60 * 60 * 1000,       // 1 hour
      6: 4 * 60 * 60 * 1000,   // 4 hours
      7: 24 * 60 * 60 * 1000,  // 24 hours
    };
    
    const attempts = user.failedLoginAttempts;
    if (attempts >= 3) {
      const lockDuration = lockoutDurations[Math.min(attempts, 7)] || lockoutDurations[7];
      user.lockUntil = new Date(Date.now() + lockDuration);
      
      // Track lockout history for security monitoring
      if (!user.lockoutHistory) user.lockoutHistory = [];
      user.lockoutHistory.push({
        lockedAt: new Date(),
        attempts,
        duration: lockDuration,
      });
      
      // Keep only last 10 lockouts
      if (user.lockoutHistory.length > 10) {
        user.lockoutHistory = user.lockoutHistory.slice(-10);
      }
      
      const lockMinutes = Math.ceil(lockDuration / (60 * 1000));
      const lockHours = lockMinutes >= 60 ? Math.ceil(lockMinutes / 60) : null;
      
      await user.save();
      
      throw ApiError.unauthorized(
        `Too many failed login attempts. Account locked for ${lockHours ? `${lockHours} hour${lockHours > 1 ? 's' : ''}` : `${lockMinutes} minute${lockMinutes > 1 ? 's' : ''}`}.`
      );
    }
    
    await user.save();
    throw ApiError.unauthorized("Invalid credentials");
  }

  // Reset failed login attempts on successful credentials
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
  }

  // Enforce 2FA if enabled on the user account
  if (user.is2FAEnabled) {
    const tempToken = jwt.sign(
      { sub: user._id, purpose: "2fa_login" },
      env.JWT_SECRET,
      { expiresIn: "5m" },
    );
    return ApiResponse.success(
      { requires2FA: true, tempToken },
      "Two-factor authentication code required",
    ).send(res);
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  // Audit log: Successful login
  await auditLogService.logAuth({
    action: "LOGIN_SUCCESS",
    userId: user._id,
    userEmail: user.email,
    status: "SUCCESS",
    req,
    details: {
      method: "password",
      is2FAEnabled: user.is2FAEnabled,
    },
  });

  // Send Welcome email if this user hasn't received one yet, otherwise send security login alert
  if (!user.welcomeEmailSent) {
    user.welcomeEmailSent = true;
    await user.save();
    emailService.sendWelcomeEmail(user).catch((e) =>
      console.error("[Email] Failed to send welcome email:", e.message)
    );
  } else {
    emailService.sendNewLoginAlertEmail(user, {
      ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
      loginTime: new Date(),
    }).catch((e) => console.error("[Email] Failed to send login alert:", e.message));
  }

  return ApiResponse.success({
    user: {
      _id: user._id,
      name: ensurePlainName(user.name, user.email),
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      targetRole: user.targetRole,
      githubUsername: user.githubUsername,
      profile: user.profile,
      createdAt: user.createdAt,
    },
    accessToken,
  }).send(res);
});

const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    throw ApiError.badRequest("Google credential is required");
  }

  let payload = null;

  // 1. Verify Google ID token (JWT) if client ID is configured
  if (env.GOOGLE_CLIENT_ID) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // credential might be an OAuth access_token instead of JWT id_token
    }
  }

  // 2. Try OIDC UserInfo endpoint (Bearer access_token)
  if (!payload && typeof credential === "string" && credential.length > 10) {
    try {
      const oidcRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (oidcRes.ok) {
        payload = await oidcRes.json();
      }
    } catch (e) {}
  }

  // 3. Try Google OAuth2 v3 UserInfo endpoint
  if (!payload && typeof credential === "string" && credential.length > 10) {
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (userInfoRes.ok) {
        payload = await userInfoRes.json();
      }
    } catch (e) {}
  }

  // 4. Try Google OAuth2 v2 UserInfo endpoint
  if (!payload && typeof credential === "string" && credential.length > 10) {
    try {
      const v2Res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (v2Res.ok) {
        payload = await v2Res.json();
      }
    } catch (e) {}
  }

  // 5. Try Google TokenInfo endpoint
  if (!payload && typeof credential === "string" && credential.length > 10) {
    try {
      const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(credential)}`);
      if (tokenInfoRes.ok) {
        payload = await tokenInfoRes.json();
      }
    } catch (e) {}
  }

  const googleId = payload?.sub || payload?.id || payload?.user_id;
  const email = payload?.email ? payload.email.toLowerCase().trim() : null;
  const name = payload?.name || payload?.given_name || "Google User";
  const picture = payload?.picture || payload?.avatar || "";
  const isEmailVerified =
    payload?.email_verified === false || payload?.verified_email === false
      ? false
      : Boolean(
          payload?.email_verified === true ||
          payload?.email_verified === "true" ||
          payload?.verified_email === true ||
          payload?.verified_email === "true" ||
          (payload?.email && googleId && payload?.email_verified === undefined && payload?.verified_email === undefined)
        );

  if (!googleId || !email || !isEmailVerified) {
    console.error("[Google Auth Error] Verification failed. Payload received:", payload);
    throw ApiError.unauthorized("Google authentication token verification failed. Please try logging in again.");
  }

  const normalizedEmail = email;
  let isNewUser = false;

  let user = await User.findOne({
    $or: [{ googleId }, { email: normalizedEmail }],
  }).select("+password");

  if (user) {
    let modified = false;
    if (!user.googleId) {
      user.googleId = googleId;
      modified = true;
    }
    if (user.authProvider === "local") {
      user.authProvider = "both";
      modified = true;
    }
    if (!user.avatar && picture) {
      user.avatar = picture;
      modified = true;
    }
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      modified = true;
    }
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      modified = true;
    }
    if (modified) {
      await user.save();
    }
  } else {
    isNewUser = true;
    const randomPassword = crypto.randomBytes(32).toString("hex") + "Aa1!";
    user = await User.create({
      name: name || "Google User",
      email: normalizedEmail,
      password: randomPassword,
      googleId,
      authProvider: "google",
      avatar: picture || "",
      role: "student",
      isEmailVerified: true,
      welcomeEmailSent: true,
    });

  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  if (isNewUser) {
    // Send welcome email to new Google user
    emailService.sendWelcomeEmail(user).catch((e) =>
      console.error("[Email] Failed to send welcome email:", e.message)
    );
  } else if (!user.welcomeEmailSent) {
    user.welcomeEmailSent = true;
    await user.save();
    emailService.sendWelcomeEmail(user).catch((e) =>
      console.error("[Email] Failed to send welcome email:", e.message)
    );
  } else {
    emailService.sendNewLoginAlertEmail(user, {
      ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
      loginTime: new Date(),
    }).catch((e) => console.error("[Email] Failed to send login alert:", e.message));
  }

  return ApiResponse.success({
    user: {
      _id: user._id,
      name: ensurePlainName(user.name, user.email),
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      targetRole: user.targetRole,
      githubUsername: user.githubUsername,
      profile: user.profile,
      createdAt: user.createdAt,
      authProvider: user.authProvider,
      isEmailVerified: user.isEmailVerified,
    },
    accessToken,
    isNewUser,
  }).send(res);
});

const githubLogin = asyncHandler(async (req, res) => {
  const { code, accessToken: reqToken } = req.body;
  let githubUser = null;

  if (reqToken) {
    try {
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${reqToken}`,
          "User-Agent": "Campus-to-Career-AI",
        },
      });
      if (userRes.ok) {
        githubUser = await userRes.json();
      }
    } catch (e) {}
  }

  if (!githubUser && code && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    try {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "Campus-to-Career-AI",
          },
        });
        if (userRes.ok) {
          githubUser = await userRes.json();
        }
      }
    } catch (e) {}
  }

  // Strict check: Require verified GitHub identity
  if (!githubUser || !githubUser.id || (!githubUser.email && !githubUser.login)) {
    throw ApiError.unauthorized("GitHub authentication verification failed. Please try signing in again.");
  }

  const email = githubUser.email || `${githubUser.login.toLowerCase()}@github.campustocareer.ai`;
  const name = githubUser.name || githubUser.login;
  const githubId = String(githubUser.id);
  const avatar = githubUser.avatar_url;
  let isNewUser = false;

  let user = await User.findOne({
    $or: [{ githubId }, { email: email.toLowerCase() }],
  }).select("+password");

  if (user) {
    if (!user.githubId) {
      user.githubId = githubId;
      user.githubUsername = githubUser.login;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();
    }
  } else {
    isNewUser = true;
    const randomPassword = crypto.randomBytes(32).toString("hex") + "Aa1!";
    user = await User.create({
      name,
      email,
      password: randomPassword,
      githubId,
      githubUsername: githubUser.login,
      authProvider: "github",
      avatar: avatar || "",
      role: "student",
      welcomeEmailSent: true,
    });

  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  if (isNewUser) {
    // Send welcome email to new GitHub user
    emailService.sendWelcomeEmail(user).catch((e) =>
      console.error("[Email] Failed to send welcome email:", e.message)
    );
  } else if (!user.welcomeEmailSent) {
    user.welcomeEmailSent = true;
    await user.save();
    emailService.sendWelcomeEmail(user).catch((e) =>
      console.error("[Email] Failed to send welcome email:", e.message)
    );
  } else {
    emailService.sendNewLoginAlertEmail(user, {
      ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
      loginTime: new Date(),
    }).catch((e) => console.error("[Email] Failed to send login alert:", e.message));
  }

  return ApiResponse.success({
    user: {
      _id: user._id,
      name: ensurePlainName(user.name, user.email),
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      targetRole: user.targetRole,
      githubUsername: user.githubUsername,
      profile: user.profile,
      createdAt: user.createdAt,
      authProvider: user.authProvider,
    },
    accessToken,
    isNewUser,
  }).send(res);
});

const logout = asyncHandler(async (req, res) => {
  // Get the current access token from request
  const token = req.headers.authorization?.split(" ")[1];

  // Blacklist the access token if present
  if (token) {
    await blacklistTokenWithTTL(token, env.JWT_SECRET);
  }

  // Clear refresh token from database
  await User.findByIdAndUpdate(req.user._id, { refreshToken: "" });

  // Audit log: Logout
  await auditLogService.logAuth({
    action: "LOGOUT",
    userId: req.user._id,
    userEmail: req.user.email,
    status: "SUCCESS",
    req,
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  });

  return ApiResponse.success(null, "Logged out successfully").send(res);
});

const refreshToken = asyncHandler(async (req, res) => {
  const rawToken = getCookieValue(req, "refreshToken");
  if (!rawToken) {
    throw ApiError.unauthorized("Refresh token is missing");
  }

  let decoded;
  try {
    decoded = jwt.verify(rawToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  // Support both `_id` (used by current model) and `sub` (JWT standard claim).
  const userId = decoded._id || decoded.sub;
  const user = await User.findById(userId).select("+refreshToken +refreshTokenVersion");
  if (!user || !user.refreshToken) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const isMatch = await compareToken(rawToken, user.refreshToken);
  if (!isMatch) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  // Rotation: generate a new refresh token alongside the new access token
  const newAccessToken = user.generateAccessToken();
  const newRefreshToken = user.generateRefreshToken();
  const newHash = await hashToken(newRefreshToken);

  const currentVersion = user.refreshTokenVersion || 0;

  // Atomic compare-and-swap
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, refreshTokenVersion: currentVersion },
    {
      $set: { refreshToken: newHash },
      $inc: { refreshTokenVersion: 1 },
    },
    { new: true },
  );

  // CAS failure: concurrent request already rotated, indicating reuse
  if (!updatedUser) {
    throw ApiError.unauthorized("Invalid or already-used refresh token");
  }

  setRefreshTokenCookie(res, newRefreshToken);

  return ApiResponse.success({ accessToken: newAccessToken }).send(res);
});

const getMe = asyncHandler(async (req, res) => {
  const blockStatus = await evaluateAndAutoUnblockUser(req.user);
  const userData = { ...req.user };
  if (blockStatus.autoUnblocked) {
    userData.isProctoringBlocked = false;
    userData.proctoringBlockedAt = null;
  }
  userData.proctoringRemainingSeconds = blockStatus.remainingSeconds;
  userData.proctoringRemainingMinutes = blockStatus.remainingMinutes;
  return ApiResponse.success(userData).send(res);
});

const updateProfile = asyncHandler(async (req, res) => {
  // Allow only these fields — anything else is silently ignored.
  // Email and password must never be updated through this endpoint.
  const allowed = [
    "name",
    "targetRole",
    "githubUsername",
    "linkedinUrl",
    "bio",
    "location",
    "avatar",
    "registerNumber",
    "department",
    "batch",
    "currentSemester",
    "facultyMentor",
  ];
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      update[key] = typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
    }
  }
  if (req.body.githubUsername !== undefined) {
    const val = (req.body.githubUsername || "").trim();
    update["githubUsername"] = val;
    update["profile.githubUsername"] = val;
  }
  if (req.body.targetRole !== undefined) {
    const val = (req.body.targetRole || "").trim();
    update["targetRole"] = val;
    update["profile.targetRole"] = val;
  }
  if (req.body.bio !== undefined) {
    const val = (req.body.bio || "").trim();
    update["bio"] = val;
    update["profile.bio"] = val;
  }
  if (req.body.location !== undefined) {
    const val = (req.body.location || "").trim();
    update["location"] = val;
    update["profile.location"] = val;
  }
  if (req.body.profile && typeof req.body.profile === "object") {
    const profileFields = [
      "githubUsername",
      "targetRole",
      "bio",
      "location",
      "registerNumber",
      "department",
      "batch",
      "currentSemester",
      "facultyMentor",
    ];
    for (const f of profileFields) {
      if (req.body.profile[f] !== undefined) {
        const val = typeof req.body.profile[f] === "string" ? req.body.profile[f].trim() : req.body.profile[f];
        update[`profile.${f}`] = val;
        if (f === "githubUsername" || f === "targetRole") {
          update[f] = val;
        }
      }
    }
  }
  if (req.body.preferences && typeof req.body.preferences === "object") {
    const allowedPrefs = [
      "theme",
      "accentColor",
      "notifyOn",
      "emailDigest",
      "aiDifficulty",
      "preferredLanguage",
      "resumePrivacy",
      "dailyGoalProblems",
      "hiddenModules",
    ];
    for (const pref of allowedPrefs) {
      if (req.body.preferences[pref] !== undefined) {
        update[`preferences.${pref}`] = req.body.preferences[pref];
      }
    }
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: update },
    { new: true, runValidators: true },
  ).select("-password -refreshToken");

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  // Two-way synchronization: update SuperDream profile if record exists
  try {
    const sdUpdate = {};
    if (user.name) sdUpdate["checklist.profile.name"] = user.name;
    if (user.targetRole || user.profile?.targetRole) {
      sdUpdate["checklist.profile.targetRole"] = user.targetRole || user.profile?.targetRole;
    }
    if (user.profile?.registerNumber !== undefined) {
      sdUpdate["checklist.profile.registerNumber"] = user.profile.registerNumber;
    }
    if (user.profile?.department !== undefined) {
      sdUpdate["checklist.profile.department"] = user.profile.department;
    }
    if (user.profile?.batch !== undefined) {
      sdUpdate["checklist.profile.batch"] = user.profile.batch;
    }
    if (user.profile?.currentSemester !== undefined) {
      sdUpdate["checklist.profile.currentSemester"] = user.profile.currentSemester;
    }
    if (user.profile?.facultyMentor !== undefined) {
      sdUpdate["checklist.profile.facultyMentor"] = user.profile.facultyMentor;
    }
    if (Object.keys(sdUpdate).length > 0) {
      await SuperDream.findOneAndUpdate({ student: user._id }, { $set: sdUpdate });
    }
  } catch (err) {
    console.error("Non-fatal: failed to sync profile to SuperDream:", err.message);
  }

  return ApiResponse.success(user).send(res);
});

const updatePreferences = asyncHandler(async (req, res) => {
  const { theme, notifyOn } = req.body;
  const update = {};

  const allowedPrefs = [
    "theme",
    "accentColor",
    "notifyOn",
    "emailDigest",
    "aiDifficulty",
    "preferredLanguage",
    "resumePrivacy",
    "dailyGoalProblems",
    "hiddenModules"
  ];
  for (const pref of allowedPrefs) {
    if (req.body[pref] !== undefined) {
      update[`preferences.${pref}`] = req.body[pref];
    }
  }

  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest("No valid fields to update");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: update },
    { new: true, runValidators: true },
  ).select("-password -refreshToken");

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  return ApiResponse.success(user).send(res);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findByEmail(email).select("+password");

  if (user && user.password && user.authProvider !== "google") {
    const token = generateResetToken(user);
    const resetLink = `${env.CLIENT_URL}/reset-password?token=${token}`;
    await emailService.sendPasswordResetEmail(email, resetLink).catch(() => {});
  }

  return ApiResponse.success(
    null,
    "If an account with that email exists, a password reset link has been sent.",
  ).send(res);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  const decoded = verifyResetToken(token);
  if (!decoded) {
    throw ApiError.badRequest("Invalid or expired reset link");
  }

  const user = await User.findById(decoded.userId).select("+password +refreshToken");
  if (!user) {
    throw ApiError.badRequest("Invalid or expired reset link");
  }

  const currentFragment = getPasswordFragment(user.password);
  if (currentFragment !== decoded.pwFragment) {
    throw ApiError.badRequest("This reset link has already been used");
  }

  user.password = newPassword;
  user.refreshToken = null;
  await user.save();

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  return ApiResponse.success({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      targetRole: user.targetRole,
      githubUsername: user.githubUsername,
      profile: user.profile,
    },
    accessToken,
  }).send(res);
});

const verifyResetTokenHandler = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return ApiResponse.success({ valid: false, reason: "invalid" }).send(res);
  }

  // Check JWT validity first to distinguish expired from invalid
  let jwtOk = false;
  let jwtExpired = false;
  try {
    jwt.verify(token, env.RESET_TOKEN_SECRET);
    jwtOk = true;
  } catch (e) {
    if (e.name === "TokenExpiredError") jwtExpired = true;
  }

  if (!jwtOk) {
    return ApiResponse.success({ valid: false, reason: jwtExpired ? "expired" : "invalid" }).send(
      res,
    );
  }

  // JWT is valid — now use verifyResetToken for purpose check + full decode
  const decoded = verifyResetToken(token);
  if (!decoded) {
    return ApiResponse.success({ valid: false, reason: "invalid" }).send(res);
  }

  // Check password-hash fragment (single-use)
  const user = await User.findById(decoded.userId).select("+password");
  if (!user) {
    return ApiResponse.success({ valid: false, reason: "invalid" }).send(res);
  }

  const currentFragment = getPasswordFragment(user.password);
  if (currentFragment !== decoded.pwFragment) {
    return ApiResponse.success({ valid: false, reason: "used" }).send(res);
  }

  return ApiResponse.success({ valid: true }).send(res);
});

const logoutAll = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $inc: { refreshTokenVersion: 1 }, refreshToken: "" });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  });
  return ApiResponse.success(null, "Logged out of all sessions").send(res);
});

const exportUserData = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // Fetch all user-related data in parallel for GDPR compliance
  const [
    user, 
    resumes, 
    interviews, 
    codingProfiles, 
    skillGaps, 
    aiUsage,
    examSubmissions,
    superDream,
    badges,
    mentorTasks,
    notifications,
    activityLogs
  ] = await Promise.all([
    User.findById(userId).select('-password -refreshToken -twoFactorSecret').lean(),
    Resume.find({ user: userId }).lean(),
    InterviewSession.find({ user: userId }).lean(),
    CodingProfile.find({ userId: userId }).lean(),
    SkillGapAnalysis.find({ user: userId }).lean(),
    AIUsageLog.find({ user: userId }).limit(1000).lean(),
    ExamSubmission.find({ userId: userId }).lean(),
    SuperDream.findOne({ student: userId }).lean(),
    require("../models/Badge.model").find({ userId: userId }).lean(),
    require("../models/MentorTask.model").find({ student: userId }).lean(),
    Notification.find({ user: userId }).limit(500).lean(),
    require("../models/ActivityLog.model").find({ user: userId }).limit(1000).lean()
  ]);

  // GDPR-compliant data export structure
  const exportData = {
    // Export metadata
    exportMetadata: {
      exportedAt: new Date().toISOString(),
      userId: userId.toString(),
      dataProtectionRegulation: "GDPR Article 20 - Right to Data Portability",
      format: "JSON",
      version: "1.0"
    },
    
    // Personal Information
    personalInformation: user ? {
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      authProvider: user.authProvider,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    } : null,
    
    // Profile Data
    profileData: user?.profile || {},
    
    // Career Goals
    careerGoals: {
      targetRole: user?.targetRole,
      githubUsername: user?.githubUsername,
      linkedinUrl: user?.linkedinUrl,
      bio: user?.bio
    },
    
    // Preferences & Settings
    preferences: user?.preferences || {},
    
    // Resumes
    resumes: resumes || [],
    
    // Interview Sessions
    interviews: interviews || [],
    
    // Coding Platform Profiles
    codingProfiles: codingProfiles || [],
    
    // Skill Analysis
    skillGaps: skillGaps || [],
    
    // Exam Submissions
    examSubmissions: examSubmissions?.map(sub => ({
      examId: sub.examId,
      score: sub.score,
      totalScore: sub.totalScore,
      percentage: sub.percentage,
      status: sub.status,
      submittedAt: sub.submittedAt,
      timeTaken: sub.timeTaken,
      passed: sub.passed
    })) || [],
    
    // Super Dream Progress
    superDream: superDream || null,
    
    // Badges & Achievements
    badges: badges || [],
    
    // Mentor Tasks
    mentorTasks: mentorTasks || [],
    
    // Notifications (limited to last 500)
    notifications: notifications || [],
    
    // Activity History (limited to last 1000)
    activityHistory: activityLogs || [],
    
    // AI Usage Statistics
    aiUsage: {
      totalQueries: aiUsage?.length || 0,
      recentUsage: aiUsage || []
    },
    
    // Data Processing Information
    dataProcessingInfo: {
      dataControllers: ["Campus to Career AI"],
      dataProcessors: ["MongoDB Atlas", "Google AI", "GitHub API"],
      dataRetentionPeriod: "Until account deletion",
      legalBasis: "Consent (GDPR Article 6(1)(a))",
      yourRights: [
        "Right to access (Article 15)",
        "Right to rectification (Article 16)",
        "Right to erasure (Article 17)",
        "Right to data portability (Article 20)",
        "Right to object (Article 21)"
      ],
      contactInfo: {
        dataProtectionOfficer: "privacy@campustocareer.ai",
        supportEmail: "support@campustocareer.ai"
      }
    }
  };

  // Set headers for download
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="campustocareer-data-export-${userId}-${Date.now()}.json"`);

  return res.json(exportData);
});

const generate2FA = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.user._id);
  if (currentUser && currentUser.is2FAEnabled) {
    throw ApiError.badRequest("Two-factor authentication is already active on your account. Please disable it first to reconfigure.");
  }

  const secret = speakeasy.generateSecret({ name: `Campus to Career AI (${req.user.email})` });
  
  await User.findByIdAndUpdate(req.user._id, { twoFactorSecret: secret.base32 });

  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) throw ApiError.internal("Failed to generate QR code");
    return ApiResponse.success({ qrCode: data_url, secret: secret.base32 }).send(res);
  });
});

const verify2FA = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findById(req.user._id).select("+twoFactorSecret");
  
  if (!user.twoFactorSecret) throw ApiError.badRequest("2FA not initiated");

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token,
    window: 1
  });

  if (!verified) throw ApiError.badRequest("Invalid verification code");

  user.is2FAEnabled = true;
  await user.save();
  return ApiResponse.success({ is2FAEnabled: true }).send(res);
});

const login2FA = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    throw ApiError.badRequest("Temporary token and 2FA code are required");
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, env.JWT_SECRET);
  } catch (err) {
    throw ApiError.unauthorized("Invalid or expired 2FA session token");
  }

  if (decoded.purpose !== "2fa_login" || !decoded.sub) {
    throw ApiError.unauthorized("Invalid 2FA session token payload");
  }

  const user = await User.findById(decoded.sub).select("+twoFactorSecret");
  if (!user || !user.is2FAEnabled || !user.twoFactorSecret) {
    throw ApiError.unauthorized("2FA is not configured for this account");
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: String(code).trim(),
    window: 1,
  });

  if (!verified) {
    throw ApiError.unauthorized("Invalid 2FA verification code");
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  // Send security new sign-in alert email for 2FA login
  emailService.sendNewLoginAlertEmail(user, {
    ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
    loginTime: new Date(),
  }).catch((e) => console.error("[Email] Failed to send login alert:", e.message));

  return ApiResponse.success({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      targetRole: user.targetRole,
      githubUsername: user.githubUsername,
      profile: user.profile,
      createdAt: user.createdAt,
      authProvider: user.authProvider,
    },
    accessToken,
  }).send(res);
});

const disable2FA = asyncHandler(async (req, res) => {
  const { code, password } = req.body;
  const user = await User.findById(req.user._id).select("+password +twoFactorSecret");
  if (!user) throw ApiError.notFound("User not found");

  let authorized = false;

  if (code && user.twoFactorSecret) {
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: String(code).trim(),
      window: 1,
    });
    if (verified) authorized = true;
  }

  if (!authorized && password && user.password) {
    const passMatch = await user.comparePassword(password);
    if (passMatch) authorized = true;
  }

  if (!authorized) {
    throw ApiError.unauthorized("Valid 2FA verification code or account password is required to disable 2FA");
  }

  user.is2FAEnabled = false;
  user.twoFactorSecret = "";
  await user.save();

  return ApiResponse.success({ is2FAEnabled: false }, "2FA has been disabled").send(res);
});

/**
 * DELETE ACCOUNT - GDPR Right to Erasure (Article 17)
 * Anonymizes user data while preserving referential integrity
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const { password, confirmText } = req.body;
  const userId = req.user._id;

  // Require password confirmation for security
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw ApiError.notFound("User not found");
  }

  // Verify password
  if (user.authProvider === "local" || user.authProvider === "both") {
    if (!password) {
      throw ApiError.badRequest("Password is required to delete account");
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized("Incorrect password");
    }
  }

  // Require explicit confirmation
  if (confirmText !== "DELETE MY ACCOUNT") {
    throw ApiError.badRequest('Please type "DELETE MY ACCOUNT" to confirm deletion');
  }

  // Audit log before deletion
  await auditLogService.logAuth({
    action: "USER_DELETED",
    userId: user._id,
    userEmail: user.email,
    status: "SUCCESS",
    req,
    details: {
      reason: "user_request",
      authProvider: user.authProvider,
      role: user.role
    }
  });

  const { encrypt } = require("../services/encryption.service");

  // Step 1: Anonymize user data (don't hard delete to preserve referential integrity)
  await User.findByIdAndUpdate(userId, {
    name: encrypt("Deleted User"),
    email: `deleted_${userId}@deleted.campustocareer.ai`,
    password: crypto.randomBytes(32).toString("hex") + "Aa1!",
    googleId: null,
    githubId: null,
    githubUsername: "",
    linkedinUrl: "",
    bio: "",
    avatar: "",
    targetRole: "",
    refreshToken: null,
    emailVerificationToken: null,
    twoFactorSecret: null,
    is2FAEnabled: false,
    profile: {
      targetRole: "",
      githubUsername: "",
      bio: "",
      location: "",
      registerNumber: "",
      department: "",
      batch: "",
      currentSemester: "",
      facultyMentor: ""
    },
    isDeleted: true,
    deletedAt: new Date(),
    authProvider: "deleted"
  });

  // Step 2: Remove from mentor's mentee list
  await User.updateMany(
    { mentees: userId },
    { $pull: { mentees: userId } }
  );

  // Step 3: Unassign from mentees if mentor
  await User.updateMany(
    { assignedMentor: userId },
    { $unset: { assignedMentor: 1 } }
  );

  // Step 4: Anonymize related data collections
  // Resumes
  await Resume.updateMany(
    { user: userId },
    {
      $set: {
        anonymized: true,
        anonymizedAt: new Date()
      }
    }
  );

  // Exam Submissions
  await ExamSubmission.updateMany(
    { userId: userId },
    {
      $set: {
        anonymized: true,
        anonymizedAt: new Date()
      }
    }
  );

  // Interview Sessions
  await InterviewSession.updateMany(
    { user: userId },
    {
      $set: {
        anonymized: true,
        anonymizedAt: new Date()
      }
    }
  );

  // Coding Profiles
  await CodingProfile.updateMany(
    { userId: userId },
    {
      $set: {
        anonymized: true,
        anonymizedAt: new Date()
      }
    }
  );

  // Skill Gap Analysis
  await SkillGapAnalysis.updateMany(
    { user: userId },
    {
      $set: {
        anonymized: true,
        anonymizedAt: new Date()
      }
    }
  );

  // Super Dream records - keep for institutional analytics but anonymize
  await SuperDream.updateMany(
    { student: userId },
    {
      $set: {
        "checklist.profile.name": "Deleted User",
        "checklist.profile.registerNumber": "",
        anonymized: true,
        anonymizedAt: new Date()
      }
    }
  );

  // Step 5: Clear notification history (PII may be in messages)
  await Notification.deleteMany({ user: userId });

  // Step 6: Clear activity logs
  const ActivityLog = require("../models/ActivityLog.model");
  await ActivityLog.deleteMany({ user: userId });

  // Step 7: Clear session and logout
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  });

  return ApiResponse.success(
    null,
    "Your account has been successfully deleted. All personal data has been anonymized in compliance with GDPR."
  ).send(res);
});

/**
 * Send email verification
 * POST /api/auth/send-verification
 */
const sendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  if (user.isEmailVerified) {
    return ApiResponse.success(null, "Email is already verified").send(res);
  }

  // Generate verification token (valid for 24 hours)
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");

  // Store hashed token with expiry
  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save();

  // Send verification email
  await emailService.sendVerificationEmail(user, verificationToken);

  return ApiResponse.success(null, "Verification email sent successfully").send(res);
});

/**
 * Verify email with token
 * GET /api/auth/verify-email/:token
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    throw ApiError.badRequest("Verification token is required");
  }

  // Hash the token to compare with stored hash
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw ApiError.badRequest("Invalid or expired verification token");
  }

  // Mark email as verified
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return ApiResponse.success(
    { email: user.email, isEmailVerified: true },
    "Email verified successfully"
  ).send(res);
});

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 */
const resendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  if (user.isEmailVerified) {
    return ApiResponse.success(null, "Email is already verified").send(res);
  }

  // Check if last email was sent less than 5 minutes ago (rate limiting)
  if (user.emailVerificationExpires && user.emailVerificationExpires > Date.now() + 23.92 * 60 * 60 * 1000) {
    throw ApiError.tooManyRequests("Please wait at least 5 minutes before requesting another verification email");
  }

  // Generate new verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");

  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();

  await emailService.sendVerificationEmail(user, verificationToken);

  return ApiResponse.success(null, "Verification email resent successfully").send(res);
});

module.exports = {
  register,
  login,
  login2FA,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  updatePreferences,
  forgotPassword,
  resetPassword,
  verifyResetTokenHandler,
  googleLogin,
  githubLogin,
  logoutAll,
  exportUserData,
  deleteAccount,
  generate2FA,
  verify2FA,
  disable2FA,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
};
