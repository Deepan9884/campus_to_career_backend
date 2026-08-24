const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const Event = require("../models/Event.model");
const UserSkill = require("../models/UserSkill.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const activityLogService = require("../services/activityLog.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const aiService = require("../services/ai.service");
const { validateFileMagicBytes } = require("../utils/fileValidation");
const { sanitizePromptInput } = require("../utils/promptSanitizer");

/**
 * Validates magic bytes of an in-memory buffer against allowed certificate extensions.
 * @param {Buffer} buffer
 * @param {string[]} allowedExtensions
 * @returns {boolean}
 */
function validateBufferMagicBytes(buffer, allowedExtensions = []) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff; // ÿØÿ
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47; // ‰PNG
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  const exts = allowedExtensions.map((e) => e.toLowerCase());
  if (isPdf && exts.includes(".pdf")) return true;
  if (isJpeg && (exts.includes(".jpg") || exts.includes(".jpeg"))) return true;
  if (isPng && exts.includes(".png")) return true;
  if (isWebp && exts.includes(".webp")) return true;

  if (allowedExtensions.length === 0) {
    return isPdf || isJpeg || isPng || isWebp;
  }
  return false;
}

/**
 * Upload an in-memory certificate file buffer to MongoDB GridFS.
 * @param {Express.Multer.File} file
 * @returns {Promise<string>} Uploaded GridFS file ObjectId string
 */
function uploadCertificateToGridFS(file) {
  return new Promise((resolve, reject) => {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "certificates",
    });
    const safeName = file.originalname.replace(/[\0\r\n]/g, "");
    const uploadStream = bucket.openUploadStream(safeName, {
      contentType: file.mimetype || "application/octet-stream",
    });

    uploadStream.on("finish", () => {
      resolve(uploadStream.id.toString());
    });

    uploadStream.on("error", (err) => {
      reject(err);
    });

    uploadStream.end(file.buffer);
  });
}

/**
 * Task 2 — techStack → UserSkill auto-upsert (silent)
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {string[]} techStack
 */
async function upsertSkillsFromTechStack(userId, techStack) {
  if (!Array.isArray(techStack) || techStack.length === 0) return;

  // Normalize tags: trim and filter non-empty
  const normalizedTags = techStack
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);

  if (normalizedTags.length === 0) return;

  // Deduplicate within payload case-insensitively while preserving original trim/casing
  const uniqueTagsMap = new Map();
  for (const tag of normalizedTags) {
    const lower = tag.toLowerCase();
    if (!uniqueTagsMap.has(lower)) {
      uniqueTagsMap.set(lower, tag);
    }
  }

  // Fetch existing skills for the user once
  const existingSkills = await UserSkill.find({ user: userId }).select("name").lean();
  const existingLowerSet = new Set(existingSkills.map((s) => s.name.toLowerCase()));

  for (const [lowerTag, originalTag] of uniqueTagsMap.entries()) {
    if (!existingLowerSet.has(lowerTag)) {
      await UserSkill.create({
        user: userId,
        name: originalTag,
        level: "intermediate", // ASSUMPTION: Event-derived skills default to 'intermediate'
        source: "event",
      });
      existingLowerSet.add(lowerTag);
    }
  }
}

