const { Router } = require("express");
const { getDashboardStats } = require("../controllers/dashboard.controller");
const verifyJWT = require("../middleware/auth.middleware");

const router = Router();

router.get("/stats", verifyJWT, getDashboardStats);

module.exports = router;
