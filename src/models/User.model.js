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
      validate: {
        validator: function(v) {
          // Skip validation if password was not modified (e.g. during login, profile updates, token refresh)
          if (this && typeof this.isModified === "function" && !this.isModified("password")) {
            return true;
          }
          // Skip validation if already a bcrypt hash
          if (typeof v === "string" && /^\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}$/.test(v)) {
            return true;
          }
          // Require: 1 uppercase, 1 lowercase, 1 number, 1 special char
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[\S]{8,}$/.test(v);
        },
        message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
      },
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
    proctoringBlockTrack: {
      type: String,
      enum: ["classic", "super_dream"],
      default: "classic",
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Store original role value before any modifications (MUST RUN FIRST)
userSchema.pre("save", async function(next) {
  if (!this.isNew && this.isModified("role")) {
    // Store original value using $locals before any changes
    if (!this.$locals.wasRole) {
      // Retrieve the original document from database
      const User = mongoose.model("User");
      const original = await User.findById(this._id).select('role').lean();
      if (original) {
        this.$locals.wasRole = original.role;
      }
    }
  }
  next();
});

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

// Pre-save hook: Role transition validation and cleanup
userSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("role")) return next();
    
    const User = mongoose.model("User");
    
    // Get original role
    const originalRole = this.$locals.wasRole;
    
    // If demoting from mentor to student, reassign mentees
    if (originalRole === "mentor" && this.role === "student") {
      console.log(`[User] Demoting user ${this._id} from mentor to student, reassigning mentees`);
      
      // Unassign all mentees
      await User.updateMany(
        { assignedMentor: this._id },
        { $unset: { assignedMentor: 1 } }
      );
      
      // Clear mentees array
      this.mentees = [];
    }
    
    // Prevent last admin from demoting self
    if (originalRole === "admin" && this.role !== "admin") {
      const adminCount = await User.countDocuments({ role: "admin", _id: { $ne: this._id } });
      
      if (adminCount === 0) {
        const error = new Error("Cannot demote the last admin. Please assign another admin first.");
        return next(error);
      }
    }
    
    // If promoting to mentor, initialize mentees array
    if (this.role === "mentor" && (!this.mentees || this.mentees.length === 0)) {
      this.mentees = [];
    }
    
    next();
  } catch (err) {
    next(err);
  }
});

// Safe helper to decrypt a single user document's PII fields without crashing
function safeDecryptUserDoc(doc) {
  if (!doc) return;
  try {
    if (doc.name && isEncrypted(doc.name)) {
      const dec = decrypt(doc.name);
      // If decryption returned the encrypted string (due to key mismatch), fall back to email username
      doc.name = isEncrypted(dec)
        ? (doc.email ? doc.email.split("@")[0] : "Student")
        : dec;
    }
    if (doc.githubUsername && isEncrypted(doc.githubUsername)) {
      const dec = decrypt(doc.githubUsername);
      doc.githubUsername = isEncrypted(dec) ? "" : dec;
    }
    if (doc.linkedinUrl && isEncrypted(doc.linkedinUrl)) {
      const dec = decrypt(doc.linkedinUrl);
      doc.linkedinUrl = isEncrypted(dec) ? "" : dec;
    }
    if (doc.bio && isEncrypted(doc.bio)) {
      const dec = decrypt(doc.bio);
      doc.bio = isEncrypted(dec) ? "" : dec;
    }
    if (doc.profile?.registerNumber && isEncrypted(doc.profile.registerNumber)) {
      const dec = decrypt(doc.profile.registerNumber);
      doc.profile.registerNumber = isEncrypted(dec) ? "" : dec;
    }
    if (doc.profile?.location && isEncrypted(doc.profile.location)) {
      const dec = decrypt(doc.profile.location);
      doc.profile.location = isEncrypted(dec) ? "" : dec;
    }
  } catch (err) {
    console.warn("[User.model] Safe decryption error:", err.message);
  }
}

// Post-find hook: Decrypt PII fields after retrieval
userSchema.post("find", function (docs) {
  if (!docs) return;
  if (Array.isArray(docs)) {
    docs.forEach(safeDecryptUserDoc);
  } else {
    safeDecryptUserDoc(docs);
  }
});

// Post-findOne hook: Decrypt PII fields
userSchema.post("findOne", function (doc) {
  safeDecryptUserDoc(doc);
});

// Post-save hook: Decrypt in-memory document immediately after writing to MongoDB
// so that User.create or user.save() leaves doc.name and other PII in plaintext for immediate callers
userSchema.post("save", function (doc) {
  safeDecryptUserDoc(doc);
});

// Post-findOneAndUpdate hook: Decrypt PII fields
userSchema.post("findOneAndUpdate", function (doc) {
  safeDecryptUserDoc(doc);
});

// Post-init hook: Ensure document instantiated from DB is decrypted
userSchema.post("init", function (doc) {
  safeDecryptUserDoc(doc);
});

// Instance method: Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcryptjs.compare(candidatePassword, this.password);
};

// Instance method: Generate access token
userSchema.methods.generateAccessToken = function () {
  const nonce = crypto.randomBytes(16).toString("hex");
  const plainName = this.name && isEncrypted(this.name) ? decrypt(this.name) : this.name;
  return jwt.sign({ sub: this._id, email: this.email, name: plainName, nonce }, env.JWT_SECRET, {
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
