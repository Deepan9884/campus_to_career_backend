const { body, param } = require("express-validator");
const InterviewSession = require("../models/InterviewSession.model");
const { ROUND_TYPES, ITEM_TYPES } = require("../models/InterviewSession.model");

const startSessionValidators = [
  body("targetRole")
    .optional()
    .isString()
    .withMessage("targetRole must be a string")
    .isLength({ max: 100 })
    .withMessage("targetRole must be at most 100 characters")
    .trim()
    .matches(/^[a-zA-Z0-9 \-\/&(),\.]*$/)
    .withMessage("targetRole contains invalid characters"),

  body("difficulty")
    .optional()
    .isIn(["easy", "medium", "hard"])
    .withMessage("difficulty must be 'easy', 'medium', or 'hard'"),

  body("questionCount")
    .optional()
    .isInt({ min: 3, max: 10 })
    .withMessage("questionCount must be an integer between 3 and 10"),

  body("selectedRounds")
    .optional()
    .isArray({ min: 1, max: 6 })
    .withMessage("selectedRounds must be an array with 1 to 6 round types")
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      const validTypes = new Set(ROUND_TYPES);
      for (const rt of value) {
        if (!validTypes.has(rt)) {
          throw new Error(`Invalid round type: ${rt}. Must be one of: ${ROUND_TYPES.join(", ")}`);
        }
      }
      if (new Set(value).size !== value.length) {
        throw new Error("selectedRounds must not contain duplicate values");
      }
      return true;
    }),

  body("resumeId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("resumeId must be a valid MongoDB ObjectId"),

  body("resumeText")
    .optional({ nullable: true })
    .isString()
    .withMessage("resumeText must be a string")
    .isLength({ max: 50000 })
    .withMessage("resumeText must be at most 50000 characters"),
];

const submitAnswerValidators = [
  param("roundType")
    .exists()
    .withMessage("roundType is required")
    .isIn(ROUND_TYPES)
    .withMessage(`roundType must be one of: ${ROUND_TYPES.join(", ")}`),

  body("itemIndex")
    .exists()
    .withMessage("itemIndex is required")
    .isInt({ min: 0 })
    .withMessage("itemIndex must be a non-negative integer"),

  // Strict per-item type enforcement (MCQ requires selectedOptionIndex, open_ended & coding require answer)
  body()
    .custom(async (value, { req }) => {
      const sessionId = req.params.id;
      const roundType = req.params.roundType;

      const session = await InterviewSession.findById(sessionId).lean();
      if (!session) throw new Error("Interview session not found");
      const round = (session.rounds || []).find((r) => r.roundType === roundType);
      if (!round) throw new Error("Invalid roundType");

      const itemIndex = req.body?.itemIndex;
      const item = (round.items || [])[itemIndex];
      if (!item) throw new Error("Invalid itemIndex");

      if (item.itemType === "mcq") {
        if (typeof req.body?.selectedOptionIndex !== "number") {
          throw new Error("selectedOptionIndex is required for mcq items");
        }
      } else if (item.itemType === "open_ended" || item.itemType === "coding") {
        const ans = req.body?.answer;
        if (typeof ans !== "string" || !ans.trim()) {
          throw new Error("answer is required for this item");
        }
      } else {
        throw new Error(`Unknown itemType: ${item.itemType}`);
      }

      return true;
    }),
];

const finishRoundValidators = [
  param("roundType")
    .exists()
    .withMessage("roundType is required")
    .isIn(ROUND_TYPES)
    .withMessage(`roundType must be one of: ${ROUND_TYPES.join(", ")}`),
];

module.exports = {
  startInterviewValidators: startSessionValidators, // keep name used by routes file's import
  submitAnswerValidators,
  finishRoundValidators,
};
