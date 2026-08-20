const mongoose = require("mongoose");

const ITEM_TYPES = ["mcq", "open_ended", "coding"];
const ROUND_TYPES = ["quiz", "aptitude", "core", "technical", "coding", "hr"];
const GRADING_METHODS = ["auto", "gemini"];

const testCaseSchema = new mongoose.Schema(
    {
        input: { type: String, default: "" },
        expectedOutput: { type: String, default: "" },
        description: { type: String, default: "" },
    },
    { _id: false }
);

const itemSchema = new mongoose.Schema(
    {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", default: null },
        questionText: { type: String, required: true },
        itemType: { type: String, enum: ITEM_TYPES, required: true },
        options: { type: [String], default: undefined }, // mcq only
        correctOptionIndex: { type: Number, default: null }, // mcq only
        idealAnswerPoints: { type: [String], default: undefined }, // open_ended ideal answer points
        testCases: { type: [testCaseSchema], default: undefined }, // coding only
        starterCode: { type: String, default: undefined }, // coding only
        selectedOptionIndex: { type: Number, default: null }, // mcq answer
        answer: { type: String, default: null }, // open_ended / coding answer
        isCorrect: { type: Boolean, default: null }, // mcq auto-grade result
        score: { type: Number, min: 0, max: 100, default: null }, // gemini-graded item score
        feedback: { type: String, default: null },
        projectContext: { type: String, default: null }, // project/experience reference from resume
        answeredAt: { type: Date, default: null },
    },
    { _id: false },
);

const roundSchema = new mongoose.Schema(
    {
        roundType: { type: String, enum: ROUND_TYPES, required: true },
        status: {
            type: String,
            enum: ["pending", "in-progress", "completed", "skipped", "failed"],
            default: "pending",
        },
        gradingMethod: { type: String, enum: GRADING_METHODS, required: true },
        items: { type: [itemSchema], default: [] },
        roundScore: { type: Number, min: 0, max: 100, default: null },
        strengths: { type: [String], default: null }, // gemini rounds only
        improvements: { type: [String], default: null }, // gemini rounds only
        summary: { type: String, default: null }, // gemini rounds only
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        errorMessage: { type: String, default: null },
    },
    { _id: false },
);

const interviewSessionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        targetRole: { type: String, default: null },
        resume: { type: mongoose.Schema.Types.ObjectId, ref: "Resume", default: null },
        resumeFilename: { type: String, default: null },
        status: { type: String, enum: ["in-progress", "completed", "failed"], default: "in-progress" },
        currentRoundIndex: { type: Number, default: 0 },
        rounds: { type: [roundSchema], default: [] },
        overallScore: { type: Number, min: 0, max: 100, default: null },
        skillDimensionScores: {
            technicalKnowledge: { type: Number, min: 0, max: 100, default: null },
            problemSolving: { type: Number, min: 0, max: 100, default: null },
            handsOnTechnical: { type: Number, min: 0, max: 100, default: null },
            communication: { type: Number, min: 0, max: 100, default: null },
        },
        startedAt: { type: Date, required: true },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

interviewSessionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("InterviewSession", interviewSessionSchema);
module.exports.ROUND_TYPES = ROUND_TYPES;
module.exports.ITEM_TYPES = ITEM_TYPES;
module.exports.GRADING_METHODS = GRADING_METHODS;