// Helper to parse arrays that might be sent as JSON strings or arrays via multipart/form-data
function parseArrayField(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.map((item) => (typeof item === "string" ? item.trim() : item)).filter(Boolean);
  }
  if (typeof field === "string") {
    try {
      const parsed = JSON.parse(field);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item.trim() : item)).filter(Boolean);
      }
    } catch {
      // If comma separated string
      return field.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseObjectField(field) {
  if (!field) return null;
  if (typeof field === "object") return field;
  if (typeof field === "string") {
    try {
      return JSON.parse(field);
    } catch {
      return null;
    }
  }
  return null;
}

function parseReflection(field) {
  const obj = parseObjectField(field);
  if (!obj) return null;
  return {
    whatDidYouBuild: obj.whatDidYouBuild || null,
    whatDidYouLearn: obj.whatDidYouLearn || null,
    challengesFaced: obj.challengesFaced || null,
    whatWouldYouDoDifferently: obj.whatWouldYouDoDifferently || null,
    keyTakeaways: Array.isArray(obj.keyTakeaways) ? obj.keyTakeaways : [],
    skillsImproved: Array.isArray(obj.skillsImproved) ? obj.skillsImproved : [],
    rating: typeof obj.rating === "number" ? obj.rating : null,
    wouldRecommend: typeof obj.wouldRecommend === "boolean" ? obj.wouldRecommend : null,
  };
}

function parsePortfolio(field) {
  const obj = parseObjectField(field);
  if (!obj) return null;
  return {
    isPublic: typeof obj.isPublic === "boolean" ? obj.isPublic : false,
    showcaseOrder: typeof obj.showcaseOrder === "number" ? obj.showcaseOrder : 0,
    customThumbnail: obj.customThumbnail || null,
    featured: typeof obj.featured === "boolean" ? obj.featured : false,
    tags: Array.isArray(obj.tags) ? obj.tags : [],
  };
}

function parseSkillImpact(field) {
  const obj = parseObjectField(field);
  if (!obj) return null;
  return {
    techStackSkills: Array.isArray(obj.techStackSkills) ? obj.techStackSkills : [],
    newSkillsLearned: Array.isArray(obj.newSkillsLearned) ? obj.newSkillsLearned : [],
    gapAnalysisTriggered: typeof obj.gapAnalysisTriggered === "boolean" ? obj.gapAnalysisTriggered : false,
    skillGapAnalysisId: obj.skillGapAnalysisId || null,
  };
}

/**
 * POST /api/events
 */
const createEvent = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("Certificate proof file is required");
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!validateBufferMagicBytes(req.file.buffer, [".pdf", ".jpg", ".jpeg", ".png", ".webp"])) {
    throw ApiError.badRequest("Invalid file format. The file content does not match a valid PDF, JPG, PNG, or WEBP document.");
  }

  const {
    eventName,
    eventType,
    organizer,
    mode,
    level,
    startDate,
    endDate,
    teamName,
    teamSize,
    role,
    teamMembers,
    projectTitle,
    problemStatement,
    techStack,
    description,
    result,
    prize,
    projectLink,
    socialPostLink,
    reflection,
    portfolio,
    skillImpact,
  } = req.body;

  if (new Date(startDate) > new Date(endDate)) {
    throw ApiError.badRequest("Start date cannot be after end date");
  }

  const parsedTechStack = parseArrayField(techStack);
  const parsedTeamMembers = parseArrayField(teamMembers);
  const parsedReflection = parseReflection(reflection);
  const parsedPortfolio = parsePortfolio(portfolio);
  const parsedSkillImpact = parseSkillImpact(skillImpact);

  const certificateUrl = await uploadCertificateToGridFS(req.file);

  const event = await Event.create({
    user: req.user._id,
    eventName,
    eventType,
    organizer,
    mode,
    level,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    teamName,
    teamSize: teamSize ? Number(teamSize) : 1,
    role,
    teamMembers: parsedTeamMembers,
    projectTitle,
    problemStatement,
    techStack: parsedTechStack,
    description,
    result,
    prize,
    certificateUrl,
    projectLink,
    socialPostLink,
    reflection: parsedReflection,
    portfolio: parsedPortfolio,
    skillImpact: parsedSkillImpact,
  });

  // Task 2: Auto-upsert techStack into UserSkill (non-fatal)
  try {
    await upsertSkillsFromTechStack(req.user._id, parsedTechStack);
  } catch (err) {
    console.error("[events] upsertSkillsFromTechStack failed (non-fatal):", err.message);
  }

  // Calculate and set gamification points
  const points = event.calculatePoints();
  event.gamification.pointsEarned = points;
  await event.save();

  // Activity Log choke-point
  await activityLogService.logActivity({
    userId: req.user._id,
    module: "events",
    action: "event_logged",
    summary: `Logged ${event.eventType}: ${event.eventName}`,
    relatedResourceId: event._id,
    relatedResourceType: "Event",
    metadata: { eventType: event.eventType, result: event.result, points },
  });

  return ApiResponse.created(event, "Event logged successfully").send(res);
});

