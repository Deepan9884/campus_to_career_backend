const User = require("../models/User.model");
const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const CodingProfile = require("../models/CodingProfile.model");
const RepoAnalysis = require("../models/RepoAnalysis.model");
const Event = require("../models/Event.model");
const SkillGapAnalysis = require("../models/SkillGapAnalysis.model");
const LearningRoadmap = require("../models/LearningRoadmap.model");
const UserSkill = require("../models/UserSkill.model");
const Notification = require("../models/Notification.model");
const ActivityLog = require("../models/ActivityLog.model");
const QuizAttempt = require("../models/QuizAttempt.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const notificationService = require("../services/notification.service");

/**
 * GET /api/admin/students
 * Paginated student directory with calculated readiness scores and telemetry badges.
 */
const getStudentsList = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const search = (req.query.search || "").trim();
  const filter = (req.query.filter || "my-mentees").trim();

  const currentUser = await User.findById(req.user._id).select("mentees").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));

  const excludeTestCondition = {
    email: { $not: /example\.com$|@test\.com$|^test_|^dynrec_/i },
  };

  const query = { role: { $nin: ["admin", "mentor"] }, ...excludeTestCondition };
  if (filter === "my-mentees") {
    query.$and = [
      { role: { $nin: ["admin", "mentor"] } },
      excludeTestCondition,
      {
        $or: [
          { assignedMentor: req.user._id },
          { _id: { $in: currentUser?.mentees || [] } },
        ],
      },
    ];
    delete query.role;
    delete query.email;
  }

  if (search) {
    const searchCond = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { targetRole: new RegExp(search, "i") },
    ];
    if (query.$and) {
      query.$and.push({ $or: searchCond });
    } else {
      query.$and = [{ role: { $nin: ["admin", "mentor"] } }, excludeTestCondition, { $or: searchCond }];
      delete query.role;
      delete query.email;
    }
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select("name email avatar targetRole githubUsername createdAt updatedAt role assignedMentor")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // Compute calculated readiness metrics for each student
  const studentsWithMetrics = await Promise.all(
    users.map(async (u) => {
      const [
        latestResume,
        completedInterviews,
        codingProfiles,
        repoCount,
        events,
        latestGap,
      ] = await Promise.all([
        Resume.findOne({ user: u._id, status: "completed" }).select("atsScore").sort({ createdAt: -1 }).lean(),
        InterviewSession.find({ user: u._id, status: "completed" }).select("overallScore").lean(),
        CodingProfile.find({ userId: u._id }).select("platform cachedStats username").lean(),
        RepoAnalysis.countDocuments({ user: u._id, status: "completed" }),
        Event.find({ user: u._id }).select("verificationResult result").lean(),
        SkillGapAnalysis.findOne({ user: u._id, status: "completed" }).select("matchPercentage").sort({ createdAt: -1 }).lean(),
      ]);

      const resumeScore = latestResume?.atsScore || 0;
      const avgInterviewScore = completedInterviews.length > 0
        ? Math.round(completedInterviews.reduce((acc, i) => acc + (i.overallScore || 0), 0) / completedInterviews.length)
        : 0;

      let totalProblemsSolved = 0;
      codingProfiles.forEach((cp) => {
        const stats = cp.cachedStats || {};
        totalProblemsSolved += Number(stats.totalSolved || stats.solved || stats.problemsSolved || 0);
      });

      const verifiedEventsCount = events.filter(
        (e) => e.verificationResult?.isVerified || e.result === "winner" || e.result === "runner-up" || e.result === "finalist"
      ).length;

      const skillGapMatchPct = latestGap?.matchPercentage || 0;
      const codingScore = Math.min(100, Math.round(totalProblemsSolved * 1.0 + repoCount * 10));
      const eventScore = Math.min(100, Math.round(verifiedEventsCount * 30 + events.length * 10));

      const overallReadiness = Math.round(
        skillGapMatchPct * 0.30 +
        resumeScore * 0.20 +
        avgInterviewScore * 0.20 +
        codingScore * 0.15 +
        eventScore * 0.15
      );

      let status = "On Track";
      if (overallReadiness < 40) status = "At Risk";
      else if (overallReadiness >= 75) status = "Top Performer";

      if (filter === "at-risk" && status !== "At Risk") return null;
      if (filter === "top-performer" && status !== "Top Performer") return null;

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        targetRole: u.targetRole || "Software Engineer",
        githubUsername: u.githubUsername,
        overallReadiness,
        resumeScore,
        avgInterviewScore,
        totalProblemsSolved,
        repoCount,
        verifiedEventsCount,
        linkedPlatformsCount: codingProfiles.length,
        status,
        isMyMentee: menteeSet.has(u._id.toString()) || u.assignedMentor?.toString() === req.user._id.toString(),
        lastActive: u.updatedAt,
      };
    })
  );

  const filteredStudents = studentsWithMetrics.filter(Boolean);

  return ApiResponse.success({
    students: filteredStudents,
    pagination: {
      page,
      limit,
      total: filteredStudents.length,
      totalPages: Math.ceil(total / limit),
    },
  }).send(res);
});

