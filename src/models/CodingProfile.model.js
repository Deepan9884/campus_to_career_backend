const mongoose = require("mongoose");

const platformEnum = ["leetcode", "codechef", "hackerrank", "gfg"];

const codingProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        platform: {
            type: String,
            required: true,
            enum: platformEnum,
            index: true,
        },
        profileUrl: {
            type: String,
            required: true,
            trim: true,
        },
        username: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        cachedStats: {
            // Mixed stats payload returned by platform fetchers
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        lastFetchedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true },
);

codingProfileSchema.index({ userId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model("CodingProfile", codingProfileSchema);

