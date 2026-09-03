const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");
const { encrypt, decrypt, isEncrypted } = require("../services/encryption.service");

// PII fields that should be encrypted at rest
const ENCRYPTED_FIELDS = ["name", "profile.registerNumber", "profile.location", "githubUsername", "linkedinUrl", "bio"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name must be at most 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    googleId: { type: String, unique: true, sparse: true },
    githubId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google", "github", "both"], default: "local" },
    avatar: { type: String, default: "" },
    role: {
      type: String,
      enum: ["student", "mentor", "admin"],
      default: "student",
    },
    assignedMentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    mentees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    targetRole: { type: String, default: "" },
    githubUsername: { type: String, default: "" },
    profile: {
      targetRole: { type: String },
      githubUsername: { type: String },
      bio: { type: String },
      location: { type: String },
      registerNumber: { type: String, default: "" },
      department: { type: String, default: "" },
      batch: { type: String, default: "" },
      currentSemester: { type: String, default: "" },
      facultyMentor: { type: String, default: "" },
    },
    linkedinUrl: { type: String, default: "" },
    bio: { type: String, maxlength: 500, default: "" },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    is2FAEnabled: { type: Boolean, default: false }, // TOTP 2FA — routes at POST /api/auth/2fa/*
    twoFactorSecret: { type: String, select: false }, // speakeasy TOTP secret, excluded from default queries
    refreshToken: { type: String, select: false },
    refreshTokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastFailedLogin: { type: Date, default: null },
    lockoutHistory: [
      {
        lockedAt: { type: Date },
        attempts: { type: Number },
        duration: { type: Number }, // Duration in milliseconds
      },
    ],
    welcomeEmailSent: { type: Boolean, default: false },
    preferences: {
      theme: {
        type: String,
        enum: ["dark", "light", "system"],
        default: "dark",
      },
      accentColor: {
        type: String,
        enum: ["indigo", "purple", "emerald", "amber", "cyan", "rose"],
        default: "indigo",
      },
      notifyOn: {
        type: [String],
        default: ["/resume", "/interview", "/github", "/skills", "/roadmap"],
      },
      emailDigest: {
        type: String,
        enum: ["off", "daily", "weekly"],
        default: "off",
      },
      aiDifficulty: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"],
        default: "Intermediate",
      },
      preferredLanguage: {
        type: String,
        default: "Python",
      },
      resumePrivacy: {
        type: Boolean,
        default: false,
      },
      dailyGoalProblems: {
        type: Number,
        default: 2,
      },
      hiddenModules: {
        type: [String],
        default: [],
      },
    },
    isProctoringBlocked: { type: Boolean, default: false },
    proctoringBlockedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Pre-save hook: Encrypt PII fields before saving
userSchema.pre("save", async function (next) {
  try {
    // Encrypt name if modified
    if (this.isModified("name") && this.name && !isEncrypted(this.name)) {
      this.name = encrypt(this.name);
    }

    // Encrypt githubUsername if modified
    if (this.isModified("githubUsername") && this.githubUsername && !isEncrypted(this.githubUsername)) {
      this.githubUsername = encrypt(this.githubUsername);
    }

    // Encrypt linkedinUrl if modified
    if (this.isModified("linkedinUrl") && this.linkedinUrl && !isEncrypted(this.linkedinUrl)) {
      this.linkedinUrl = encrypt(this.linkedinUrl);
    }

    // Encrypt bio if modified
    if (this.isModified("bio") && this.bio && !isEncrypted(this.bio)) {
      this.bio = encrypt(this.bio);
    }

    // Encrypt profile.registerNumber if modified
    if (this.isModified("profile.registerNumber") && this.profile?.registerNumber && !isEncrypted(this.profile.registerNumber)) {
      this.profile.registerNumber = encrypt(this.profile.registerNumber);
    }

    // Encrypt profile.location if modified
    if (this.isModified("profile.location") && this.profile?.location && !isEncrypted(this.profile.location)) {
      this.profile.location = encrypt(this.profile.location);
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Pre-save hook: Hash password with bcryptjs (10 rounds) only if modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcryptjs.genSalt(10);
  this.password = await bcryptjs.hash(this.password, salt);
  next();
});

// Post-find hook: Decrypt PII fields after retrieval
userSchema.post("find", function (docs) {
  if (!docs) return;

  docs.forEach((doc) => {
    if (doc.name && isEncrypted(doc.name)) doc.name = decrypt(doc.name);
    if (doc.githubUsername && isEncrypted(doc.githubUsername)) doc.githubUsername = decrypt(doc.githubUsername);
    if (doc.linkedinUrl && isEncrypted(doc.linkedinUrl)) doc.linkedinUrl = decrypt(doc.linkedinUrl);
    if (doc.bio && isEncrypted(doc.bio)) doc.bio = decrypt(doc.bio);
    if (doc.profile?.registerNumber && isEncrypted(doc.profile.registerNumber)) {
      doc.profile.registerNumber = decrypt(doc.profile.registerNumber);
    }
    if (doc.profile?.location && isEncrypted(doc.profile.location)) {
      doc.profile.location = decrypt(doc.profile.location);
    }
  });
});

// Post-findOne hook: Decrypt PII fields
userSchema.post("findOne", function (doc) {
  if (!doc) return;

  if (doc.name && isEncrypted(doc.name)) doc.name = decrypt(doc.name);
  if (doc.githubUsername && isEncrypted(doc.githubUsername)) doc.githubUsername = decrypt(doc.githubUsername);
  if (doc.linkedinUrl && isEncrypted(doc.linkedinUrl)) doc.linkedinUrl = decrypt(doc.linkedinUrl);
  if (doc.bio && isEncrypted(doc.bio)) doc.bio = decrypt(doc.bio);
  if (doc.profile?.registerNumber && isEncrypted(doc.profile.registerNumber)) {
    doc.profile.registerNumber = decrypt(doc.profile.registerNumber);
  }
  if (doc.profile?.location && isEncrypted(doc.profile.location)) {
    doc.profile.location = decrypt(doc.profile.location);
  }
});

// Instance method: Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcryptjs.compare(candidatePassword, this.password);
};

// Instance method: Generate access token
userSchema.methods.generateAccessToken = function () {
  const nonce = crypto.randomBytes(16).toString("hex");
  return jwt.sign({ sub: this._id, email: this.email, name: this.name, nonce }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

// Instance method: Generate refresh token
userSchema.methods.generateRefreshToken = function () {
  const nonce = crypto.randomBytes(16).toString("hex");
  return jwt.sign({ sub: this._id, nonce }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
};

// Static method: Find by email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

module.exports = mongoose.model("User", userSchema);