/**
 * GET /api/admin/students/:studentId
 * 360-degree deep inspection of a single student.
 */
const getStudent360Detail = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await User.findById(studentId).select("-password -refreshToken").lean();
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  const currentUser = await User.findById(req.user._id).select("mentees").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));

  const [
    resumes,
    interviews,
    codingProfiles,
    repoAnalyses,
    events,
    gapAnalyses,
    roadmaps,
    userSkills,
    activityLogs,
    quizAttempts,
  ] = await Promise.all([
    Resume.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    InterviewSession.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    CodingProfile.find({ userId: studentId }).lean(),
    RepoAnalysis.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    Event.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    SkillGapAnalysis.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    LearningRoadmap.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    UserSkill.find({ user: studentId }).lean(),
    ActivityLog.find({ user: studentId }).sort({ createdAt: -1 }).limit(50).lean(),
    QuizAttempt.find({ userId: studentId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  const latestResume = resumes.find((r) => r.status === "completed") || resumes[0] || null;
  const completedInterviews = interviews.filter((i) => i.status === "completed");
  const latestGap = gapAnalyses.find((g) => g.status === "completed") || gapAnalyses[0] || null;

  const resumeScore = latestResume?.atsScore || 0;
  const avgInterviewScore = completedInterviews.length > 0
    ? Math.round(completedInterviews.reduce((acc, i) => acc + (i.overallScore || 0), 0) / completedInterviews.length)
    : 0;

  let totalProblemsSolved = 0;
  const platformBreakdown = codingProfiles.map((cp) => {
    const stats = cp.cachedStats || {};
    const solved = Number(stats.totalSolved || stats.solved || stats.problemsSolved || 0);
    totalProblemsSolved += solved;
    return {
      platform: cp.platform,
      username: cp.username,
      profileUrl: cp.profileUrl,
      totalSolved: solved,
      easySolved: stats.easySolved || stats.byDifficulty?.Easy || 0,
      mediumSolved: stats.mediumSolved || stats.byDifficulty?.Medium || 0,
      hardSolved: stats.hardSolved || stats.byDifficulty?.Hard || 0,
    };
  });

  const verifiedEvents = events.filter(
    (e) => e.verificationResult?.isVerified || e.result === "winner" || e.result === "runner-up" || e.result === "finalist"
  );

  const skillGapMatchPct = latestGap?.matchPercentage || 0;
  const codingScore = Math.min(100, Math.round(totalProblemsSolved * 1.0 + repoAnalyses.length * 10));
  const eventScore = Math.min(100, Math.round(verifiedEvents.length * 30 + events.length * 10));

  const overallReadinessPct = Math.round(
    skillGapMatchPct * 0.30 +
    resumeScore * 0.20 +
    avgInterviewScore * 0.20 +
    codingScore * 0.15 +
    eventScore * 0.15
  );

  const isMyMentee = menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString();

  return ApiResponse.success({
    student: {
      _id: student._id,
      name: student.name,
      email: student.email,
      avatar: student.avatar,
      targetRole: student.targetRole || "Software Engineer",
      githubUsername: student.githubUsername,
      bio: student.bio,
      createdAt: student.createdAt,
      assignedMentor: student.assignedMentor,
      isMyMentee,
    },
    metrics: {
      overallReadinessPct,
      skillGapMatchPct,
      resumeScore,
      avgInterviewScore,
      codingScore,
      eventScore,
      totalProblemsSolved,
      repoCount: repoAnalyses.length,
      verifiedEventsCount: verifiedEvents.length,
    },
    resumes,
    interviews,
    codingProfiles: platformBreakdown,
    repoAnalyses,
    events,
    gapAnalyses,
    roadmaps,
    userSkills,
    activityLogs,
    quizAttempts,
  }).send(res);
});

/**
 * GET /api/admin/analytics
 * Mentee-wide analytics & aggregated performance metrics for the mentor's assigned roster.
 */
const getCohortAnalytics = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.user._id).select("mentees").lean();
  const excludeTestCondition = {
    email: { $not: /example\.com$|@test\.com$|^test_|^dynrec_/i },
  };

  const menteeFilter = {
    role: { $nin: ["admin", "mentor"] },
    ...excludeTestCondition,
    $or: [
      { assignedMentor: req.user._id },
      { _id: { $in: currentUser?.mentees || [] } },
    ],
  };

  const users = await User.find(menteeFilter).select("_id").lean();
  const userIds = users.map((u) => u._id);
  const totalStudents = userIds.length;

  const [resumes, interviews, codingProfiles, events, gapAnalyses] = await Promise.all([
    Resume.find({ user: { $in: userIds }, status: "completed" }).select("atsScore user").lean(),
    InterviewSession.find({ user: { $in: userIds }, status: "completed" }).select("overallScore targetRole user").lean(),
    CodingProfile.find({ userId: { $in: userIds } }).select("platform cachedStats userId").lean(),
    Event.find({ user: { $in: userIds } }).select("verificationResult user").lean(),
    SkillGapAnalysis.find({ user: { $in: userIds }, status: "completed" }).select("matchPercentage targetRole user").lean(),
  ]);

  const avgResumeScore = resumes.length > 0
    ? Math.round(resumes.reduce((sum, r) => sum + (r.atsScore || 0), 0) / resumes.length)
    : 0;

  const avgInterviewScore = interviews.length > 0
    ? Math.round(interviews.reduce((sum, i) => sum + (i.overallScore || 0), 0) / interviews.length)
    : 0;

  let totalCodingProblems = 0;
  codingProfiles.forEach((cp) => {
    const stats = cp.cachedStats || {};
    totalCodingProblems += Number(stats.totalSolved || stats.solved || stats.problemsSolved || 0);
  });

  const verifiedProofsCount = events.filter((e) => e.verificationResult?.isVerified).length;

  // Compute placement readiness funnel distribution across assigned mentees
  let placementReadyCount = 0;
  let developingCount = 0;
  let interventionCount = 0;
  const missingSkillMap = {};

  await Promise.all(
    users.map(async (u) => {
      const [latestResume, completedInts, codingProfs, repoCount, evts, latestGap] = await Promise.all([
        Resume.findOne({ user: u._id, status: "completed" }).select("atsScore").sort({ createdAt: -1 }).lean(),
        InterviewSession.find({ user: u._id, status: "completed" }).select("overallScore").lean(),
        CodingProfile.find({ userId: u._id }).select("cachedStats").lean(),
        RepoAnalysis.countDocuments({ user: u._id, status: "completed" }),
        Event.find({ user: u._id }).select("verificationResult result").lean(),
        SkillGapAnalysis.findOne({ user: u._id, status: "completed" }).select("matchPercentage gaps").sort({ createdAt: -1 }).lean(),
      ]);

      const resumeScore = latestResume?.atsScore || 0;
      const avgInterview = completedInts.length > 0
        ? Math.round(completedInts.reduce((a, b) => a + (b.overallScore || 0), 0) / completedInts.length)
        : 0;

      let solved = 0;
      codingProfs.forEach((c) => {
        const s = c.cachedStats || {};
        solved += Number(s.totalSolved || s.solved || s.problemsSolved || 0);
      });

      const verEvts = evts.filter(
        (e) => e.verificationResult?.isVerified || e.result === "winner" || e.result === "runner-up"
      ).length;

      const gapScore = latestGap?.matchPercentage || 0;
      const readiness = Math.round(
        gapScore * 0.30 +
        resumeScore * 0.20 +
        avgInterview * 0.20 +
        Math.min(100, solved + repoCount * 10) * 0.15 +
        Math.min(100, verEvts * 30 + evts.length * 10) * 0.15
      );

      if (readiness >= 75) placementReadyCount++;
      else if (readiness >= 45) developingCount++;
      else interventionCount++;

      // Aggregate gaps for heatmap
      if (latestGap?.gaps) {
        latestGap.gaps.forEach((g) => {
          if (g.skillName) {
            missingSkillMap[g.skillName] = (missingSkillMap[g.skillName] || 0) + 1;
          }
        });
      }
    })
  );

  // Distribution of Target Roles
  const roleCounts = {};
  gapAnalyses.forEach((g) => {
    if (g.targetRole) {
      roleCounts[g.targetRole] = (roleCounts[g.targetRole] || 0) + 1;
    }
  });

  const topTargetRoles = Object.entries(roleCounts)
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topMissingSkills = Object.entries(missingSkillMap)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return ApiResponse.success({
    summary: {
      totalStudents,
      avgResumeScore,
      avgInterviewScore,
      totalCodingProblems,
      verifiedProofsCount,
      completedInterviewsCount: interviews.length,
      analyzedResumesCount: resumes.length,
      placementFunnel: {
        placementReady: placementReadyCount,
        developing: developingCount,
        intervention: interventionCount,
      },
    },
    topTargetRoles,
    topMissingSkills,
  }).send(res);
});

