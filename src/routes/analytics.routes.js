const { Router } = require("express");
const { getAnalyticsOverview } = require("../controllers/analytics.controller");
const verifyJWT = require("../middleware/auth.middleware");

const router = Router();

router.get("/overview", verifyJWT, getAnalyticsOverview);

module.exports = router;
