const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const { upload: eventMulter } = require("../middleware/eventCertificateMulter");
const validate = require("../middleware/validate.middleware");
const { createEventValidators, updateEventValidators } = require("../validators/event.validators");
const {
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
} = require("../controllers/event.controller");

const router = Router();

router.use(verifyJWT);

router.post("/", eventMulter.single("certificate"), createEventValidators, validate, createEvent);
router.get("/", getUserEvents);
router.get("/stats", getEventStats);
router.get("/analytics", getEventAnalytics);
router.get("/badges", getEventBadges);
router.get("/portfolio", getEventPortfolio);
router.get("/portfolio/:userId", getEventPortfolio);
router.get("/:id", getEventById);
router.patch("/:id", eventMulter.single("certificate"), updateEventValidators, validate, updateEvent);
router.delete("/:id", deleteEvent);

// AI endpoints
router.post("/generate-description", generateEventDescription);
router.post("/:id/predict-gaps", predictSkillGaps);

module.exports = router;