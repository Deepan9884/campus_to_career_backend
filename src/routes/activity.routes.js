const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const activityController = require("../controllers/activity.controller");

const router = Router();

router.get("/", verifyJWT, activityController.listActivity);

module.exports = router;