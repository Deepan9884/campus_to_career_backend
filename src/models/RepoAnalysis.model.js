const mongoose = require("mongoose");

const qualitySchema = new mongoose.Schema(
  {
    overallScore: { type: Number, min: 0, max: 100, default: 80 },
    codeOrganization: { type: String, default: "" },
    readability: { type: String, default: "" },
    bestPractices: { type: String, default: "" },
    documentation: { type: String, default: "" },
    testing: { type: String, default: "" },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
  },
  { _id: false },
);

const securitySchema = new mongoose.Schema(
  {
    overallRating: { type: String, default: "Good" },
    issues: { type: [String], default: [] },
    goodPractices: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
  },
  { _id: false },
);

const resumeImpactSchema = new mongoose.Schema(
  {
    bullets: { type: [String], default: [] },
    interviewTalkingPoints: { type: [String], default: [] },
    uniqueSellingPoints: { type: [String], default: [] },
    improvementSuggestions: { type: [String], default: [] },
  },
  { _id: false },
);

const technicalSkillsSchema = new mongoose.Schema(
  {
    languages: { type: [String], default: [] },
    frameworks: { type: [String], default: [] },
    tools: { type: [String], default: [] },
    patterns: { type: [String], default: [] },
    databases: { type: [String], default: [] },
    cloudServices: { type: [String], default: [] },
  },
  { _id: false },
);

const professionalReadinessSchema = new mongoose.Schema(
  {
    overallScore: { type: Number, min: 0, max: 100, default: 80 },
    productionReady: { type: Boolean, default: false },
    teamCollaboration: { type: String, default: "" },
    projectComplexity: { type: String, default: "Intermediate" },
    businessValue: { type: String, default: "" },
    scalability: { type: String, default: "" },
  },
  { _id: false },
);

const recruiterViewSchema = new mongoose.Schema(
  {
    hiringPotential: { type: String, default: "High" },
    standoutFeatures: { type: [String], default: [] },
    redFlags: { type: [String], default: [] },
    idealRoles: { type: [String], default: [] },
    experienceLevel: { type: String, default: "Entry" },
  },
  { _id: false },
);

const benchmarksSchema = new mongoose.Schema(
  {
    peerComparison: { type: String, default: "" },
    industryStandards: { type: String, default: "" },
    competitiveAdvantage: { type: String, default: "" },
  },
  { _id: false },
);

const repoAnalysisSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    repoFullName: {
      type: String,
      required: [true, "Repository full name is required"],
      trim: true,
    },
    repoUrl: {
      type: String,
      required: [true, "Repository URL is required"],
    },
    
    // === Executive Summary ===
    overview: {
      type: String,
      default: null,
    },
    projectType: {
      type: String,
      default: "Full-Stack Web App",
    },
    primaryTechStack: {
      type: [String],
      default: [],
    },
    
    // === Code Quality Analysis ===
    quality: {
      type: qualitySchema,
      default: () => ({}),
      set: function (val) {
        if (typeof val === "string") {
          return {
            overallScore: 82,
            codeOrganization: val,
            readability: "Clean code structure with intuitive conventions.",
            bestPractices: "Follows language and framework standards.",
            documentation: "Standard documentation present.",
            testing: "Modular structure ready for testing.",
            strengths: [val],
            improvements: [],
          };
        }
        return val;
      },
    },
    
    // === Technical Skills Demonstrated ===
    technicalSkills: {
      type: technicalSkillsSchema,
      default: () => ({}),
    },
    
    // === Security Analysis ===
    security: {
      type: securitySchema,
      default: () => ({}),
      set: function (val) {
        if (typeof val === "string") {
          return {
            overallRating: "Good",
            issues: [],
            goodPractices: [val],
            recommendations: [],
          };
        }
        return val;
      },
    },
    
    // === Professional Readiness ===
    professionalReadiness: {
      type: professionalReadinessSchema,
      default: () => ({}),
      set: function (val) {
        if (typeof val === "string") {
          return {
            overallScore: 80,
            productionReady: true,
            teamCollaboration: val,
            projectComplexity: "Intermediate",
            businessValue: "Practical software solution.",
            scalability: "Modular and scalable.",
          };
        }
        return val;
      },
    },
    
    // === Resume & Interview Value ===
    resumeImpact: {
      type: resumeImpactSchema,
      default: () => ({}),
      set: function (val) {
        if (Array.isArray(val)) {
          return {
            bullets: val.map(String),
            interviewTalkingPoints: [],
            uniqueSellingPoints: [],
            improvementSuggestions: [],
          };
        }
        if (typeof val === "string") {
          return {
            bullets: [val],
            interviewTalkingPoints: [],
            uniqueSellingPoints: [],
            improvementSuggestions: [],
          };
        }
        return val;
      },
    },
    
    // === Recruiter Perspective ===
    recruiterView: {
      type: recruiterViewSchema,
      default: () => ({}),
      set: function (val) {
        if (typeof val === "string") {
          return {
            hiringPotential: "High",
            standoutFeatures: [val],
            redFlags: [],
            idealRoles: ["Software Developer"],
            experienceLevel: "Entry",
          };
        }
        return val;
      },
    },
    
    // === Comparison Benchmarks ===
    benchmarks: {
      type: benchmarksSchema,
      default: () => ({}),
      set: function (val) {
        if (typeof val === "string") {
          return {
            peerComparison: val,
            industryStandards: "Meets industry standards.",
            competitiveAdvantage: "Demonstrates practical development skills.",
          };
        }
        return val;
      },
    },
    
    // === Metadata ===
    filesAnalyzed: {
      type: [String],
      default: [],
    },
    repoStats: {
      stars: { type: Number, default: 0 },
      forks: { type: Number, default: 0 },
      language: { type: String },
      size: { type: Number }, // KB
      lastUpdated: { type: Date },
      hasReadme: { type: Boolean, default: false },
      hasTests: { type: Boolean, default: false },
      hasCI: { type: Boolean, default: false },
      hasDocumentation: { type: Boolean, default: false },
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

repoAnalysisSchema.pre("validate", function (next) {
  if (typeof this.quality === "string") {
    const qStr = this.quality;
    this.quality = {
      overallScore: 82,
      codeOrganization: qStr,
      readability: "Clean code structure with intuitive conventions.",
      bestPractices: "Follows language and framework standards.",
      documentation: "Standard documentation present.",
      testing: "Modular structure ready for testing.",
      strengths: [qStr],
      improvements: [],
    };
  }

  if (typeof this.security === "string") {
    const sStr = this.security;
    this.security = {
      overallRating: "Good",
      issues: [],
      goodPractices: [sStr],
      recommendations: [],
    };
  }

  if (Array.isArray(this.resumeImpact)) {
    this.resumeImpact = {
      bullets: this.resumeImpact.map(String),
      interviewTalkingPoints: [],
      uniqueSellingPoints: [],
      improvementSuggestions: [],
    };
  } else if (typeof this.resumeImpact === "string") {
    this.resumeImpact = {
      bullets: [this.resumeImpact],
      interviewTalkingPoints: [],
      uniqueSellingPoints: [],
      improvementSuggestions: [],
    };
  }

  if (typeof this.recruiterView === "string") {
    this.recruiterView = {
      hiringPotential: "High",
      standoutFeatures: [this.recruiterView],
      redFlags: [],
      idealRoles: ["Software Developer"],
      experienceLevel: "Entry",
    };
  }

  if (typeof this.professionalReadiness === "string") {
    this.professionalReadiness = {
      overallScore: 80,
      productionReady: true,
      teamCollaboration: this.professionalReadiness,
      projectComplexity: "Intermediate",
      businessValue: "Practical software solution.",
      scalability: "Modular and scalable.",
    };
  }

  if (typeof this.benchmarks === "string") {
    this.benchmarks = {
      peerComparison: this.benchmarks,
      industryStandards: "Meets industry standards.",
      competitiveAdvantage: "Demonstrates practical development skills.",
    };
  }

  next();
});

repoAnalysisSchema.index({ user: 1, createdAt: -1 });
repoAnalysisSchema.index({ "professionalReadiness.overallScore": -1 });
repoAnalysisSchema.index({ "quality.overallScore": -1 });

module.exports = mongoose.model("RepoAnalysis", repoAnalysisSchema);
