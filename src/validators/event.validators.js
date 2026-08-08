const { body } = require("express-validator");
const { EVENT_TYPES, MODES, LEVELS, RESULTS, SKILL_LEVELS } = require("../models/Event.model");

const createEventValidators = [
  body("eventName")
    .trim()
    .notEmpty()
    .withMessage("Event name is required")
    .isLength({ max: 150 })
    .withMessage("Event name must be at most 150 characters"),
  body("eventType")
    .notEmpty()
    .withMessage("Event type is required")
    .isIn(EVENT_TYPES)
    .withMessage(`Event type must be one of: ${EVENT_TYPES.join(", ")}`),
  body("mode")
    .notEmpty()
    .withMessage("Mode is required")
    .isIn(MODES)
    .withMessage(`Mode must be one of: ${MODES.join(", ")}`),
  body("level")
    .notEmpty()
    .withMessage("Level is required")
    .isIn(LEVELS)
    .withMessage(`Level must be one of: ${LEVELS.join(", ")}`),
  body("result")
    .notEmpty()
    .withMessage("Result is required")
    .isIn(RESULTS)
    .withMessage(`Result must be one of: ${RESULTS.join(", ")}`),
  body("startDate")
    .notEmpty()
    .withMessage("Start date is required")
    .isISO8601()
    .withMessage("Start date must be a valid date"),
  body("endDate")
    .notEmpty()
    .withMessage("End date is required")
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((value, { req }) => {
      if (req.body.startDate && new Date(value) < new Date(req.body.startDate)) {
        throw new Error("End date must be greater than or equal to start date");
      }
      return true;
    }),
  body("teamSize")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Team size must be a positive integer"),
  body("techStack")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) {
        throw new Error("techStack must be an array");
      }
      if (arr.length > 30) {
        throw new Error("techStack cannot have more than 30 entries");
      }
      for (const item of arr) {
        if (typeof item !== "string" || !item.trim()) {
          throw new Error("Each techStack entry must be a non-empty string");
        }
        if (item.trim().length > 60) {
          throw new Error(`techStack entry "${item.trim().slice(0, 20)}..." exceeds 60 characters`);
        }
      }
      return true;
    }),

  // Reflection validators
  body("reflection.whatDidYouBuild")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("What did you build must be at most 2000 characters"),
  body("reflection.whatDidYouLearn")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("What did you learn must be at most 2000 characters"),
  body("reflection.challengesFaced")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Challenges faced must be at most 2000 characters"),
  body("reflection.whatWouldYouDoDifferently")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("What would you do differently must be at most 2000 characters"),
  body("reflection.keyTakeaways")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("keyTakeaways must be an array");
      return true;
    }),
  body("reflection.skillsImproved")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("skillsImproved must be an array");
      return true;
    }),
  body("reflection.rating")
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("reflection.wouldRecommend")
    .optional()
    .isBoolean()
    .withMessage("Would recommend must be a boolean"),

  // Portfolio validators
  body("portfolio.isPublic")
    .optional()
    .isBoolean()
    .withMessage("isPublic must be a boolean"),
  body("portfolio.showcaseOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("showcaseOrder must be a non-negative integer"),
  body("portfolio.customThumbnail")
    .optional()
    .trim()
    .isURL()
    .withMessage("customThumbnail must be a valid URL"),
  body("portfolio.featured")
    .optional()
    .isBoolean()
    .withMessage("featured must be a boolean"),
  body("portfolio.tags")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("tags must be an array");
      return true;
    }),

  // Skill Impact validators
  body("skillImpact.techStackSkills")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          throw new Error("techStackSkills must be a valid JSON array");
        }
      }
      if (!Array.isArray(arr)) throw new Error("techStackSkills must be an array");
      for (const item of arr) {
        if (!item.skill || typeof item.skill !== "string") {
          throw new Error("Each techStackSkill must have a skill string");
        }
        if (item.levelBefore && !SKILL_LEVELS.includes(item.levelBefore)) {
          throw new Error(`levelBefore must be one of: ${SKILL_LEVELS.join(", ")}`);
        }
        if (item.levelAfter && !SKILL_LEVELS.includes(item.levelAfter)) {
          throw new Error(`levelAfter must be one of: ${SKILL_LEVELS.join(", ")}`);
        }
        if (item.confidence !== undefined && (item.confidence < 0 || item.confidence > 100)) {
          throw new Error("confidence must be between 0 and 100");
        }
      }
      return true;
    }),
  body("skillImpact.newSkillsLearned")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("newSkillsLearned must be an array");
      return true;
    }),
  body("skillImpact.gapAnalysisTriggered")
    .optional()
    .isBoolean()
    .withMessage("gapAnalysisTriggered must be a boolean"),
];

