const { Router } = require("express");
const { getAnalyticsOverview } = require("../controllers/analytics.controller");
const verifyJWT = require("../middleware/auth.middleware");

const router = Router();

router.get("/overview", verifyJWT, getAnalyticsOverview);
router.get("/weekly-report", verifyJWT, require("../controllers/analytics.controller").generateWeeklyReport);

module.exports = router;
