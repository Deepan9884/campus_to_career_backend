const mongoose = require("mongoose");

const MovementSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      required: true,
      enum: [
        "quiz_completed",
        "subtopic_toggled",
        "repo_submitted",
        "cert_uploaded",
        "rating_updated",
        "task_submitted",
        "coding_synced",
        "profile_updated",
        "deliverable_updated",
        "test_attempted",
      ],
    },
    sectionId: {
      type: Number,
      default: 0,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const SuperDreamSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Complete 10 sections checklist
    checklist: {
      profile: {
        id: { type: String, default: "" },
        name: { type: String, default: "" },
        registerNumber: { type: String, default: "" },
        department: { type: String, default: "" },
        batch: { type: String, default: "" },
        facultyMentor: { type: String, default: "" },
        currentSemester: { type: String, default: "" },
        targetRole: { type: String, default: "" },
        targetCompanyTier: { type: String, default: "" },
      },
      section1Programming: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section2CsFundamentals: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section3CodingDsa: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section4SoftwareDev: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section5AiDataScience: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section6CloudDevOps: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section7GithubPortfolio: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section8Certifications: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section9InterviewPrep: { type: [mongoose.Schema.Types.Mixed], default: [] },
      section10Evaluation: {
        strengths: { type: String, default: "" },
        areasForImprovement: { type: String, default: "" },
        actionPlanNextSemester: { type: String, default: "" },
        recommendedLearningPaths: { type: [String], default: [] },
        studentSignature: { type: String, default: "" },
        studentSignedDate: { type: String, default: "" },
        facultyMentorSignature: { type: String, default: "" },
        facultyMentorSignedDate: { type: String, default: "" },
        hodSignature: { type: String, default: "" },
        hodSignedDate: { type: String, default: "" },
        reviewDate: { type: String, default: "" },
      },
      overrideScores: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    // Multi-Platform DSA Telemetry
    codingPlatformsStats: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // CS quiz attempts & integrity history
    csQuizAttempts: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    visitedCsCourses: {
      type: [String],
      default: [],
    },
    // Allocated projects
    allocatedProjects: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    allocatedAiProjects: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // Curated courses and proofs
    courses: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // Tests & Diagnostics
    tests: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // Roadmaps
    mentorRoadmap: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // 4-Phase Travel Milestones
    travelMilestones: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // Real-time movement & audit history (like a mentor stream)
    movementHistory: {
      type: [MovementSchema],
      default: [],
    },
    // Computed cached metrics for fast cohort queries
    overallReadiness: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    tierName: {
      type: String,
      default: "Foundational Tier (< ₹8 LPA)",
    },
    activePhase: {
      type: Number,
      default: 1,
      min: 1,
      max: 4,
    },
    verifiedDeliverablesCount: {
      type: Number,
      default: 0,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

SuperDreamSchema.index({ overallReadiness: -1 });
SuperDreamSchema.index({ "movementHistory.timestamp": -1 });

module.exports = mongoose.model("SuperDream", SuperDreamSchema);
