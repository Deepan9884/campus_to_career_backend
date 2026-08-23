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
const ProctoringViolation = require("../models/ProctoringViolation.model");
const MentorTask = require("../models/MentorTask.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const notificationService = require("../services/notification.service");
const { generateContent } = require("../services/ai.service");
const { invalidateUserCache } = require("../middleware/auth.middleware");

function escapeRegex(str) {
  return (str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Helper to compute computed telemetry and readiness scores for a student.
 */
async function calculateStudentMetrics(u, menteeSet, mentorId) {
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

  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    avatar: u.avatar || "",
    targetRole: u.targetRole || u.profile?.targetRole || "Software Engineer",
    githubUsername: u.githubUsername || u.profile?.githubUsername || "",
    overallReadiness,
    resumeScore,
    avgInterviewScore,
    totalProblemsSolved,
    repoCount,
    verifiedEventsCount,
    linkedPlatformsCount: codingProfiles.length,
    status,
    isMyMentee: menteeSet.has(u._id.toString()) || u.assignedMentor?.toString() === mentorId.toString(),
    isProctoringBlocked: Boolean(u.isProctoringBlocked),
    proctoringBlockedAt: u.proctoringBlockedAt || null,
    lastActive: u.updatedAt || u.createdAt,
  };
}

/**
 * GET /api/admin/students
 * Paginated student directory with calculated readiness scores and telemetry badges.
 */
const getStudentsList = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || "").trim();
  const filter = (req.query.filter || "my-mentees").trim();

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));

  const baseConds = [
    { _id: { $ne: req.user._id } },
    { role: "student" },
  ];

  if (filter === "my-mentees") {
    const menteeIds = currentUser?.mentees || [];
    baseConds.push({
      $or: [
        { assignedMentor: req.user._id },
        { _id: { $in: menteeIds } },
      ],
    });
  } else if (filter === "blocked") {
    baseConds.push({ isProctoringBlocked: true });
  }

  if (search) {
    const safeSearch = escapeRegex(search);
    baseConds.push({
      $or: [
        { name: new RegExp(safeSearch, "i") },
        { email: new RegExp(safeSearch, "i") },
        { targetRole: new RegExp(safeSearch, "i") },
        { "profile.targetRole": new RegExp(safeSearch, "i") },
        { githubUsername: new RegExp(safeSearch, "i") },
        { "profile.githubUsername": new RegExp(safeSearch, "i") },
      ],
    });
  }

  const query = baseConds.length === 1 ? baseConds[0] : { $and: baseConds };

  if (filter === "top-performer" || filter === "at-risk") {
    const allCandidates = await User.find(query)
      .select("name email avatar targetRole profile githubUsername createdAt updatedAt role assignedMentor isProctoringBlocked proctoringBlockedAt")
      .sort({ createdAt: -1 })
      .lean();

    const studentsWithMetrics = await Promise.all(
      allCandidates.map((u) => calculateStudentMetrics(u, menteeSet, req.user._id))
    );

    const matchingStudents = studentsWithMetrics.filter((st) => {
      if (filter === "at-risk") return st.status === "At Risk" || st.overallReadiness < 40;
      if (filter === "top-performer") return st.status === "Top Performer" || st.overallReadiness >= 75;
      return true;
    });

    const total = matchingStudents.length;
    const paginated = matchingStudents.slice((page - 1) * limit, page * limit);

    return ApiResponse.success({
      students: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }).send(res);
  } else {
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("name email avatar targetRole profile githubUsername createdAt updatedAt role assignedMentor isProctoringBlocked proctoringBlockedAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const studentsWithMetrics = await Promise.all(
      users.map((u) => calculateStudentMetrics(u, menteeSet, req.user._id))
    );

    return ApiResponse.success({
      students: studentsWithMetrics,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }).send(res);
  }
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

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee = menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only view detailed diagnostic profiles of your assigned mentees.");
  }



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
    proctoringViolations,
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
    ProctoringViolation.find({ userId: studentId }).sort({ createdAt: -1 }).limit(20).lean(),
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

  const isBlocked =
    student.isProctoringBlocked === true ||
    proctoringViolations.some((v) => v.isBlocked === true || v.violationCount >= 3);

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
      isProctoringBlocked: isBlocked,
      proctoringBlockedAt: student.proctoringBlockedAt || (isBlocked ? new Date() : null),
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
    proctoringViolations,
  }).send(res);
});