/**
 * GET /api/events
 */
const getUserEvents = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    Event.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Event.countDocuments({ user: req.user._id }),
  ]);

  return ApiResponse.success({
    events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }).send(res);
});

/**
 * GET /api/events/:id
 */
const getEventById = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event || event.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Event not found");
  }

  // Increment view count if portfolio is public
  if (event.portfolio?.isPublic) {
    event.portfolio.viewCount = (event.portfolio.viewCount || 0) + 1;
    await event.save();
  }

  return ApiResponse.success(event).send(res);
});

/**
 * PATCH /api/events/:id
 */
const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event || event.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Event not found");
  }

  const {
    eventName,
    eventType,
    organizer,
    mode,
    level,
    startDate,
    endDate,
    teamName,
    teamSize,
    role,
    teamMembers,
    projectTitle,
    problemStatement,
    techStack,
    description,
    result,
    prize,
    projectLink,
    socialPostLink,
    reflection,
    portfolio,
    skillImpact,
  } = req.body;

  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw ApiError.badRequest("Start date cannot be after end date");
  }

  // Handle new certificate upload
  if (req.file) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!validateBufferMagicBytes(req.file.buffer, [".pdf", ".jpg", ".jpeg", ".png", ".webp"])) {
      throw ApiError.badRequest("Invalid file format. The file content does not match a valid PDF, JPG, PNG, or WEBP document.");
    }

    const oldCert = event.certificateUrl;
    const newCertId = await uploadCertificateToGridFS(req.file);
    event.certificateUrl = newCertId;

    if (oldCert && /^[0-9a-fA-F]{24}$/.test(oldCert)) {
      try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: "certificates",
        });
        await bucket.delete(new mongoose.Types.ObjectId(oldCert));
      } catch (delErr) {
        console.error("[events] Failed to delete old GridFS certificate:", delErr.message);
      }
    } else if (oldCert) {
      try {
        const fullOldPath = path.join(__dirname, "../../", oldCert);
        if (fs.existsSync(fullOldPath)) fs.unlink(fullOldPath, () => {});
      } catch {}
    }
  }

  if (eventName !== undefined) event.eventName = eventName;
  if (eventType !== undefined) event.eventType = eventType;
  if (organizer !== undefined) event.organizer = organizer;
  if (mode !== undefined) event.mode = mode;
  if (level !== undefined) event.level = level;
  if (startDate !== undefined) event.startDate = new Date(startDate);
  if (endDate !== undefined) event.endDate = new Date(endDate);
  if (teamName !== undefined) event.teamName = teamName;
  if (teamSize !== undefined) event.teamSize = Number(teamSize);
  if (role !== undefined) event.role = role;
  if (teamMembers !== undefined) event.teamMembers = parseArrayField(teamMembers);
  if (projectTitle !== undefined) event.projectTitle = projectTitle;
  if (problemStatement !== undefined) event.problemStatement = problemStatement;
  if (description !== undefined) event.description = description;
  if (result !== undefined) event.result = result;
  if (prize !== undefined) event.prize = prize;
  if (projectLink !== undefined) event.projectLink = projectLink;
  if (socialPostLink !== undefined) event.socialPostLink = socialPostLink;

  if (techStack !== undefined) {
    const parsedTechStack = parseArrayField(techStack);
    event.techStack = parsedTechStack;
    try {
      await upsertSkillsFromTechStack(req.user._id, parsedTechStack);
    } catch (err) {
      console.error("[events] upsertSkillsFromTechStack failed (non-fatal):", err.message);
    }
  }

  // Update reflection
  if (reflection !== undefined) {
    event.reflection = parseReflection(reflection);
  }

  // Update portfolio
  if (portfolio !== undefined) {
    event.portfolio = { ...event.portfolio, ...parsePortfolio(portfolio) };
  }

  // Update skill impact
  if (skillImpact !== undefined) {
    event.skillImpact = { ...event.skillImpact, ...parseSkillImpact(skillImpact) };
  }

  // Recalculate points
  event.gamification.pointsEarned = event.calculatePoints();

  await event.save();

  return ApiResponse.success(event, "Event updated successfully").send(res);
});