/**
 * POST /api/admin/students/:studentId/feedback
 * Mentor posts direct targeted guidance note / task to a student.
 */
const sendStudentFeedback = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { title, note, actionType } = req.body;

  if (!note || typeof note !== "string" || note.trim() === "") {
    throw ApiError.badRequest("Guidance note is required");
  }

  const student = await User.findById(studentId);
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  const notification = await Notification.create({
    user: studentId,
    type: "mentor_note",
    title: title || `Mentor Guidance from ${req.user.name || "your Mentor"}`,
    message: note.trim(),
    actionUrl: actionType === "resume" ? "/resume" : actionType === "interview" ? "/interview" : "/skills",
    read: false,
  });

  // Push real-time notification
  try {
    notificationService.pushToOpenConnections(studentId, notification);
  } catch (err) {
    console.error("Failed to deliver SSE notification:", err);
  }

  return ApiResponse.success({
    message: "Mentor feedback successfully sent to student",
    notification,
  }).send(res);
});

/**
 * POST /api/admin/mentees
 * Mentor adds a mentee by email or student ID.
 * STRICT LOGIC: Mentors can ONLY add mentees who already have a registered account on the student side.
 */
const addMentee = asyncHandler(async (req, res) => {
  const { studentEmail, studentId, email } = req.body;
  const input = (studentEmail || email || studentId || "").trim();

  if (!input) {
    throw ApiError.badRequest("Student email or ID is required");
  }

  let student;
  if (input.includes("@")) {
    student = await User.findOne({ email: input.toLowerCase() });
  } else if (input.match(/^[0-9a-fA-F]{24}$/)) {
    student = await User.findById(input);
  } else {
    student = await User.findOne({ email: input.toLowerCase() });
  }

  if (!student || student.role === "admin" || student.role === "mentor") {
    throw ApiError.notFound("No student account found with this email. Only registered students can be added as mentees.");
  }

  if (student._id.toString() === req.user._id.toString()) {
    throw ApiError.badRequest("You cannot add yourself as your own mentee. Please select a registered student account.");
  }

  const mentor = await User.findById(req.user._id);

  // Link student to mentor
  const menteeIds = (mentor.mentees || []).map((id) => id.toString());
  if (!menteeIds.includes(student._id.toString())) {
    mentor.mentees.push(student._id);
    await mentor.save();
  }

  student.assignedMentor = mentor._id;
  await student.save();

  // Send real-time notification to student
  try {
    const notification = await Notification.create({
      user: student._id,
      type: "mentor_assigned",
      title: `Assigned to Mentor: ${mentor.name}`,
      message: `${mentor.name} has added you as a mentee. You can now receive direct guidance and actions from your mentor.`,
      actionUrl: "/dashboard",
      read: false,
    });

    notificationService.pushToOpenConnections(student._id, notification);
  } catch (err) {
    console.error("Failed to notify student of mentor assignment:", err);
  }

  return ApiResponse.success({
    message: `${student.name} (${student.email}) successfully added as your mentee!`,
    student: {
      _id: student._id,
      name: student.name,
      email: student.email,
      avatar: student.avatar,
      targetRole: student.targetRole,
      assignedMentor: student.assignedMentor,
    },
  }).send(res);
});

