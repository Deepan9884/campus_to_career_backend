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
    let url = String(profileUrl || "").trim();
    if (!url) throw new Error("Profile URL is required");

    // Remove query params, hash fragments, and trailing slashes
    url = url.split("?")[0].split("#")[0].replace(/\/+$/, "");

    // If bare username without slashes or domain dots
    if (!url.includes("/") && !url.includes(".")) {
        return url;
    }

    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        const segs = u.pathname.split("/").filter(Boolean);

        if (platform === "leetcode") {
            const idx = segs.findIndex((s) => s === "u" || s === "profile");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            return segs[segs.length - 1];
        }

        if (platform === "codechef") {
            // /users/<username> or /profile/<username>
            const idx = segs.findIndex((s) => s === "users" || s === "user" || s === "profile");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            return segs[segs.length - 1];
        }

        if (platform === "hackerrank") {
            // /profile/<username> or /<username>
            const idx = segs.findIndex((s) => s === "profile" || s === "users" || s === "user");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            return segs[segs.length - 1];
        }

        if (platform === "gfg") {
            // /user/<username> or /profile/<username> or /practice
            const idx = segs.findIndex((s) => s === "user" || s === "profile");
            if (idx >= 0 && segs[idx + 1]) return segs[idx + 1];
            const filtered = segs.filter(
                (s) => !["user", "profile", "practice", "batch", "courses", "contest"].includes(s.toLowerCase())
            );
            if (filtered.length > 0) return filtered[filtered.length - 1];
            return segs[segs.length - 1];
        }

        return segs[segs.length - 1];
    } catch {
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

    try {
        const { profile, fresh } = await getOrFetch(
            platform,
            req.user._id,
            profileUrl,
            username,
            true,
        );

        return ApiResponse.success({
            profile,
            fresh,
            cached: false,
        }).send(res);
    } catch (err) {
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
            cached: false,
            error: err instanceof Error ? err.message : "Fetch failed",
        }).send(res);
    }
};

