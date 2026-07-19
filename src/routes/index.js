const { Router } = require("express");

const authRoutes = require("./auth.routes");
const usersRoutes = require("./users.routes");
const resumeRoutes = require("./resume.routes");
const interviewRoutes = require("./interview.routes");
const githubRoutes = require("./github.routes");
const skillsRoutes = require("./skills.routes");
const roadmapRoutes = require("./roadmap.routes");
const dashboardRoutes = require("./dashboard.routes");
const analyticsRoutes = require("./analytics.routes");
const quizRoutes = require("./quiz.routes");
const notificationRoutes = require("./notification.routes");
const activityRoutes = require("./activity.routes");
const badgesRoutes = require("./badges.routes");
const codingProfilesRoutes = require("./codingProfiles.routes");

const router = Router();

// Health check — always available, no auth required
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Auth routes
router.use("/auth", authRoutes);

// Users routes
router.use("/users", usersRoutes);

// Resume routes
router.use("/resume", resumeRoutes);

// Interview routes
router.use("/interview", interviewRoutes);

// GitHub routes
router.use("/github", githubRoutes);

// Skills routes
router.use("/skills", skillsRoutes);

// Roadmap routes
router.use("/roadmap", roadmapRoutes);

// Quiz routes
router.use("/skill-gap/quiz", quizRoutes);

// Notification routes
router.use("/notifications", notificationRoutes);

// Activity routes
router.use("/activity", activityRoutes);

// Dashboard routes
router.use("/dashboard", dashboardRoutes);

// Badges routes
router.use("/badges", badgesRoutes);

// Coding profiles routes
router.use("/coding", codingProfilesRoutes);

// Analytics routes
router.use("/analytics", analyticsRoutes);


module.exports = router;
