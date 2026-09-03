const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    extractedText: {
      type: String,
      required: true,
    },
    atsScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    keywordBreakdown: {
      matched: [String],
      missing: [String],
    },
    strengths: [String],
    improvements: [String],
    summary: String,
    internships: [
      {
        role: String,
        company: String,
        duration: String,
        durationMonths: Number,
        technologies: [String],
        keyResponsibilities: [String],
        metricsIdentified: Boolean,
        qualityRating: String,
        feedback: String,
      },
    ],
    projects: [
      {
        title: String,
        projectType: {
          type: String,
          default: "personal",
        },
        duration: String,
        durationMonths: Number,
        techStack: [String],
        description: String,
        hasLiveOrRepoLink: Boolean,
        highlights: [String],
        complexityScore: Number,
        feedback: String,
      },
    ],
    eventsAndCompetitions: [
      {
        name: String,
        category: {
          type: String,
          default: "other",
        },
        roleOrAchievement: String,
        yearOrDate: String,
        skillsDemonstrated: [String],
        feedback: String,
      },
    ],
    scoreBreakdown: {
      overallAtsScore: Number,
      pillars: {
        internshipsAndWork: {
          score: Number,
          weight: Number,
          totalMonths: Number,
          count: Number,
          summary: String,
        },
        projectsAndPersonal: {
          score: Number,
          weight: Number,
          personalCount: Number,
          academicCount: Number,
          summary: String,
        },
        skillsAndKeywords: {
          score: Number,
          weight: Number,
          matchedCount: Number,
          missingCount: Number,
          summary: String,
        },
        eventsAndHackathons: {
          score: Number,
          weight: Number,
          count: Number,
          summary: String,
        },
        formatAndStructure: {
          score: Number,
          weight: Number,
          hasMetrics: Boolean,
          readability: String,
          summary: String,
        },
      },
    },
    recommendations: {
      experienceAdvice: String,
      projectAdvice: String,
      eventsAdvice: String,
    },
    targetRole: {
      type: String,
      default: null,
    },
    inferredTargetRole: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Resume", resumeSchema);