const refreshProfile = async (req, res) => {
    const { platform } = req.params;
    const codingPlatform = platform;
    const bodyProfileUrl = req.body?.profileUrl;

    let existing = await CodingProfile.findOne({ userId: req.user._id, platform: codingPlatform });
    if (!existing && !bodyProfileUrl) {
        throw ApiError.notFound("Coding profile not found");
    }

    const profileUrl = bodyProfileUrl || existing?.profileUrl;
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

    // Default fallback — first 10 problems
    let recommended = problemBank.slice(0, 10);

    try {
        const InterviewSession = require("../models/InterviewSession.model");
        const QuizAttempt = require("../models/QuizAttempt.model");
        const UserSkill = require("../models/UserSkill.model");
        const Resume = require("../models/Resume.model");

        // ── Fetch ALL available performance signals in parallel ──
        const [
            allProfiles,
            gapAnalysis,
            recentInterviews,
            quizAttempts,
            userSkills,
            latestResume,
        ] = await Promise.all([
            CodingProfile.find({ userId: req.user._id }).lean(),
            SkillGapAnalysis.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean(),
            InterviewSession.find({ user: req.user._id, status: "completed" })
                .sort({ createdAt: -1 }).limit(5).lean(),
            QuizAttempt.find({ userId: req.user._id })
                .sort({ createdAt: -1 }).limit(20).lean(),
            UserSkill.find({ user: req.user._id }).lean(),
            Resume.findOne({ user: req.user._id, status: "completed" })
                .sort({ createdAt: -1 }).lean(),
        ]);

        // ── 1. Aggregate difficulty stats across ALL platforms ──
        let totalEasy = 0, totalMedium = 0, totalHard = 0, totalSolved = 0;
        for (const p of allProfiles) {
            if (p.cachedStats?.byDifficulty) {
                totalEasy += p.cachedStats.byDifficulty.Easy || 0;
                totalMedium += p.cachedStats.byDifficulty.Medium || 0;
                totalHard += p.cachedStats.byDifficulty.Hard || 0;
            }
            totalSolved += p.cachedStats?.solved || 0;
        }

        // Dynamic difficulty ladder based on aggregate performance
        let targetDifficulty = "Easy";
        let secondaryDifficulty = "Medium";
        if (totalSolved >= 200 || (totalMedium >= 50 && totalHard >= 10)) {
            targetDifficulty = "Hard";
            secondaryDifficulty = "Medium";
        } else if (totalSolved >= 50 || totalEasy >= 30) {
            targetDifficulty = "Medium";
            secondaryDifficulty = totalMedium >= 30 ? "Hard" : "Easy";
        }

        // ── 2. Collect weak topics from skill gap analysis ──
        const weakTopics = new Map(); // topic -> weight (higher = more important)
        if (gapAnalysis?.gaps?.length) {
            for (const gap of gapAnalysis.gaps) {
                const name = gap.skillName.toLowerCase();
                const weight = gap.importance === "core" ? 20 : 12;
                const gapMult = 1 + (gap.gapPercent || 50) / 100; // higher gap = more weight
                weakTopics.set(name, (weakTopics.get(name) || 0) + weight * gapMult);
            }
        }

        // ── 3. Extract weak areas from interview performance ──
        if (recentInterviews.length > 0) {
            const roundTypeToTopics = {
                quiz: ["arrays", "hashing", "strings", "math", "bit manipulation"],
                aptitude: ["math", "sorting", "greedy"],
                core: ["dynamic programming", "graphs", "trees", "linked list"],
                technical: ["stack", "binary search", "two pointers", "sliding window", "backtracking"],
            };

            for (const session of recentInterviews) {
                for (const round of session.rounds || []) {
                    if (round.status !== "completed") continue;
                    const roundScore = round.roundScore ?? 100;
                    // Weak round (score < 60) → boost those topic areas
                    if (roundScore < 60) {
                        const topics = roundTypeToTopics[round.roundType] || [];
                        for (const t of topics) {
                            const boost = Math.max(5, Math.round((60 - roundScore) / 5));
                            weakTopics.set(t, (weakTopics.get(t) || 0) + boost);
                        }
                    }
                }
            }

            // Check overall dimension scores — if problemSolving is low, boost algorithmic topics
            const latestSession = recentInterviews[0];
            const dims = latestSession.skillDimensionScores;
            if (dims?.problemSolving != null && dims.problemSolving < 60) {
                for (const t of ["dynamic programming", "greedy", "backtracking", "divide and conquer", "recursion"]) {
                    weakTopics.set(t, (weakTopics.get(t) || 0) + 10);
                }
            }
            if (dims?.technicalKnowledge != null && dims.technicalKnowledge < 60) {
                for (const t of ["trees", "graphs", "heap", "segment trees", "tries", "union-find"]) {
                    weakTopics.set(t, (weakTopics.get(t) || 0) + 8);
                }
            }
        }

        // ── 4. Learn from quiz attempt history ──
        if (quizAttempts.length > 0) {
            for (const attempt of quizAttempts) {
                const skillName = (attempt.skillName || "").toLowerCase();
                if (!attempt.passed || (attempt.score != null && attempt.score < 60)) {
                    weakTopics.set(skillName, (weakTopics.get(skillName) || 0) + 8);
                }
            }
        }

        // ── 5. Factor in user's self-reported skill levels ──
        const strongTopics = new Set();
        if (userSkills.length > 0) {
            for (const skill of userSkills) {
                const name = skill.name.toLowerCase();
                if (skill.level === "beginner") {
                    weakTopics.set(name, (weakTopics.get(name) || 0) + 6);
                } else if (skill.level === "expert" || skill.level === "advanced") {
                    strongTopics.add(name);
                }
            }
        }

        // ── 6. Resume keyword gaps ──
        if (latestResume?.keywordBreakdown?.missing?.length) {
            for (const keyword of latestResume.keywordBreakdown.missing) {
                const kw = keyword.toLowerCase();
                weakTopics.set(kw, (weakTopics.get(kw) || 0) + 5);
            }
        }

        // ── Score every problem ──
        const scored = problemBank.map(problem => {
            let score = 0;
            const topicLower = problem.topic.toLowerCase();

            // Weak topic match — use accumulated weight
            for (const [weakTopic, weight] of weakTopics) {
                if (topicLower.includes(weakTopic) || weakTopic.includes(topicLower)) {
                    score += weight;
                    break; // one match is enough
                }
            }

            // Penalize topics the user is already strong in
            for (const strong of strongTopics) {
                if (topicLower.includes(strong) || strong.includes(topicLower)) {
                    score -= 8;
                    break;
                }
            }

            // Difficulty match
            if (problem.difficulty === targetDifficulty) {
                score += 6;
            } else if (problem.difficulty === secondaryDifficulty) {
                score += 3;
            }

            // Platform preference: boost problems from the user's active platform tab
            if (problem.platform === platform) {
                score += 7;
            }

            // Intentional ±3pt randomness: ensures varied problem sets across page refreshes
            // for users with identical performance signals. Prevents stale-feeling recommendations.
            score += Math.random() * 3;

            return { ...problem, score };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // ── Diversity-aware selection ──
        const picked = [];
        const topicCount = {};
        const TARGET_COUNT = 10;

        for (const p of scored) {
            if (picked.length >= TARGET_COUNT) break;
            const tc = topicCount[p.topic] || 0;
            if (tc >= 2) continue; // max 2 per topic
            topicCount[p.topic] = tc + 1;
            picked.push(p);
        }

        // Fill remaining if needed
        if (picked.length < TARGET_COUNT) {
            const pickedUrls = new Set(picked.map(p => p.url));
            for (const p of scored) {
                if (picked.length >= TARGET_COUNT) break;
                if (!pickedUrls.has(p.url)) {
                    picked.push(p);
                    pickedUrls.add(p.url);
                }
            }
        }

        recommended = picked.map(({ score, ...rest }) => rest);
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

