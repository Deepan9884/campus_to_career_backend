const mongoose = require("mongoose");

const VALID_BADGES = [
    "First Steps",
    "Resume Ready",
    "Interview Warmup",
    "Interview Pro",
    "Code Explorer",
    "Gap Closer",
    "Roadmap Builder",
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
            enum: VALID_BADGES,
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