/**
 * GET /api/admin/analytics
 * Mentee-wide analytics & aggregated performance metrics for the mentor's assigned roster.
 */
const getCohortAnalytics = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const scope = (req.query.scope || req.query.filter || "my-mentees").trim();
  const menteeIds = currentUser?.mentees || [];

  const menteeFilter = scope === "all"
    ? {
        _id: { $ne: req.user._id },
        $or: [
          { role: "student" },
          { role: { $nin: ["admin", "mentor", "ADMIN", "MENTOR"] } },
          { role: { $exists: false } },
          { role: null },
        ],
      }
    : {
        _id: { $ne: req.user._id },
        $or: [
          { assignedMentor: req.user._id },
          { _id: { $in: menteeIds } },
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

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee = menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only send feedback to your assigned mentees");
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
  const isAssigned = (mentor?.mentees || []).some((id) => id.toString() === studentId);

  if (req.user.role !== "admin" && !isAssigned) {
    throw ApiError.forbidden("Access denied: This student is not in your mentees list");
  }

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

  const searchRegex = new RegExp(escapeRegex(queryStr), "i");
  const students = await User.find({
    _id: { $ne: req.user._id },
    $or: [
      { role: "student" },
      { role: { $nin: ["admin", "mentor", "ADMIN", "MENTOR"] } },
      { role: { $exists: false } },
      { role: null },
    ],
    $and: [
      {
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { targetRole: searchRegex },
          { "profile.targetRole": searchRegex },
          { githubUsername: searchRegex },
          { "profile.githubUsername": searchRegex },
        ],
      },
    ],
  })
    .select("name email avatar targetRole profile githubUsername createdAt assignedMentor")
    .limit(20)
    .lean();

  const formatted = students.map((s) => ({
    _id: s._id,
    name: s.name,
    email: s.email,
    avatar: s.avatar || "",
    targetRole: s.targetRole || s.profile?.targetRole || "Software Engineer",
    githubUsername: s.githubUsername || s.profile?.githubUsername || "",
    createdAt: s.createdAt,
    assignedMentor: s.assignedMentor,
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

/**
 * POST /api/admin/students/:studentId/unblock-proctoring
 * Mentor/Admin unblocks a student's exam access after a proctoring block.
 * Resets violation counter and allows the student to resume exams.
 */
const unblockProctoring = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await User.findById(studentId);
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  // Verify the caller is a mentor of this student or an admin
  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee =
    menteeSet.has(student._id.toString()) ||
    student.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only unblock your assigned mentees");
  }

  // Unblock the student unconditionally
  student.isProctoringBlocked = false;
  student.proctoringBlockedAt = null;
  await student.save();
  invalidateUserCache(studentId);

  // Reset the student's violation records so they start fresh
  await ProctoringViolation.updateMany(
    { userId: studentId },
    { $set: { isBlocked: false, violationCount: 0, events: [], blockedAt: null } }
  );

  // Notify the student their access is restored
  try {
    const notification = await Notification.create({
      user: studentId,
      type: "proctoring_unblocked",
      title: "Exam Access Restored",
      message: `Your exam access has been restored by ${req.user.name || "your mentor"}. You may now resume quizzes and interviews.`,
      actionUrl: "/dashboard",
      read: false,
    });
    notificationService.pushToOpenConnections(studentId, notification);
  } catch (err) {
    console.error("[Proctoring] Failed to send unblock notification:", err);
  }

  return ApiResponse.success({
    message: `${student.name}'s exam access has been successfully restored`,
  }).send(res);
});

/**
 * GET /api/admin/students/:studentId/proctoring-violations
 * Retrieve violation logs for a specific student.
 */
const getStudentProctoringViolations = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await User.findById(studentId).select("assignedMentor").lean();
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee = menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only view proctoring violations for your assigned mentees.");
  }

  const violations = await ProctoringViolation.find({ userId: studentId })
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success({
    violations,
  }).send(res);
});

/**
 * POST /api/admin/students/:studentId/generate-intervention
 * AI Mentor Co-Pilot: Synthesizes candidate performance deficits and generates
 * a structured 2-week remedial roadmap with recommended task actions.
 */