const updateEventValidators = [
  body("eventName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Event name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Event name must be at most 150 characters"),
  body("eventType")
    .optional()
    .isIn(EVENT_TYPES)
    .withMessage(`Event type must be one of: ${EVENT_TYPES.join(", ")}`),
  body("mode")
    .optional()
    .isIn(MODES)
    .withMessage(`Mode must be one of: ${MODES.join(", ")}`),
  body("level")
    .optional()
    .isIn(LEVELS)
    .withMessage(`Level must be one of: ${LEVELS.join(", ")}`),
  body("result")
    .optional()
    .isIn(RESULTS)
    .withMessage(`Result must be one of: ${RESULTS.join(", ")}`),
  body("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid date"),
  body("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((value, { req }) => {
      if (req.body.startDate && new Date(value) < new Date(req.body.startDate)) {
        throw new Error("End date must be greater than or equal to start date");
      }
      return true;
    }),
  body("teamSize")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Team size must be a positive integer"),
  body("techStack")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) {
        throw new Error("techStack must be an array");
      }
      if (arr.length > 30) {
        throw new Error("techStack cannot have more than 30 entries");
      }
      for (const item of arr) {
        if (typeof item !== "string" || !item.trim()) {
          throw new Error("Each techStack entry must be a non-empty string");
        }
        if (item.trim().length > 60) {
          throw new Error(`techStack entry "${item.trim().slice(0, 20)}..." exceeds 60 characters`);
        }
      }
      return true;
    }),

  // Reflection validators
  body("reflection.whatDidYouBuild")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("What did you build must be at most 2000 characters"),
  body("reflection.whatDidYouLearn")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("What did you learn must be at most 2000 characters"),
  body("reflection.challengesFaced")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Challenges faced must be at most 2000 characters"),
  body("reflection.whatWouldYouDoDifferently")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("What would you do differently must be at most 2000 characters"),
  body("reflection.keyTakeaways")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("keyTakeaways must be an array");
      return true;
    }),
  body("reflection.skillsImproved")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("skillsImproved must be an array");
      return true;
    }),
  body("reflection.rating")
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),
  body("reflection.wouldRecommend")
    .optional()
    .isBoolean()
    .withMessage("Would recommend must be a boolean"),

  // Portfolio validators
  body("portfolio.isPublic")
    .optional()
    .isBoolean()
    .withMessage("isPublic must be a boolean"),
  body("portfolio.showcaseOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("showcaseOrder must be a non-negative integer"),
  body("portfolio.customThumbnail")
    .optional()
    .trim()
    .isURL()
    .withMessage("customThumbnail must be a valid URL"),
  body("portfolio.featured")
    .optional()
    .isBoolean()
    .withMessage("featured must be a boolean"),
  body("portfolio.tags")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("tags must be an array");
      return true;
    }),

  // Skill Impact validators
  body("skillImpact.techStackSkills")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          throw new Error("techStackSkills must be a valid JSON array");
        }
      }
      if (!Array.isArray(arr)) throw new Error("techStackSkills must be an array");
      for (const item of arr) {
        if (!item.skill || typeof item.skill !== "string") {
          throw new Error("Each techStackSkill must have a skill string");
        }
        if (item.levelBefore && !SKILL_LEVELS.includes(item.levelBefore)) {
          throw new Error(`levelBefore must be one of: ${SKILL_LEVELS.join(", ")}`);
        }
        if (item.levelAfter && !SKILL_LEVELS.includes(item.levelAfter)) {
          throw new Error(`levelAfter must be one of: ${SKILL_LEVELS.join(", ")}`);
        }
        if (item.confidence !== undefined && (item.confidence < 0 || item.confidence > 100)) {
          throw new Error("confidence must be between 0 and 100");
        }
      }
      return true;
    }),
  body("skillImpact.newSkillsLearned")
    .optional()
    .custom((value) => {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          arr = value.split(",").map((s) => s.trim());
        }
      }
      if (!Array.isArray(arr)) throw new Error("newSkillsLearned must be an array");
      return true;
    }),
  body("skillImpact.gapAnalysisTriggered")
    .optional()
    .isBoolean()
    .withMessage("gapAnalysisTriggered must be a boolean"),
];

module.exports = { createEventValidators, updateEventValidators };