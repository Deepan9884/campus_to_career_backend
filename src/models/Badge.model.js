const mongoose = require("mongoose");

const VALID_BADGES = [
    "First Steps",
    "First Resume",
    "Resume Ready",
    "Score Above 80",
    "Interview Rookie",
    "Interview Warmup",
    "Interview Veteran",
    "Interview Pro",
    "5 Interviews",
    "STAR Communicator",
    "Skill Explorer",
    "Gap Closer",
    "Skill Collector",
    "Code Explorer",
    "Project Pro",
    "Roadmap Builder",
    "Strategist",
    "Placement Ready",
    "Quiz Streak",
    "High Scorer",
];

const badgeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        badgeId: {
            type: String,
            required: true,
        },
        earnedAt: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
    },
    { timestamps: false },
);

badgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });

module.exports = mongoose.model("Badge", badgeSchema);
module.exports.VALID_BADGES = VALID_BADGES;