const generateAIIntervention = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await User.findById(studentId).select("name email targetRole assignedMentor").lean();
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee = menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only generate AI interventions for your assigned mentees.");
  }

  const [resumes, interviews, codingProfiles, gapAnalyses, violations] = await Promise.all([
    Resume.find({ user: studentId }).select("atsScore missingKeywords status feedback").sort({ createdAt: -1 }).limit(2).lean(),
    InterviewSession.find({ user: studentId }).select("overallScore roundType targetRole feedback answers").sort({ createdAt: -1 }).limit(3).lean(),
    CodingProfile.find({ userId: studentId }).select("platform cachedStats username").lean(),
    SkillGapAnalysis.find({ user: studentId }).select("matchPercentage targetRole gaps").sort({ createdAt: -1 }).limit(2).lean(),
    ProctoringViolation.find({ userId: studentId }).select("violationCount isBlocked events").lean(),
  ]);

  const latestResume = resumes[0] || null;
  const latestGap = gapAnalyses[0] || null;
  const avgInterviewScore = interviews.length > 0
    ? Math.round(interviews.reduce((acc, i) => acc + (i.overallScore || 0), 0) / interviews.length)
    : 0;

  let totalProblemsSolved = 0;
  codingProfiles.forEach((cp) => {
    const stats = cp.cachedStats || {};
    totalProblemsSolved += Number(stats.totalSolved || stats.solved || stats.problemsSolved || 0);
  });

  const missingSkills = (latestGap?.gaps || []).map((g) => g.skillName || g).filter(Boolean);
  const prompt = `You are an elite Tech Career Coach & Placement Dean for campus engineering students.
Analyze this candidate's diagnostic profile for the target role "${student.targetRole || "Software Engineer"}":

CANDIDATE: ${student.name}
TARGET ROLE: ${student.targetRole || "Software Engineer"}
ATS RESUME SCORE: ${latestResume?.atsScore || 0}% (Missing Keywords: ${(latestResume?.missingKeywords || []).slice(0, 8).join(", ") || "None"})
MOCK INTERVIEW AVERAGE: ${avgInterviewScore}% (${interviews.length} sessions completed)
LEETCODE / CODING SOLVED: ${totalProblemsSolved} problems across platforms
SKILL GAP DEFICITS: ${missingSkills.slice(0, 8).join(", ") || "General DSA & System Design"}
PROCTORING BLOCKS / STRIKES: ${violations.reduce((acc, v) => acc + (v.violationCount || 0), 0)} strikes

Generate a high-impact, actionable 2-week intervention plan and 3-4 specific mentor-prescribed tasks.
Return ONLY valid JSON matching this exact structure:
{
  "diagnosisSummary": "2-3 concise sentences diagnosing why this candidate is lagging in placements and the primary bottleneck.",
  "keyDeficits": ["Specific deficit 1", "Specific deficit 2", "Specific deficit 3"],
  "twoWeekPlan": [
    {
      "week": 1,
      "theme": "Foundation & Core Technical Remediation",
      "actions": ["Action item 1", "Action item 2", "Action item 3"]
    },
    {
      "week": 2,
      "theme": "Mock Interview Mastery & ATS Resume Refactor",
      "actions": ["Action item 1", "Action item 2", "Action item 3"]
    }
  ],
  "suggestedTasks": [
    {
      "title": "Clear concise task title",
      "description": "Concrete steps the student must take to complete this task.",
      "category": "quiz" | "interview" | "resume" | "coding",
      "priority": "urgent" | "high" | "medium",
      "daysToComplete": 3,
      "actionUrl": "/interview" | "/roadmap" | "/resume" | "/skills"
    }
  ]
}`;

  let interventionData;
  try {
    const rawAiResponse = await generateContent({
      prompt,
      taskType: "feedback",
    });

    const cleaned = (rawAiResponse || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    interventionData = JSON.parse(cleaned);
  } catch (err) {
    console.error("[AI Intervention] Gemini call failed, using heuristic fallback:", err);
    interventionData = {
      diagnosisSummary: `${student.name} is currently developing toward their target role (${student.targetRole || "Software Engineer"}). The immediate priority is accelerating DSA problem count and practicing structured STAR responses in technical rounds.`,
      keyDeficits: [
        `ATS Resume Score at ${latestResume?.atsScore || 0}% needs keyword optimization`,
        `Coding problem volume (${totalProblemsSolved} solved) needs consistent weekly quota`,
        `Mock interview scoring (${avgInterviewScore}%) requires STAR storytelling practice`,
      ],
      twoWeekPlan: [
        {
          week: 1,
          theme: "Algorithmic Foundations & Core Problem Solving",
          actions: [
            "Complete 15 medium problems on Trees, Graphs, and Dynamic Programming",
            "Take the Section 2 Coding Assessment on the Learning Roadmap",
            "Review time & space complexity edge cases for graph traversal",
          ],
        },
        {
          week: 2,
          theme: "Behavioral Communication & ATS Alignment",
          actions: [
            "Complete a full 5-question Technical & HR Mock Interview session",
            "Re-upload updated PDF resume incorporating metrics and cloud keywords",
            "Review verified contest proofs and link active GitHub repository",
          ],
        },
      ],
      suggestedTasks: [
        {
          title: "Complete Roadmap Assessment: Graph Algorithms & Dynamic Programming",
          description: "Achieve at least 80% on Section 1 & Section 2 questions to verify mastery.",
          category: "quiz",
          priority: "high",
          daysToComplete: 4,
          actionUrl: "/roadmap",
        },
        {
          title: "Practice Full 3-Round Mock Interview with Voice Dictation",
          description: "Complete Technical and HR rounds focusing on STAR structured project explanations.",
          category: "interview",
          priority: "urgent",
          daysToComplete: 5,
          actionUrl: "/interview",
        },
        {
          title: "Update Resume with Impact Metrics & Target Role Keywords",
          description: "Add quantifiable performance metrics to your top 2 GitHub projects and re-scan for ATS score.",
          category: "resume",
          priority: "high",
          daysToComplete: 3,
          actionUrl: "/resume",
        },
      ],
    };
  }

  return ApiResponse.success({
    student: {
      _id: student._id,
      name: student.name,
      targetRole: student.targetRole,
    },
    intervention: interventionData,
  }).send(res);
});

