const CodingProfile = require("../models/CodingProfile.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const problemBank = require("../utils/problemBank");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const { fetchLeetCodeStats } = require("../services/coding/leetcode.service");
const { fetchCodeChefStats } = require("../services/coding/codechef.service");
const { fetchHackerRankStats } = require("../services/coding/hackerrank.service");
const { fetchGfgStats } = require("../services/coding/gfg.service");

const PLATFORM_TO_FETCHER = {
    leetcode: fetchLeetCodeStats,
    codechef: fetchCodeChefStats,
    hackerrank: fetchHackerRankStats,
    gfg: fetchGfgStats,
};

function parseUsernameFromUrl(platform, profileUrl) {
    const url = String(profileUrl || "").trim();

    try {
        const u = new URL(url);
        const path = u.pathname.replace(/\/+$/, "");

        if (platform === "leetcode") {
            const segs = path.split("/").filter(Boolean);
            if (segs[0] === "u" && segs[1]) return segs[1];
            if (segs[0]) return segs[0];
            throw new Error("Cannot parse leetcode username");
        }

        if (platform === "codechef") {
            // /users/<username>
            const parts = path.split("/".replace(/\/+$/, "").replace(/^\//, ""));
            // safer generic:
            const segs = path.split("/").filter(Boolean);
            const idx = segs.indexOf("users");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            // fallback: first segment
            if (segs[0]) return segs[0];
            throw new Error("Cannot parse codechef username");
        }

        if (platform === "hackerrank") {
            // /profile/<username>
            const segs = path.split("/").filter(Boolean);
            const idx = segs.indexOf("profile");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            if (segs[0]) return segs[0];
            throw new Error("Cannot parse hackerrank username");
        }

        if (platform === "gfg") {
            // /user/<username>
            const segs = path.split("/").filter(Boolean);
            const idx = segs.indexOf("user");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            if (segs[0]) return segs[0];
            throw new Error("Cannot parse gfg username");
        }

        throw new Error("Unsupported platform");
    } catch {
        // If URL parsing fails, do a very simple fallback
        const seg = url.split("/").filter(Boolean).slice(-1)[0];
        if (!seg) throw new Error("Invalid profile URL");
        return seg;
    }
}

const TTL_MS = 24 * 60 * 60 * 1000;

async function getOrFetch(platform, userId, profileUrl, username, forceRefresh) {
    const existing = await CodingProfile.findOne({ userId, platform });

    const now = Date.now();
    const last = existing?.lastFetchedAt ? new Date(existing.lastFetchedAt).getTime() : null;
    const withinTtl = last !== null && now - last < TTL_MS;

    if (existing && existing.cachedStats && !forceRefresh && withinTtl) {
        return { profile: existing, fresh: false };
    }

    const fetcher = PLATFORM_TO_FETCHER[platform];
    if (!fetcher) throw ApiError.badRequest("Unsupported platform");

    // Isolated try/catch happens at higher layer per requirement.
    const stats = await fetcher(username);

    const updated = await CodingProfile.findOneAndUpdate(
        { userId, platform },
        {
            $set: {
                profileUrl,
                username,
                cachedStats: stats,
                lastFetchedAt: new Date(),
            },
        },
        { upsert: true, new: true, runValidators: true },
    );

    return { profile: updated, fresh: true };
}

const upsertProfile = async (req, res) => {
    const { platform, profileUrl } = req.body;
    if (!platform || !profileUrl) throw ApiError.badRequest("platform and profileUrl are required");

    const username = parseUsernameFromUrl(platform, profileUrl);

    const existing = await CodingProfile.findOne({ userId: req.user._id, platform });
    const doc = await CodingProfile.findOneAndUpdate(
        { userId: req.user._id, platform },
        {
            $set: { profileUrl, username },
            $setOnInsert: { cachedStats: null, lastFetchedAt: null },
        },
        { upsert: true, new: true, runValidators: true },
    );

    return ApiResponse.success({
        profile: doc,
        cached: Boolean(existing?.cachedStats),
    }).send(res);
};

const refreshProfile = async (req, res) => {
    const { platform } = req.params;
    const codingPlatform = platform;
    const bodyProfileUrl = req.body?.profileUrl;

    const existing = await CodingProfile.findOne({ userId: req.user._id, platform: codingPlatform });
    if (!existing) throw ApiError.notFound("Coding profile not found");

    const profileUrl = bodyProfileUrl || existing.profileUrl;
    const username = parseUsernameFromUrl(codingPlatform, profileUrl);

    // Isolated platform failure: only this request
    try {
        const { profile, fresh } = await getOrFetch(
            codingPlatform,
            req.user._id,
            profileUrl,
            username,
            true,
        );

        return ApiResponse.success({ profile, fresh }).send(res);
    } catch (err) {
        // still return cached if exists
        return ApiResponse.success({
            profile: {
                ...existing.toObject(),
            },
            fresh: false,
            error: err instanceof Error ? err.message : "Refresh failed",
            cached: Boolean(existing.cachedStats),
        }).send(res);
    }
};

const getProfile = async (req, res) => {
    const { platform } = req.params;
    const force = req.query?.force === "true";

    const existing = await CodingProfile.findOne({ userId: req.user._id, platform });
    if (!existing) throw ApiError.notFound("Coding profile not found");

    try {
        const username = existing.username;
        const { profile } = await getOrFetch(
            platform,
            req.user._id,
            existing.profileUrl,
            username,
            Boolean(force),
        );

        return ApiResponse.success({ profile }).send(res);
    } catch (err) {
        // If fetch failed, return cached if present
        return ApiResponse.success({
            profile: existing,
            fresh: false,
            error: err instanceof Error ? err.message : "Fetch failed",
            cached: Boolean(existing.cachedStats),
        }).send(res);
    }
};

const getRecommendations = async (req, res) => {
    const { platform } = req.params;

    // Default to some medium/easy problems if no data available
    let recommended = problemBank.slice(0, 5);

    try {
        const [profile, gapAnalysis] = await Promise.all([
            CodingProfile.findOne({ userId: req.user._id, platform }),
            SkillGapAnalysis.findOne({ user: req.user._id }).sort({ createdAt: -1 })
        ]);

        let targetDifficulty = "Easy";
        if (profile?.cachedStats?.byDifficulty) {
            const easy = profile.cachedStats.byDifficulty.Easy || 0;
            const medium = profile.cachedStats.byDifficulty.Medium || 0;
            const hard = profile.cachedStats.byDifficulty.Hard || 0;
            
            if (easy > 30 && medium < 20) targetDifficulty = "Medium";
            else if (medium > 40) targetDifficulty = "Hard";
            else if (easy > 10) targetDifficulty = "Medium";
        }

        let targetTopics = [];
        if (gapAnalysis && gapAnalysis.gaps && gapAnalysis.gaps.length > 0) {
            // Pick topics from gaps
            targetTopics = gapAnalysis.gaps.map(g => g.skillName.toLowerCase());
        }

        // Score problems
        const scored = problemBank.map(problem => {
            let score = 0;
            
            // Topic match
            if (targetTopics.some(t => t.includes(problem.topic.toLowerCase()) || problem.topic.toLowerCase().includes(t))) {
                score += 10;
            }
            
            // Difficulty match
            if (problem.difficulty === targetDifficulty) {
                score += 5;
            }
            
            return { ...problem, score };
        });

        // Sort by score desc, fallback to random to keep it fresh
        scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);
        
        recommended = scored.slice(0, 5).map(({ score, ...rest }) => rest);
    } catch (err) {
        console.error("Failed to generate coding recommendations:", err);
    }

    return ApiResponse.success({ recommendations: recommended }).send(res);
};

const getAllProfiles = async (req, res) => {
    const profiles = await CodingProfile.find({ userId: req.user._id }).lean();
    return ApiResponse.success(profiles).send(res);
};

module.exports = {
    upsertProfile,
    refreshProfile,
    getProfile,
    getRecommendations,
    getAllProfiles,
};