/**
 * DELETE /api/admin/mentees/:studentId
 * Mentor removes a student from their mentees list.
 */
const removeMentee = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const mentor = await User.findById(req.user._id);
  if (mentor && mentor.mentees) {
    mentor.mentees = mentor.mentees.filter((id) => id.toString() !== studentId);
    await mentor.save();
  }

  await User.findByIdAndUpdate(studentId, { assignedMentor: null });

  return ApiResponse.success({
    message: "Mentee removed successfully",
  }).send(res);
});

/**
 * GET /api/admin/mentees
 * Fetch all assigned mentees for the logged-in mentor.
 */
const getMyMentees = asyncHandler(async (req, res) => {
  const mentor = await User.findById(req.user._id).populate("mentees", "name email avatar targetRole githubUsername createdAt").lean();
  const menteeList = mentor?.mentees || [];

  return ApiResponse.success({
    mentees: menteeList,
  }).send(res);
});

/**
 * GET /api/admin/students/search-registered?query=...
 * Live search registered student accounts on the student side.
 */
const searchRegisteredStudents = asyncHandler(async (req, res) => {
  const queryStr = (req.query.query || req.query.search || "").trim();
  if (!queryStr) {
    return ApiResponse.success({ students: [] }).send(res);
  }

  const mentor = await User.findById(req.user._id).select("mentees").lean();
  const menteeIds = new Set((mentor?.mentees || []).map((id) => id.toString()));

  const searchRegex = new RegExp(queryStr, "i");
  const students = await User.find({
    role: { $nin: ["admin", "mentor"] },
    email: { $not: /example\.com$|@test\.com$|^test_|^dynrec_/i },
    $or: [{ name: searchRegex }, { email: searchRegex }],
  })
    .select("name email avatar targetRole githubUsername createdAt assignedMentor")
    .limit(10)
    .lean();

  const formatted = students.map((s) => ({
    ...s,
    isMyMentee: menteeIds.has(s._id.toString()) || s.assignedMentor?.toString() === req.user._id.toString(),
  }));

  return ApiResponse.success({ students: formatted }).send(res);
});

