const { Router } = require("express");
const { getDashboardStats } = require("../controllers/dashboard.controller");
const verifyJWT = require("../middleware/auth.middleware");
const { cacheMiddleware } = require("../middleware/cache.middleware");

const router = Router();

// Cache dashboard stats for 2 minutes (user-specific)
router.get(
  "/stats",
  verifyJWT,
  cacheMiddleware({ ttl: 120, prefix: "dashboard", includeUser: true }),
  getDashboardStats
);

module.exports = router;
