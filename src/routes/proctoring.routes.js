const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const { reportViolation, getViolationStatus } = require("../controllers/proctoring.controller");

const router = Router();

// POST /api/proctoring/violation — student reports a violation event
router.post("/violation", verifyJWT, reportViolation);

// GET /api/proctoring/status/:moduleId — get violation status for an attempt/session
router.get("/status/:moduleId", verifyJWT, getViolationStatus);

module.exports = router;
