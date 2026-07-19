const { Router } = require("express");
const verifyJWT = require("../middleware/auth.middleware");
const usersController = require("../controllers/users.controller");

const router = Router();

// --- Protected routes ---
router.patch("/me/profile", verifyJWT, usersController.updateProfile);

module.exports = router;
