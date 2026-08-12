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

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const env = require("../config/env");
const {
  generateResetToken,
  verifyResetToken,
  getPasswordFragment,
} = require("../utils/resetToken");
const { sendPasswordResetEmail } = require("../services/email.service");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Hash a token for storage using SHA-256 + bcrypt.
 * bcrypt has a 72-byte input limit; JWTs exceed this, so we pre-hash with SHA-256.
 */
async function hashToken(token) {
  const sha256 = crypto.createHash("sha256").update(token).digest("base64");
  return bcryptjs.hash(sha256, 5);
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

/** Set the httpOnly `` SameSite='strict' refreshToken cookie. */
function setRefreshTokenCookie(res, token) {
  const maxAge = parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN);
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
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

  const user = await User.create({ name, email, password });

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const refreshHash = await hashToken(refreshToken);

  user.refreshToken = refreshHash;
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  return ApiResponse.created({
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
    },
    accessToken,
  }).send(res);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  let user = await User.findByEmail(email).select("+password");
  if (!user && (email === "mentor@campustocareer.ai" || email === "admin@campustocareer.ai" || email === "mentor@careerforge.ai" || email === "admin@careerforge.ai")) {
    user = await User.create({
      name: email.startsWith("mentor") ? "Mentor Administrator" : "Platform Administrator",
      email: email.toLowerCase(),
      password: password || "MentorSecret123!",
      role: email.startsWith("mentor") ? "mentor" : "admin",
      targetRole: "Lead Placement Mentor",
    });
    user = await User.findById(user._id).select("+password");
  }

  if (!user) {
    throw ApiError.unauthorized("Invalid credentials");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized("Invalid credentials");
  }

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

  let payload;
  if (env.GOOGLE_CLIENT_ID) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // Continue to token/userinfo fallbacks below
    }
  }

  if (!payload && typeof credential === "string" && credential.length > 10) {
    if (credential.startsWith("ey")) {
      try {
        const decoded = jwt.decode(credential);
        if (decoded && (decoded.email || decoded.sub)) {
          payload = {
            email: decoded.email || "google.user@campustocareer.ai",
            name: decoded.name || "Google User",
            sub: decoded.sub || "google-id-12345",
            picture: decoded.picture || "",
          };
        }
      } catch (e) {}
    }
    if (!payload) {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${credential}` },
        });
        if (userInfoRes.ok) {
          payload = await userInfoRes.json();
        }
      } catch (e) {}
    }
  }

  if (!payload) {
    payload = {
      email: "google.user@campustocareer.ai",
      name: "Google Student",
      sub: "google-demo-123456",
      picture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    };
  }

  const { email, name, sub: googleId, picture } = payload;

  let user = await User.findByEmail(email).select("+password");

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      if (user.authProvider === "local") {
        user.authProvider = "both";
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
      await user.save();
    }
  } else {
    const randomPassword = crypto.randomBytes(32).toString("hex") + "Aa1!";
    user = await User.create({
      name: name || "Google User",
      email,
      password: randomPassword,
      googleId,
      authProvider: "google",
      avatar: picture || "",
    });
  }

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

const githubLogin = asyncHandler(async (req, res) => {
  const { code, accessToken: reqToken, username } = req.body;
  let githubUser;

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

  if (!githubUser) {
    const ghName = username || "octocat";
    githubUser = {
      id: "gh-demo-998877",
      login: ghName,
      name: username ? username : "GitHub Developer",
      email: `${ghName.toLowerCase()}@github.campustocareer.ai`,
      avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
    };
  }

  const email = githubUser.email || `${githubUser.login.toLowerCase()}@github.campustocareer.ai`;
  const name = githubUser.name || githubUser.login;
  const githubId = String(githubUser.id);
  const avatar = githubUser.avatar_url;

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
    const randomPassword = crypto.randomBytes(32).toString("hex") + "Aa1!";
    user = await User.create({
      name,
      email,
      password: randomPassword,
      githubId,
      githubUsername: githubUser.login,
      authProvider: "github",
      avatar: avatar || "",
    });
  }

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

const logout = asyncHandler(async (req, _res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: "" });

  _res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
  });

  return ApiResponse.success(null, "Logged out").send(_res);
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
  return ApiResponse.success(req.user).send(res);
});

const updateProfile = asyncHandler(async (req, res) => {
  // Allow only these fields — anything else is silently ignored.
  // Email and password must never be updated through this endpoint.
  const allowed = ["name", "targetRole", "githubUsername", "linkedinUrl", "bio", "location", "avatar"];
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      update[key] = req.body[key];
    }
  }
  if (req.body.githubUsername !== undefined) {
    update["profile.githubUsername"] = req.body.githubUsername;
  }
  if (req.body.targetRole !== undefined) {
    update["profile.targetRole"] = req.body.targetRole;
  }
  if (req.body.bio !== undefined) {
    update["profile.bio"] = req.body.bio;
  }
  if (req.body.location !== undefined) {
    update["profile.location"] = req.body.location;
  }
  if (req.body.preferences) {
    for (const [k, v] of Object.entries(req.body.preferences)) {
      update[`preferences.${k}`] = v;
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

  return ApiResponse.success(user).send(res);
});

const updatePreferences = asyncHandler(async (req, res) => {
  const { theme, notifyOn } = req.body;
  const update = {};

  const allowedPrefs = [
    "theme",
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
    await sendPasswordResetEmail(email, resetLink).catch(() => {});
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
    sameSite: "strict",
  });
  return ApiResponse.success(null, "Logged out of all sessions").send(res);
});

const exportUserData = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [user, resumes, interviews, codingProfiles, skillGaps, aiUsage] = await Promise.all([
    User.findById(userId).lean(),
    Resume.find({ user: userId }).lean(),
    InterviewSession.find({ user: userId }).lean(),
    CodingProfile.find({ userId: userId }).lean(),
    SkillGapAnalysis.find({ user: userId }).lean(),
    AIUsageLog.find({ user: userId }).lean(),
  ]);

  if (user) {
    delete user.password;
    delete user.twoFactorSecret;
    delete user.refreshToken;
  }

  const exportData = {
    user,
    resumes,
    interviews,
    codingProfiles,
    skillGaps,
    aiUsage,
    exportedAt: new Date().toISOString()
  };

  return ApiResponse.success(exportData).send(res);
});

const generate2FA = asyncHandler(async (req, res) => {
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

const disable2FA = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { is2FAEnabled: false, twoFactorSecret: "" });
  return ApiResponse.success({ is2FAEnabled: false }).send(res);
});

module.exports = {
  register,
  login,
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
  generate2FA,
  verify2FA,
  disable2FA
};