/**
 * DELETE /api/events/:id
 */
const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event || event.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Event not found");
  }

  // Delete certificate file from GridFS or disk if present
  if (event.certificateUrl) {
    if (/^[0-9a-fA-F]{24}$/.test(event.certificateUrl)) {
      try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: "certificates",
        });
        await bucket.delete(new mongoose.Types.ObjectId(event.certificateUrl));
      } catch (delErr) {
        console.error("[events] Failed to delete GridFS certificate on event delete:", delErr.message);
      }
    } else {
      try {
        const fullPath = path.join(__dirname, "../../", event.certificateUrl);
        if (fs.existsSync(fullPath)) fs.unlink(fullPath, () => {});
      } catch {}
    }
  }

  await Event.findByIdAndDelete(req.params.id);

  return ApiResponse.success(null, "Event deleted successfully").send(res);
});

/**
 * GET /api/events/stats
 */
const getEventStats = asyncHandler(async (req, res) => {
  const events = await Event.find({ user: req.user._id }).lean();

  const stats = {
    totalEvents: events.length,
    byType: {},
    byResult: {},
    byLevel: {},
    byMode: {},
    winRate: 0,
    uniqueTechStack: 0,
    totalTeamMembers: 0,
    currentStreak: 0,
    longestStreak: 0,
  };

  const techSet = new Set();
  const dates = events.map(e => new Date(e.startDate)).sort((a, b) => a - b);

  // Calculate streak
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate = null;

  for (const event of events) {
    const eventDate = new Date(event.startDate);
    eventDate.setHours(0, 0, 0, 0);

    if (lastDate) {
      const diffDays = Math.floor((eventDate - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    lastDate = eventDate;
  }

  // Current streak - check from most recent event
  if (dates.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mostRecent = new Date(dates[dates.length - 1]);
    mostRecent.setHours(0, 0, 0, 0);
    const daysSinceLastEvent = Math.floor((today - mostRecent) / (1000 * 60 * 60 * 24));

    if (daysSinceLastEvent <= 60) {
      // Count backwards
      for (let i = dates.length - 1; i >= 0; i--) {
        const d = new Date(dates[i]);
        d.setHours(0, 0, 0, 0);
        if (i === dates.length - 1 || Math.floor((new Date(dates[i + 1]) - d) / (1000 * 60 * 60 * 24)) <= 30) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  events.forEach((e) => {
    stats.byType[e.eventType] = (stats.byType[e.eventType] || 0) + 1;
    stats.byResult[e.result] = (stats.byResult[e.result] || 0) + 1;
    stats.byLevel[e.level] = (stats.byLevel[e.level] || 0) + 1;
    stats.byMode[e.mode] = (stats.byMode[e.mode] || 0) + 1;

    e.techStack.forEach((t) => techSet.add(t.toLowerCase()));
    stats.totalTeamMembers += e.teamSize - 1;
  });

  stats.uniqueTechStack = techSet.size;

  const wins = events.filter((e) => e.result === "winner" || e.result === "runner-up").length;
  stats.winRate = events.length > 0 ? Math.round((wins / events.length) * 100) : 0;

  stats.currentStreak = currentStreak;
  stats.longestStreak = longestStreak;

  return ApiResponse.success(stats).send(res);
});

/**
 * GET /api/events/analytics
 */
const getEventAnalytics = asyncHandler(async (req, res) => {
  const events = await Event.find({ user: req.user._id }).sort({ startDate: 1 }).lean();

  // Monthly activity
  const monthlyMap = new Map();
  events.forEach((e) => {
    const month = new Date(e.startDate).toISOString().slice(0, 7); // YYYY-MM
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1);
  });
  const monthlyActivity = Array.from(monthlyMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Tech stack distribution
  const techMap = new Map();
  events.forEach((e) => {
    e.techStack.forEach((t) => techMap.set(t.toLowerCase(), (techMap.get(t.toLowerCase()) || 0) + 1));
  });
  const techStackDistribution = Array.from(techMap.entries())
    .map(([tech, count]) => ({ tech, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Level progression
  const levelMap = new Map();
  events.forEach((e) => {
    levelMap.set(e.level, (levelMap.get(e.level) || 0) + 1);
  });
  const levelProgression = Array.from(levelMap.entries())
    .map(([level, count]) => ({ level, count }));

  // Result trend (monthly)
  const resultMap = new Map();
  events.forEach((e) => {
    const month = new Date(e.startDate).toISOString().slice(0, 7);
    const key = `${month}-${e.result}`;
    resultMap.set(key, (resultMap.get(key) || 0) + 1);
  });
  const resultTrend = Array.from(resultMap.entries())
    .map(([key, count]) => {
      const [month, result] = key.split("-");
      return { month, result, count };
    });

  // Team size distribution
  const teamSizeMap = new Map();
  events.forEach((e) => {
    const size = e.teamSize || 1;
    teamSizeMap.set(size, (teamSizeMap.get(size) || 0) + 1);
  });
  const teamSizeDistribution = Array.from(teamSizeMap.entries())
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => a.size - b.size);

  return ApiResponse.success({
    monthlyActivity,
    techStackDistribution,
    levelProgression,
    resultTrend,
    teamSizeDistribution,
  }).send(res);
});

function calculateBadges(events, stats) {
  return [
    {
      id: "first-event",
      name: "First Steps",
      description: "Log your first event",
      icon: "Award",
      earned: events.length >= 1,
      earnedAt: events.length >= 1 ? events[events.length - 1].createdAt : null,
    },
    {
      id: "hackathon-hunter",
      name: "Hackathon Hunter",
      description: "Participate in 5+ hackathons",
      icon: "Zap",
      earned: events.filter((e) => e.eventType === "hackathon").length >= 5,
      progress: Math.min(events.filter((e) => e.eventType === "hackathon").length * 20, 100),
      target: 5,
    },
    {
      id: "ideathon-innovator",
      name: "Ideathon Innovator",
      description: "Participate in 3+ ideathons",
      icon: "Lightbulb",
      earned: events.filter((e) => e.eventType === "ideathon").length >= 3,
      progress: Math.min(events.filter((e) => e.eventType === "ideathon").length * 33, 100),
      target: 3,
    },
    {
      id: "winners-circle",
      name: "Winner's Circle",
      description: "Win 3+ events (1st or 2nd place)",
      icon: "Trophy",
      earned: events.filter((e) => e.result === "winner" || e.result === "runner-up").length >= 3,
      progress: Math.min(events.filter((e) => e.result === "winner" || e.result === "runner-up").length * 33, 100),
      target: 3,
    },
    {
      id: "tech-polyglot",
      name: "Tech Polyglot",
      description: "Use 10+ unique technologies across events",
      icon: "Cpu",
      earned: (stats.uniqueTechStack || 0) >= 10,
      progress: Math.min((stats.uniqueTechStack || 0) * 10, 100),
      target: 10,
    },
    {
      id: "level-climber",
      name: "Level Climber",
      description: "Participate in events at all levels",
      icon: "TrendingUp",
      earned: new Set(events.map((e) => e.level)).size >= 5,
      progress: Math.min(new Set(events.map((e) => e.level)).size * 20, 100),
      target: 5,
    },
    {
      id: "team-player",
      name: "Team Player",
      description: "Collaborate with 10+ different team members",
      icon: "Users",
      earned: new Set(events.flatMap((e) => e.teamMembers || [])).size >= 10,
      progress: Math.min(new Set(events.flatMap((e) => e.teamMembers || [])).size * 10, 100),
      target: 10,
    },
    {
      id: "reflection-master",
      name: "Reflection Master",
      description: "Write reflections for 5+ events",
      icon: "BookOpen",
      earned: events.filter((e) => e.reflection?.whatDidYouLearn).length >= 5,
      progress: Math.min(events.filter((e) => e.reflection?.whatDidYouLearn).length * 20, 100),
      target: 5,
    },
    {
      id: "portfolio-showcase",
      name: "Portfolio Showcase",
      description: "Make 3+ events public in your portfolio",
      icon: "Globe",
      earned: events.filter((e) => e.portfolio?.isPublic).length >= 3,
      progress: Math.min(events.filter((e) => e.portfolio?.isPublic).length * 33, 100),
      target: 3,
    },
    {
      id: "streak-keeper",
      name: "Streak Keeper",
      description: "Maintain a 6+ month event streak",
      icon: "Flame",
      earned: (stats.currentStreak || 0) >= 6,
      progress: Math.min((stats.currentStreak || 0) * 16, 100),
      target: 6,
    },
    {
      id: "long-haul",
      name: "Long Haul",
      description: "Log 20+ events",
      icon: "Calendar",
      earned: events.length >= 20,
      progress: Math.min(events.length * 5, 100),
      target: 20,
    },
    {
      id: "skill-bridge",
      name: "Skill Bridge",
      description: "Trigger skill gap analysis from an event",
      icon: "Link",
      earned: events.filter((e) => e.skillImpact?.gapAnalysisTriggered).length >= 1,
      progress: events.filter((e) => e.skillImpact?.gapAnalysisTriggered).length >= 1 ? 100 : 0,
      target: 1,
    },
  ];
}

/**
 * GET /api/events/badges
 */
const getEventBadges = asyncHandler(async (req, res) => {
  const events = await Event.find({ user: req.user._id }).lean();
  const stats = await getEventStatsHelper(req.user._id);
  const badges = calculateBadges(events, stats);
  return ApiResponse.success(badges).send(res);
});

async function getEventStatsHelper(userId) {
  const events = await Event.find({ user: userId }).lean();
  const techSet = new Set();
  events.forEach((e) => e.techStack.forEach((t) => techSet.add(t.toLowerCase())));
  return { uniqueTechStack: techSet.size };
}

/**
 * GET /api/events/portfolio/:userId?
 */
const getEventPortfolio = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user._id;
  const isOwn = userId.toString() === req.user._id.toString();

  const query = { user: userId };
  if (!isOwn) {
    query["portfolio.isPublic"] = true;
  }

  const events = await Event.find(query)
    .sort({ "portfolio.showcaseOrder": 1, startDate: -1 })
    .lean();

  // Get stats
  const stats = await getEventStatsHelper(userId);
  const allEvents = await Event.find({ user: userId }).lean();

  const wins = allEvents.filter((e) => e.result === "winner" || e.result === "runner-up").length;
  const winRate = allEvents.length > 0 ? Math.round((wins / allEvents.length) * 100) : 0;

  const eventStats = {
    totalEvents: allEvents.length,
    winRate,
    uniqueTechStack: stats.uniqueTechStack,
    totalTeamMembers: allEvents.reduce((sum, e) => sum + (e.teamSize - 1), 0),
  };

  // Get badges safely without double sending HTTP response
  const badges = calculateBadges(allEvents, stats);

  return ApiResponse.success({
    user: {
      name: req.user.name,
      avatar: req.user.avatar,
      headline: req.user.headline,
    },
    events,
    stats: eventStats,
    badges,
  }).send(res);
});

/**
 * POST /api/events/generate-description
 * AI-powered description and reflection generator
 */
const generateEventDescription = asyncHandler(async (req, res) => {
  const { eventType, projectTitle, problemStatement, techStack, result } = req.body;

  const safeEventType = sanitizePromptInput(eventType || "Hackathon / Competition", 100);
  const safeProjectTitle = sanitizePromptInput(projectTitle || "Not specified", 150);
  const safeProblemStatement = sanitizePromptInput(problemStatement || "Not specified", 1000);
  const rawTech = Array.isArray(techStack) ? techStack.join(", ") : techStack || "Not specified";
  const safeTechStack = sanitizePromptInput(rawTech, 500);
  const safeResult = sanitizePromptInput(result || "Not specified", 100);

  const prompt = `You are helping a student create a professional event description and reflection for their portfolio.
Event Type: ${safeEventType}
Project Title: ${safeProjectTitle}
Problem Statement: ${safeProblemStatement}
Technologies Used: ${safeTechStack}
Result: ${safeResult}

Generate:
1. A compelling 3-4 sentence project description in STAR format (Situation, Task, Action, Result)
2. A reflection with:
   - whatILearned: 2-3 sentences about key technical learnings
   - whatIdDoDifferently: 2-3 sentences about improvements
   - keyTakeaways: 3-5 bullet points of main takeaways

Return ONLY a JSON object with keys: description, reflection { whatILearned, whatIdDoDifferently, keyTakeaways }`;

  try {
    const aiRes = await aiService.generateContent({
      prompt,
      feature: "event_description_generator",
      userId: req.user._id,
      responseSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          reflection: {
            type: "object",
            properties: {
              whatILearned: { type: "string" },
              whatIdDoDifferently: { type: "string" },
              keyTakeaways: { type: "array", items: { type: "string" } },
            },
          },
        },
        required: ["description", "reflection"],
      },
    });

    if (!aiRes.success || !aiRes.data) {
      throw new Error(aiRes.message || "AI generation failed");
    }

    const parsed = typeof aiRes.data === "object" ? aiRes.data : {};

    return ApiResponse.success({
      description: parsed.description || "",
      reflection: {
        whatILearned: parsed.reflection?.whatILearned || "",
        whatIdDoDifferently: parsed.reflection?.whatIdDoDifferently || "",
        keyTakeaways: Array.isArray(parsed.reflection?.keyTakeaways) ? parsed.reflection.keyTakeaways : [],
      },
    }).send(res);
  } catch (err) {
    console.error("[events] generateEventDescription failed, using fallback:", err.message);
    const fallbackTech = safeTechStack !== "Not specified" ? safeTechStack : "modern tech stack";
    return ApiResponse.success({
      description: `Participated in ${safeEventType} working on ${safeProjectTitle !== "Not specified" ? safeProjectTitle : "an innovative project"} utilizing ${fallbackTech}. Successfully developed a working solution for the problem statement.`,
      reflection: {
        whatILearned: `Gained practical hands-on experience building solutions under deadline constraints using ${fallbackTech}.`,
        whatIdDoDifferently: `Allocate more time upfront for system architecture design and edge-case testing.`,
        keyTakeaways: [
          `Effective team collaboration under strict time pressure`,
          `Practical application of ${fallbackTech}`,
          `Iterative problem solving and rapid prototyping`,
        ],
      },
    }).send(res);
  }
});

/**
 * GET /api/events/:id/certificate
 * Authenticated download/stream of an event certificate proof file.
 */
const getEventCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const event = await Event.findById(id).select("user certificateUrl eventName").lean();
  if (!event || !event.certificateUrl) {
    throw ApiError.notFound("Certificate not found for this event");
  }

  // Authorization check: User must own the event, or be an admin or mentor
  const isOwner = event.user.toString() === req.user._id.toString();
  const isAdminOrMentor = req.user.role === "admin" || req.user.role === "mentor";

  if (!isOwner && !isAdminOrMentor) {
    throw ApiError.forbidden("Access denied: You do not have permission to view this certificate");
  }

  // Branch 1: GridFS file (24-character hex ObjectId)
  if (/^[0-9a-fA-F]{24}$/.test(event.certificateUrl)) {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "certificates",
    });
    const fileObjectId = new mongoose.Types.ObjectId(event.certificateUrl);
    const files = await bucket.find({ _id: fileObjectId }).toArray();

    if (!files || files.length === 0) {
      throw ApiError.notFound("Certificate file not found on server");
    }

    const fileDoc = files[0];
    res.setHeader("Content-Type", fileDoc.contentType || "application/octet-stream");
    if (fileDoc.filename) {
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileDoc.filename)}"`);
    }

    const downloadStream = bucket.openDownloadStream(fileObjectId);
    downloadStream.on("error", (err) => {
      console.error("[events] GridFS certificate download stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Error streaming certificate file" });
      }
    });

    return downloadStream.pipe(res);
  }

  // Branch 2: Legacy disk-based fallback
  const baseUploadDir = path.resolve(__dirname, "../../uploads/certificates");
  const certFilename = path.basename(event.certificateUrl);
  const resolvedPath = path.join(baseUploadDir, certFilename);

  // Path traversal defense: verify resolvedPath starts with baseUploadDir
  if (!resolvedPath.startsWith(baseUploadDir)) {
    throw ApiError.badRequest("Invalid certificate path");
  }

  if (!fs.existsSync(resolvedPath)) {
    throw ApiError.notFound("Certificate file not found on server");
  }

  return res.sendFile(resolvedPath);
});