/**
 * POST /api/admin/students/:studentId/tasks
 * Mentor prescribes a specific task/goal to a student.
 */
const createMentorTask = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { title, description, category, priority, daysToComplete, actionUrl } = req.body;

  if (!title || !title.trim()) {
    throw ApiError.badRequest("Task title is required");
  }

  const student = await User.findById(studentId).select("assignedMentor").lean();
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee = menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only assign tasks to your assigned mentees.");
  }

  const dueDate = daysToComplete
    ? new Date(Date.now() + Number(daysToComplete) * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const task = await MentorTask.create({
    student: studentId,
    mentor: req.user._id,
    title: title.trim(),
    description: (description || "").trim(),
    category: category || "general",
    priority: priority || "medium",
    dueDate,
    status: "pending",
    actionUrl: actionUrl || "/dashboard",
  });

  // Create notification for student
  try {
    const notification = await Notification.create({
      user: studentId,
      type: "mentor_assigned",
      title: `New Assignment from Mentor: ${title.trim()}`,
      message: description || `Your mentor ${req.user.name || ""} has assigned you a new milestone goal.`,
      actionUrl: actionUrl || "/dashboard",
      read: false,
    });
    notificationService.pushToOpenConnections(studentId, notification);
  } catch (err) {
    console.error("[Mentor Task] Failed to send notification to student:", err);
  }

  return ApiResponse.success({
    message: "Task successfully assigned to student",
    task,
  }).send(res);
});

/**
 * GET /api/admin/students/:studentId/tasks
 * Get all tasks assigned by mentor to a specific student.
 */
const getStudentMentorTasks = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role !== "admin" && req.user._id.toString() !== studentId) {
    const student = await User.findById(studentId).select("assignedMentor").lean();
    const currentUser = await User.findById(req.user._id).select("mentees role").lean();
    const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
    const isMyMentee = student && (menteeSet.has(student._id.toString()) || student.assignedMentor?.toString() === req.user._id.toString());

    if (!isMyMentee) {
      throw ApiError.forbidden("Access denied: You can only view tasks of your assigned mentees.");
    }
  }

  const tasks = await MentorTask.find({ student: studentId })
    .populate("mentor", "name email avatar")
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success({
    tasks,
  }).send(res);
});

/**
 * PATCH /api/admin/tasks/:taskId
 * Update task status or due date.
 */
const updateMentorTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status, priority, dueDate, title, description } = req.body;

  const task = await MentorTask.findById(taskId);
  if (!task) {
    throw ApiError.notFound("Task not found");
  }

  if (req.user.role !== "admin" && task.mentor.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden("Access denied: You can only modify tasks you created.");
  }

  if (status) {
    task.status = status;
    if (status === "completed") {
      task.completedAt = new Date();
    }
  }
  if (priority) task.priority = priority;
  if (dueDate) task.dueDate = new Date(dueDate);
  if (title) task.title = title.trim();
  if (description !== undefined) task.description = description.trim();

  await task.save();

  return ApiResponse.success({
    message: "Task updated successfully",
    task,
  }).send(res);
});

/**
 * DELETE /api/admin/tasks/:taskId
 * Delete a mentor-assigned task.
 */
const deleteMentorTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  const task = await MentorTask.findById(taskId);
  if (!task) {
    throw ApiError.notFound("Task not found");
  }

  if (req.user.role !== "admin" && task.mentor.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden("Access denied: You can only delete tasks you created.");
  }

  await MentorTask.findByIdAndDelete(taskId);

  return ApiResponse.success({
    message: "Task deleted successfully",
  }).send(res);
});

/**
 * GET /api/admin/proctoring/live-feed
 * Real-time institutional exam radar & live violation telemetry.
 */
const getLiveProctoringFeed = asyncHandler(async (_req, res) => {
  const [blockedUsers, recentViolations, totalBlockedCount] = await Promise.all([
    User.find({ isProctoringBlocked: true })
      .select("name email avatar targetRole proctoringBlockedAt assignedMentor")
      .sort({ proctoringBlockedAt: -1 })
      .limit(30)
      .lean(),
    ProctoringViolation.find()
      .populate("userId", "name email avatar targetRole")
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    User.countDocuments({ isProctoringBlocked: true }),
  ]);

  return ApiResponse.success({
    totalBlockedCount,
    blockedUsers,
    recentViolations,
  }).send(res);
});

/**
 * POST /api/admin/students/batch-unblock
 * Batch restore exam access for multiple students in 1 click.
 */
const batchUnblockProctoring = asyncHandler(async (req, res) => {
  const { studentIds, reason } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw ApiError.badRequest("studentIds must be a non-empty array of user IDs");
  }

  await User.updateMany(
    { _id: { $in: studentIds } },
    { $set: { isProctoringBlocked: false, proctoringBlockedAt: null } }
  );
  studentIds.forEach((sid) => invalidateUserCache(sid));

  await ProctoringViolation.updateMany(
    { userId: { $in: studentIds } },
    { $set: { isBlocked: false, violationCount: 0, events: [], blockedAt: null } }
  );

  // Send unblock notification to all students
  await Promise.all(
    studentIds.map(async (sid) => {
      try {
        const notification = await Notification.create({
          user: sid,
          type: "proctoring_unblocked",
          title: "Exam Access Restored (Batch Resolution)",
          message: reason
            ? `Your exam access was restored: ${reason}`
            : "Your mentor has restored your examination access. You may now resume tests.",
          actionUrl: "/dashboard",
          read: false,
        });
        notificationService.pushToOpenConnections(sid, notification);
      } catch (err) {
        console.error(`Failed to send unblock notification to student ${sid}:`, err);
      }
    })
  );

  return ApiResponse.success({
    message: `Successfully restored exam access for ${studentIds.length} candidate(s)`,
    unblockedCount: studentIds.length,
  }).send(res);
});

/**
 * GET /api/admin/cohort/export-csv
 * Generates full cohort CSV dataset for college administration & recruiter drives.
 */
const exportStudentsCohortCsv = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));

  const students = await User.find({
    _id: { $ne: req.user._id },
    $or: [
      { role: "student" },
      { role: { $nin: ["admin", "mentor", "ADMIN", "MENTOR"] } },
      { role: { $exists: false } },
      { role: null },
    ],
  })
    .select("name email avatar targetRole profile githubUsername createdAt updatedAt role assignedMentor isProctoringBlocked proctoringBlockedAt")
    .sort({ createdAt: -1 })
    .lean();

  const studentsWithMetrics = await Promise.all(
    students.map((u) => calculateStudentMetrics(u, menteeSet, req.user._id))
  );

  return ApiResponse.success({
    students: studentsWithMetrics,
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
  unblockProctoring,
  getStudentProctoringViolations,
  generateAIIntervention,
  createMentorTask,
  getStudentMentorTasks,
  updateMentorTask,
  deleteMentorTask,
  getLiveProctoringFeed,
  batchUnblockProctoring,
  exportStudentsCohortCsv,
};

