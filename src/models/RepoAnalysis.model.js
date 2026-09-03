const mongoose = require("mongoose");

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
      type: String, // e.g., "Full-Stack Web App", "API Service", "CLI Tool", "Library/Package"
      default: null,
    },
    primaryTechStack: {
      type: [String], // e.g., ["React", "Node.js", "MongoDB"]
      default: [],
    },
    
    // === Code Quality Analysis ===
    quality: {
      overallScore: { type: Number, min: 0, max: 100 }, // 0-100 score
      codeOrganization: { type: String }, // Detailed assessment
      readability: { type: String },
      bestPractices: { type: String },
      documentation: { type: String },
      testing: { type: String },
      strengths: { type: [String], default: [] },
      improvements: { type: [String], default: [] },
    },
    
    // === Technical Skills Demonstrated ===
    technicalSkills: {
      languages: { type: [String], default: [] }, // e.g., ["JavaScript", "TypeScript", "Python"]
      frameworks: { type: [String], default: [] }, // e.g., ["React", "Express", "Django"]
      tools: { type: [String], default: [] }, // e.g., ["Git", "Docker", "Jest"]
      patterns: { type: [String], default: [] }, // e.g., ["MVC", "REST API", "Microservices"]
      databases: { type: [String], default: [] }, // e.g., ["MongoDB", "PostgreSQL"]
      cloudServices: { type: [String], default: [] }, // e.g., ["AWS", "Vercel", "Firebase"]
    },
    
    // === Security Analysis ===
    security: {
      overallRating: { type: String, enum: ["Excellent", "Good", "Fair", "Needs Attention"] },
      issues: { type: [String], default: [] }, // Specific security concerns
      goodPractices: { type: [String], default: [] }, // Security measures implemented
      recommendations: { type: [String], default: [] },
    },
    
    // === Professional Readiness ===
    professionalReadiness: {
      overallScore: { type: Number, min: 0, max: 100 },
      productionReady: { type: Boolean, default: false },
      teamCollaboration: { type: String }, // Evidence of teamwork, PR practices, etc.
      projectComplexity: { type: String, enum: ["Beginner", "Intermediate", "Advanced", "Expert"] },
      businessValue: { type: String }, // Real-world applicability
      scalability: { type: String },
    },
    
    // === Resume & Interview Value ===
    resumeImpact: {
      bullets: { type: [String], default: [] }, // Resume bullet points
      interviewTalkingPoints: { type: [String], default: [] }, // What to highlight in interviews
      uniqueSellingPoints: { type: [String], default: [] }, // What makes this project stand out
      improvementSuggestions: { type: [String], default: [] }, // How to make it more impressive
    },
    
    // === Recruiter Perspective ===
    recruiterView: {
      hiringPotential: { type: String, enum: ["High", "Medium", "Low"] },
      standoutFeatures: { type: [String], default: [] },
      redFlags: { type: [String], default: [] },
      idealRoles: { type: [String], default: [] }, // Job titles this project qualifies for
      experienceLevel: { type: String, enum: ["Entry", "Mid", "Senior"] },
    },
    
    // === Comparison Benchmarks ===
    benchmarks: {
      peerComparison: { type: String }, // How it compares to similar projects
      industryStandards: { type: String }, // Meets industry standards?
      competitiveAdvantage: { type: String }, // What gives the candidate an edge
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

repoAnalysisSchema.index({ user: 1, createdAt: -1 });
repoAnalysisSchema.index({ "professionalReadiness.overallScore": -1 });
repoAnalysisSchema.index({ "quality.overallScore": -1 });

module.exports = mongoose.model("RepoAnalysis", repoAnalysisSchema);