/**
 * POST /api/events/:id/predict-gaps
 * Predict skill gaps based on event tech stack
 */
const predictSkillGaps = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event || event.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Event not found");
  }

  // Get user's current skills
  const userSkills = await UserSkill.find({ user: req.user._id }).select("name level").lean();
  const skillMap = new Map(userSkills.map((s) => [s.name.toLowerCase(), s.level]));

  // Analyze event tech stack against user skills
  const predictedSkills = [];
  const confidenceScores = [];

  for (const tech of event.techStack) {
    const lowerTech = tech.toLowerCase();
    const userLevel = skillMap.get(lowerTech);

    if (!userLevel) {
      // User doesn't have this skill at all - high confidence gap
      predictedSkills.push(tech);
      confidenceScores.push(90);
    } else if (userLevel === "beginner" || userLevel === "intermediate") {
      // User has skill but at lower level - medium confidence
      predictedSkills.push(tech);
      confidenceScores.push(70);
    }
  }

  const avgConfidence = confidenceScores.length > 0
    ? Math.round(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length)
    : 0;

  // Mark event as having triggered gap analysis
  if (!event.skillImpact.gapAnalysisTriggered && predictedSkills.length > 0) {
    event.skillImpact.gapAnalysisTriggered = true;
    event.skillImpact.newSkillsLearned = [...new Set([...(event.skillImpact.newSkillsLearned || []), ...predictedSkills])];
    await event.save();
  }

  return ApiResponse.success({
    predictedSkills: [...new Set(predictedSkills)],
    confidence: avgConfidence,
  }).send(res);
});

module.exports = {
  createEvent,
  getUserEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getEventStats,
  getEventAnalytics,
  getEventBadges,
  getEventPortfolio,
  generateEventDescription,
  predictSkillGaps,
  getEventCertificate,
  upsertSkillsFromTechStack,
};