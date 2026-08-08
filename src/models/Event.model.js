const mongoose = require("mongoose");

const EVENT_TYPES = ["hackathon", "ideathon", "coding-competition", "ctf", "game-jam", "research-symposium", "startup-weekend", "other"];
const MODES = ["online", "offline", "hybrid"];
const LEVELS = ["intra-college", "inter-college", "state", "national", "international"];
const RESULTS = ["winner", "runner-up", "finalist", "shortlisted", "participated"];
const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"];

const eventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Basic Info
    eventName: { type: String, required: [true, "Event name is required"], trim: true, maxlength: 150 },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    organizer: { type: String, trim: true, maxlength: 150 },
    mode: { type: String, enum: MODES, required: true },
    level: { type: String, enum: LEVELS, required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    // Team Info
    teamName: { type: String, trim: true, maxlength: 100, default: null },
    teamSize: { type: Number, min: 1, default: 1 },
    role: { type: String, trim: true, maxlength: 100, default: null },
    teamMembers: { type: [String], default: [] },

    // Project Info
    projectTitle: { type: String, trim: true, maxlength: 150, default: null },
    problemStatement: { type: String, trim: true, maxlength: 500, default: null },
    techStack: { type: [String], default: [] },
    description: { type: String, trim: true, maxlength: 2000, default: null },

    // Result
    result: { type: String, enum: RESULTS, required: true },
    prize: { type: String, trim: true, maxlength: 200, default: null },

    // Proof
    certificateUrl: { type: String, required: [true, "Certificate proof is required"] },
    projectLink: { type: String, trim: true, default: null },
    socialPostLink: { type: String, trim: true, default: null },

    // ==================== NEW FIELDS ====================

    // Reflection & Learning
    reflection: {
      whatDidYouBuild: { type: String, trim: true, maxlength: 2000, default: null },
      whatDidYouLearn: { type: String, trim: true, maxlength: 2000, default: null },
      challengesFaced: { type: String, trim: true, maxlength: 2000, default: null },
      whatWouldYouDoDifferently: { type: String, trim: true, maxlength: 2000, default: null },
      keyTakeaways: { type: [String], default: [] },
      skillsImproved: { type: [String], default: [] },
      rating: { type: Number, min: 1, max: 5, default: null },
      wouldRecommend: { type: Boolean, default: null },
    },

    // Portfolio Integration
    portfolio: {
      isPublic: { type: Boolean, default: false },
      showcaseOrder: { type: Number, default: 0 },
      customThumbnail: { type: String, trim: true, default: null },
      featured: { type: Boolean, default: false },
      tags: { type: [String], default: [] },
      viewCount: { type: Number, default: 0 },
    },

    // Skill Integration
    skillImpact: {
      techStackSkills: [{
        skill: { type: String, trim: true },
        levelBefore: { type: String, enum: SKILL_LEVELS, default: "beginner" },
        levelAfter: { type: String, enum: SKILL_LEVELS, default: "intermediate" },
        confidence: { type: Number, min: 0, max: 100, default: 50 },
      }],
      newSkillsLearned: { type: [String], default: [] },
      gapAnalysisTriggered: { type: Boolean, default: false },
      skillGapAnalysisId: { type: mongoose.Schema.Types.ObjectId, ref: "SkillGapAnalysis", default: null },
    },

    // Gamification
    gamification: {
      pointsEarned: { type: Number, default: 0 },
      badges: { type: [String], default: [] },
      streakContribution: { type: Boolean, default: false },
      levelContribution: { type: Number, default: 0 },
    },

    // AI Enhancements
    aiGenerated: {
      description: { type: Boolean, default: false },
      reflection: { type: Boolean, default: false },
      tags: { type: Boolean, default: false },
      skillMapping: { type: Boolean, default: false },
    },

    // Metadata
    metadata: {
      source: { type: String, enum: ["manual", "import", "api"], default: "manual" },
      externalId: { type: String, trim: true, default: null },
      importedAt: { type: Date, default: null },
      verificationStatus: { type: String, enum: ["unverified", "pending", "verified", "rejected"], default: "unverified" },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      verifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

// Indexes
eventSchema.index({ user: 1, createdAt: -1 });
eventSchema.index({ user: 1, eventType: 1 });
eventSchema.index({ user: 1, "portfolio.isPublic": 1, "portfolio.featured": -1, "portfolio.showcaseOrder": 1 });
eventSchema.index({ user: 1, "skillImpact.gapAnalysisTriggered": 1 });
eventSchema.index({ "metadata.verificationStatus": 1 });

// Virtual for duration in days
eventSchema.virtual("durationDays").get(function () {
  if (!this.startDate || !this.endDate) return 0;
  const diff = new Date(this.endDate) - new Date(this.startDate);
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
});

// Virtual for tech stack count
eventSchema.virtual("techStackCount").get(function () {
  return this.techStack?.length || 0;
});

// Method to calculate points based on event properties
eventSchema.methods.calculatePoints = function () {
  let points = 10; // Base points

  // Result bonus
  const resultPoints = { winner: 100, "runner-up": 75, finalist: 50, shortlisted: 25, participated: 10 };
  points += resultPoints[this.result] || 0;

  // Level bonus
  const levelPoints = { "intra-college": 10, "inter-college": 25, state: 50, national: 100, international: 200 };
  points += levelPoints[this.level] || 0;

  // Team size bonus (max 20)
  points += Math.min(this.teamSize - 1, 5) * 4;

  // Tech stack diversity (max 30)
  points += Math.min(this.techStack.length, 10) * 3;

  // Duration bonus (max 20)
  const duration = this.durationDays;
  if (duration >= 7) points += 20;
  else if (duration >= 3) points += 15;
  else if (duration >= 2) points += 10;
  else points += 5;

  // Reflection bonus
  if (this.reflection?.whatDidYouLearn) points += 15;
  if (this.reflection?.keyTakeaways?.length > 0) points += 10;

  // Portfolio bonus
  if (this.portfolio?.isPublic) points += 10;
  if (this.portfolio?.featured) points += 20;

  return points;
};

eventSchema.set("toJSON", { virtuals: true });
eventSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Event", eventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.MODES = MODES;
module.exports.LEVELS = LEVELS;
module.exports.RESULTS = RESULTS;
module.exports.SKILL_LEVELS = SKILL_LEVELS;