/**
 * GET /api/admin/profile
 * Get mentor profile & credentials.
 */
const getMentorProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -refreshToken").lean();
  return ApiResponse.success(user).send(res);
});

/**
 * PATCH /api/admin/profile
 * Update mentor profile credentials.
 */
const updateMentorProfile = asyncHandler(async (req, res) => {
  const { name, email, targetRole, bio, avatar, linkedinUrl, githubUsername, preferences } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }

  if (email && email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw ApiError.conflict("Email address is already in use by another account");
    }
    user.email = email.toLowerCase();
  }

  if (name) user.name = name.trim();
  if (targetRole !== undefined) user.targetRole = targetRole.trim();
  if (bio !== undefined) user.bio = bio.trim();
  if (avatar !== undefined) user.avatar = avatar.trim();
  if (linkedinUrl !== undefined) user.linkedinUrl = linkedinUrl.trim();
  if (githubUsername !== undefined) user.githubUsername = githubUsername.trim();
  if (preferences) user.preferences = { ...user.preferences, ...preferences };

  await user.save();

  return ApiResponse.success({
    message: "Mentor profile credentials updated successfully",
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      targetRole: user.targetRole,
      bio: user.bio,
      linkedinUrl: user.linkedinUrl,
      githubUsername: user.githubUsername,
      preferences: user.preferences,
    },
  }).send(res);
});

/**
 * POST /api/admin/change-password
 * Change mentor account password credentials.
 */
const changeMentorPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest("Current password and new password are required");
  }

  if (newPassword.length < 8) {
    throw ApiError.badRequest("New password must be at least 8 characters");
  }

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  return ApiResponse.success({
    message: "Mentor password updated successfully!",
  }).send(res);
});

module.exports = {
  getStudentsList,
  getStudent360Detail,
  getCohortAnalytics,
  sendStudentFeedback,
  addMentee,
  removeMentee,
  getMyMentees,
  searchRegisteredStudents,
  getMentorProfile,
  updateMentorProfile,
  changeMentorPassword,
};
