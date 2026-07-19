const express = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const badgesController = require("../controllers/badges.controller");

const router = express.Router();

// GET /api/badges
router.get("/", verifyJWT, badgesController.listBadges);

module.exports = router;
