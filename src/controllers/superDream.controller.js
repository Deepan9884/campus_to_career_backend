const SuperDream = require("../models/SuperDream.model");
const User = require("../models/User.model");
const CodingProfile = require("../models/CodingProfile.model");
const Resume = require("../models/Resume.model");
const InterviewSession = require("../models/InterviewSession.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { createDefaultChecklist } = require("../utils/defaultChecklist");

/**
 * Builds live real coding stats map for a student by querying CodingProfile collection.
 */
async function getRealStudentCodingStats(studentId) {
  const profiles = await CodingProfile.find({ userId: studentId }).lean();
  const statsMap = {
    leetcode: { username: "", profileUrl: "", totalSolved: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0, contestRating: 0, isConnected: false },
    codechef: { username: "", profileUrl: "", totalSolved: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0, contestRating: 0, isConnected: false },
    gfg: { username: "", profileUrl: "", totalSolved: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0, contestRating: 0, isConnected: false },
    hackerrank: { username: "", profileUrl: "", totalSolved: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0, contestRating: 0, isConnected: false },
  };

  for (const cp of profiles) {
    const plat = (cp.platform || "").toLowerCase();
    if (statsMap[plat]) {
      const cached = cp.cachedStats || {};
      const easy = Number(cached.easySolved ?? cached.easy ?? cached.easyCount ?? cached.byDifficulty?.Easy ?? cached.byDifficulty?.easy ?? 0);
      const medium = Number(cached.mediumSolved ?? cached.medium ?? cached.mediumCount ?? cached.byDifficulty?.Medium ?? cached.byDifficulty?.medium ?? 0);
      const hard = Number(cached.hardSolved ?? cached.hard ?? cached.hardCount ?? cached.byDifficulty?.Hard ?? cached.byDifficulty?.hard ?? 0);
      const sum = easy + medium + hard;
      const total = Number(
        cached.solved ??
        cached.totalSolved ??
        cached.problemsSolved ??
        cached.solvedCount ??
        cached.total ??
        cached.byDifficulty?.All ??
        cached.byDifficulty?.all ??
        (sum > 0 ? sum : 0)
      );
      const rating = Number(cached.rating ?? cached.contestRating ?? cached.maxRating ?? cached.codingScore ?? 0);

      statsMap[plat] = {
        username: cp.username || "",
        profileUrl: cp.profileUrl || "",
        totalSolved: total,
        easySolved: easy,
        mediumSolved: medium,
        hardSolved: hard,
        contestRating: rating,
        isConnected: Boolean(cp.profileUrl || cp.username || total > 0),
      };
    }
  }

  return statsMap;
}

/**
 * Resolves avatar cleanly: custom uploaded avatar > GitHub avatar > professional Initials badge SVG
 */
function resolveCandidateAvatar(u = {}) {
  if (u.avatar && typeof u.avatar === "string" && u.avatar.trim()) return u.avatar.trim();
  const gh = u.githubUsername || u.profile?.githubUsername;
  if (gh && typeof gh === "string" && gh.trim()) {
    return `https://github.com/${gh.trim()}.png`;
  }
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name || "Student")}&backgroundColor=4f46e5,7c3aed,059669`;
}

/**
 * Ensures all 10 checklist sections exist and have standard curriculum items.
 */
function ensureCompleteChecklist(existingChecklist = {}, studentUser = {}) {
  const resolvedName = studentUser.name || (existingChecklist.profile?.name && existingChecklist.profile.name !== "Student" && existingChecklist.profile.name !== "Student Candidate" ? existingChecklist.profile.name : "Student Candidate");
  const resolvedReg = studentUser.profile?.registerNumber || existingChecklist.profile?.registerNumber || "";
  const resolvedDept = studentUser.profile?.department || existingChecklist.profile?.department || "";
  const resolvedRole = studentUser.targetRole || studentUser.profile?.targetRole || existingChecklist.profile?.targetRole || "";

  const defaultChecklist = createDefaultChecklist(
    resolvedName,
    resolvedReg,
    resolvedDept,
    resolvedRole
  );

  const merged = {
    profile: {
      ...defaultChecklist.profile,
      ...(existingChecklist.profile || {}),
      name: studentUser.name || existingChecklist.profile?.name || defaultChecklist.profile.name,
      targetRole: resolvedRole || defaultChecklist.profile.targetRole,
      registerNumber: resolvedReg || defaultChecklist.profile.registerNumber,
      department: resolvedDept || defaultChecklist.profile.department,
    },
    section1Programming: (existingChecklist.section1Programming && existingChecklist.section1Programming.length > 0)
      ? existingChecklist.section1Programming
      : defaultChecklist.section1Programming,
    section2CsFundamentals: (existingChecklist.section2CsFundamentals && existingChecklist.section2CsFundamentals.length > 0)
      ? existingChecklist.section2CsFundamentals
      : defaultChecklist.section2CsFundamentals,
    section3CodingDsa: (existingChecklist.section3CodingDsa && existingChecklist.section3CodingDsa.length > 0)
      ? existingChecklist.section3CodingDsa
      : defaultChecklist.section3CodingDsa,
    section4SoftwareDev: (existingChecklist.section4SoftwareDev && existingChecklist.section4SoftwareDev.length > 0)
      ? existingChecklist.section4SoftwareDev
      : defaultChecklist.section4SoftwareDev,
    section5AiDataScience: (existingChecklist.section5AiDataScience && existingChecklist.section5AiDataScience.length > 0)
      ? existingChecklist.section5AiDataScience
      : defaultChecklist.section5AiDataScience,
    section6CloudDevOps: (existingChecklist.section6CloudDevOps && existingChecklist.section6CloudDevOps.length > 0)
      ? existingChecklist.section6CloudDevOps
      : defaultChecklist.section6CloudDevOps,
    section7GithubPortfolio: (existingChecklist.section7GithubPortfolio && existingChecklist.section7GithubPortfolio.length > 0)
      ? existingChecklist.section7GithubPortfolio
      : defaultChecklist.section7GithubPortfolio,
    section8Certifications: (existingChecklist.section8Certifications && existingChecklist.section8Certifications.length > 0)
      ? existingChecklist.section8Certifications
      : defaultChecklist.section8Certifications,
    section9InterviewPrep: (existingChecklist.section9InterviewPrep && existingChecklist.section9InterviewPrep.length > 0)
      ? existingChecklist.section9InterviewPrep
      : defaultChecklist.section9InterviewPrep,
    section10Evaluation: { ...defaultChecklist.section10Evaluation, ...(existingChecklist.section10Evaluation || {}) },
    overrideScores: existingChecklist.overrideScores || {},
  };

  return merged;
}

/**
 * Synchronizes Section 3 checklist targets with live connected coding platform stats.
 */
function syncSection3CodingChecklist(checklist, codingStats = {}) {
  const lcStats = codingStats.leetcode || {};
  const hrStats = codingStats.hackerrank || {};
  const ccStats = codingStats.codechef || {};
  const gfgStats = codingStats.gfg || {};
  const totalHard = (Number(lcStats.hardSolved) || 0) + (Number(hrStats.hardSolved) || 0) + (Number(ccStats.hardSolved) || 0) + (Number(gfgStats.hardSolved) || 0);
  const totalAll = (Number(lcStats.totalSolved) || 0) + (Number(hrStats.totalSolved) || 0) + (Number(ccStats.totalSolved) || 0) + (Number(gfgStats.totalSolved) || 0);

  if (checklist && Array.isArray(checklist.section3CodingDsa)) {
    checklist.section3CodingDsa = checklist.section3CodingDsa.map((item) => {
      if (item.id === "dsa-1") return { ...item, current: Number(lcStats.totalSolved) || item.current || 0 };
      if (item.id === "dsa-2") return { ...item, current: Number(hrStats.totalSolved) || item.current || 0 };
      if (item.id === "dsa-3") return { ...item, current: Number(ccStats.totalSolved) || item.current || 0 };
      if (item.id === "dsa-8") return { ...item, current: Math.max(item.current || 0, totalHard) };
      if (item.id === "dsa-10") return { ...item, current: Number(lcStats.contestRating) || item.current || 0 };
      if (item.id === "dsa-5" && totalAll > 0 && (item.current === 0 || !item.current)) return { ...item, current: Math.round(totalAll * 0.15) };
      if (item.id === "dsa-6" && totalAll > 0 && (item.current === 0 || !item.current)) return { ...item, current: Math.round(totalAll * 0.12) };
      if (item.id === "dsa-7" && totalAll > 0 && (item.current === 0 || !item.current)) return { ...item, current: Math.round(totalAll * 0.12) };
      return item;
    });
  }
  return checklist;
}

/**
 * Computes overall readiness score and tier based on genuine 10 sections progress.
 */
function computeReadiness(checklist = {}) {
  let score = 0;

  // 1. Programming Skills (15 max)
  const pSkills = checklist.section1Programming || [];
  if (pSkills.length > 0) {
    const pMastered = pSkills.filter((s) => s.status === "Mastered").length;
    const pInProgress = pSkills.filter((s) => s.status === "In Progress").length;
    const pScore = Math.min(15, Math.round(((pMastered * 1 + pInProgress * 0.5) / pSkills.length) * 15 * 10) / 10);
    score += pScore;
  }

  // 2. CS Fundamentals (15 max)
  const cs = checklist.section2CsFundamentals || [];
  if (cs.length > 0) {
    const totalRating = cs.reduce((acc, curr) => acc + (Number(curr.rating) || 0), 0);
    const csScore = Math.min(15, Math.round((totalRating / (cs.length * 5)) * 15 * 10) / 10);
    score += csScore;
  }

  // 3. Coding & DSA (15 max)
  const dsa = checklist.section3CodingDsa || [];
  if (dsa.length > 0) {
    const totalRatios = dsa.reduce((acc, curr) => {
      const cur = Number(curr.current) || 0;
      const tgt = Number(curr.target) || 1;
      return acc + Math.min(1, cur / tgt);
    }, 0);
    const dsaScore = Math.min(15, Math.round((totalRatios / dsa.length) * 15 * 10) / 10);
    score += dsaScore;
  }

  // 4. Software Dev (10 max)
  const dev = checklist.section4SoftwareDev || [];
  if (dev.length > 0) {
    const completedCount = dev.filter((d) => (Number(d.current) || 0) >= (Number(d.target) || 1) || d.verified).length;
    score += Math.min(10, Math.round((completedCount / dev.length) * 10 * 10) / 10);
  }

  // 5. AI & Data Science (10 max)
  const ai = checklist.section5AiDataScience || [];
  if (ai.length > 0) {
    const completedCount = ai.filter((a) => (Number(a.current) || 0) >= (Number(a.target) || 1) || a.verified).length;
    score += Math.min(10, Math.round((completedCount / ai.length) * 10 * 10) / 10);
  }

  // 6. Cloud & DevOps (10 max)
  const cloud = checklist.section6CloudDevOps || [];
  if (cloud.length > 0) {
    const completedCount = cloud.filter((c) => (Number(c.current) || 0) >= (Number(c.target) || 1) || c.verified).length;
    score += Math.min(10, Math.round((completedCount / cloud.length) * 10 * 10) / 10);
  }

  // 7. GitHub Portfolio (10 max)
  const gh = checklist.section7GithubPortfolio || [];
  if (gh.length > 0) {
    const completedCount = gh.filter((g) => g.isCompleted || (Number(g.current) || 0) >= (Number(g.targetValue || g.target) || 1)).length;
    score += Math.min(10, Math.round((completedCount / gh.length) * 10 * 10) / 10);
  }

  // 8. Industry Certifications (5 max)
  const certs = checklist.section8Certifications || [];
  if (certs.length > 0) {
    const completedCount = certs.filter((c) => c.status === "Completed" || c.verified).length;
    score += Math.min(5, Math.round((completedCount / certs.length) * 5 * 10) / 10);
  }

  // 9. Interview Prep (5 max)
  const interview = checklist.section9InterviewPrep || [];
  if (interview.length > 0) {
    const totalRatios = interview.reduce((acc, curr) => {
      const cur = Number(curr.current) || 0;
      const tgt = Number(curr.target) || 1;
      return acc + Math.min(1, cur / tgt);
    }, 0);
    score += Math.min(5, Math.round((totalRatios / interview.length) * 5 * 10) / 10);
  }

  // 10. Mentor Signoff Evaluation (5 max)
  const evalData = checklist.section10Evaluation || {};
  let evalScore = 0;
  if (evalData.facultyMentorSignature) evalScore += 2;
  if (evalData.strengths && evalData.areasForImprovement) evalScore += 2;
  if (evalData.hodSignature) evalScore += 1;
  score += evalScore;

  const totalObtained = Math.min(100, Math.round(score * 10) / 10);

  let tierName = "Foundational Tier (< ₹8 LPA)";
  if (totalObtained >= 95) tierName = "Elite Product Company Ready (₹40–60+ LPA)";
  else if (totalObtained >= 90) tierName = "Premium Product Company Ready (₹25–40 LPA)";
  else if (totalObtained >= 80) tierName = "Strong Product/MNC Ready (₹15–25 LPA)";
  else if (totalObtained >= 70) tierName = "Good IT/Product Company Ready (₹8–15 LPA)";

  let activePhase = 1;
  if (totalObtained >= 85) activePhase = 4;
  else if (totalObtained >= 65) activePhase = 3;
  else if (totalObtained >= 40) activePhase = 2;

  // Count verified deliverables across all sections
  let verifiedCount = 0;
  verifiedCount += (checklist.section4SoftwareDev || []).filter((d) => d.verified).length;
  verifiedCount += (checklist.section5AiDataScience || []).filter((d) => d.verified).length;
  verifiedCount += (checklist.section6CloudDevOps || []).filter((d) => d.verified).length;
  verifiedCount += (checklist.section8Certifications || []).filter((d) => d.verified).length;

  return { totalObtained, tierName, activePhase, verifiedCount };
}

/**
 * GET /api/super-dream/my-state
 * Fetches the authenticated student's Super Dream profile or creates a clean initial record.
 */
const getMySuperDreamState = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const studentUser = await User.findById(studentId).select("name email profile targetRole").lean();
  let record = await SuperDream.findOne({ student: studentId });

  // Get real live coding platform telemetry
  const realCodingStats = await getRealStudentCodingStats(studentId);

  if (!record) {
    const fullChecklist = createDefaultChecklist(
      studentUser?.name,
      studentUser?.profile?.registerNumber,
      studentUser?.profile?.department,
      studentUser?.targetRole || studentUser?.profile?.targetRole
    );
    const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(fullChecklist);

    record = await SuperDream.create({
      student: studentId,
      checklist: fullChecklist,
      codingPlatformsStats: realCodingStats,
      movementHistory: [],
      overallReadiness: totalObtained,
      tierName,
      activePhase,
      verifiedDeliverablesCount: verifiedCount,
    });
  } else {
    // Ensure all 10 sections are complete
    record.checklist = ensureCompleteChecklist(record.checklist, studentUser || {});
    // Sync any newly connected coding profiles
    record.codingPlatformsStats = {
      ...(record.codingPlatformsStats || {}),
      ...realCodingStats,
    };
    record.checklist = syncSection3CodingChecklist(record.checklist, record.codingPlatformsStats);
    const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(record.checklist);
    record.overallReadiness = totalObtained;
    record.tierName = tierName;
    record.activePhase = activePhase;
    record.verifiedDeliverablesCount = verifiedCount;
    record.markModified("checklist");
    record.markModified("codingPlatformsStats");
    await record.save();
  }

  return ApiResponse.success({ superDream: record }).send(res);
});

/**
 * PUT /api/super-dream/sync
 * Syncs the student's local state, computes metrics, and logs movement diffs.
 */
const syncMySuperDreamState = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const {
    checklist,
    codingPlatformsStats,
    csQuizAttempts,
    visitedCsCourses,
    allocatedProjects,
    allocatedAiProjects,
    courses,
    tests,
    mentorRoadmap,
    travelMilestones,
    newMovement,
  } = req.body;

  let existing = await SuperDream.findOne({ student: studentId });
  if (!existing) {
    existing = new SuperDream({ student: studentId });
  }

  if (checklist) {
    existing.checklist = ensureCompleteChecklist(checklist);
  }
  if (codingPlatformsStats) existing.codingPlatformsStats = codingPlatformsStats;
  if (csQuizAttempts) existing.csQuizAttempts = csQuizAttempts;
  if (visitedCsCourses) existing.visitedCsCourses = visitedCsCourses;
  if (allocatedProjects) existing.allocatedProjects = allocatedProjects;
  if (allocatedAiProjects) existing.allocatedAiProjects = allocatedAiProjects;
  if (courses) existing.courses = courses;
  if (tests) existing.tests = tests;
  if (mentorRoadmap) existing.mentorRoadmap = mentorRoadmap;
  if (travelMilestones) existing.travelMilestones = travelMilestones;

  // Auto compute readiness and stats
  const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(existing.checklist);
  existing.overallReadiness = totalObtained;
  existing.tierName = tierName;
  existing.activePhase = activePhase;
  existing.verifiedDeliverablesCount = verifiedCount;
  existing.lastActivityAt = new Date();

  // If student updated profile in checklist, synchronize back to User profile
  if (checklist?.profile) {
    const userUpdate = {};
    if (checklist.profile.name && checklist.profile.name !== "Student" && checklist.profile.name !== "Student Candidate") {
      userUpdate.name = checklist.profile.name.trim();
    }
    if (checklist.profile.registerNumber !== undefined) {
      userUpdate["profile.registerNumber"] = checklist.profile.registerNumber.trim();
    }
    if (checklist.profile.department !== undefined) {
      userUpdate["profile.department"] = checklist.profile.department.trim();
    }
    if (checklist.profile.batch !== undefined) {
      userUpdate["profile.batch"] = checklist.profile.batch.trim();
    }
    if (checklist.profile.currentSemester !== undefined) {
      userUpdate["profile.currentSemester"] = checklist.profile.currentSemester.trim();
    }
    if (checklist.profile.facultyMentor !== undefined) {
      userUpdate["profile.facultyMentor"] = checklist.profile.facultyMentor.trim();
    }
    if (checklist.profile.targetRole !== undefined) {
      userUpdate["targetRole"] = checklist.profile.targetRole.trim();
      userUpdate["profile.targetRole"] = checklist.profile.targetRole.trim();
    }
    if (Object.keys(userUpdate).length > 0) {
      await User.findByIdAndUpdate(studentId, { $set: userUpdate });
    }
  }

  // If a genuine new movement was emitted, append it
  if (newMovement && newMovement.title) {
    existing.movementHistory.unshift({
      actionType: newMovement.actionType || "profile_updated",
      sectionId: Number(newMovement.sectionId) || 0,
      title: newMovement.title,
      details: newMovement.details || "",
      metadata: newMovement.metadata || {},
      timestamp: new Date(),
    });
    if (existing.movementHistory.length > 100) {
      existing.movementHistory = existing.movementHistory.slice(0, 100);
    }
  }

  existing.markModified("checklist");
  existing.markModified("codingPlatformsStats");
  existing.markModified("csQuizAttempts");
  existing.markModified("allocatedProjects");
  existing.markModified("allocatedAiProjects");
  existing.markModified("courses");
  existing.markModified("tests");
  existing.markModified("mentorRoadmap");
  existing.markModified("movementHistory");

  await existing.save();

  return ApiResponse.success({
    message: "Super Dream synchronized successfully",
    superDream: existing,
  }).send(res);
});

/**
 * POST /api/super-dream/movement
 * Explicitly logs a student movement event (e.g. quiz passed, coding link submitted).
 */
const logSuperDreamMovement = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { actionType, sectionId, title, details, metadata } = req.body;

  if (!title) {
    throw ApiError.badRequest("Movement title is required");
  }

  let doc = await SuperDream.findOne({ student: studentId });
  if (!doc) {
    doc = new SuperDream({ student: studentId, checklist: createDefaultChecklist() });
  }

  const movementItem = {
    actionType: actionType || "profile_updated",
    sectionId: Number(sectionId) || 0,
    title,
    details: details || "",
    metadata: metadata || {},
    timestamp: new Date(),
  };

  doc.movementHistory.unshift(movementItem);
  if (doc.movementHistory.length > 100) {
    doc.movementHistory = doc.movementHistory.slice(0, 100);
  }
  doc.lastActivityAt = new Date();
  doc.markModified("movementHistory");
  await doc.save();

  return ApiResponse.success({
    message: "Movement logged successfully",
    movement: movementItem,
  }).send(res);
});

/**
 * GET /api/super-dream/cohort
 * (Mentor / Admin) Retrieves cohort students assigned to the logged-in mentor with their live Super Dream performance.
 * STRICT: Only returns registered students assigned as mentees to this mentor.
 */
const getAdminSuperDreamCohort = asyncHandler(async (req, res) => {
  const search = (req.query.search || "").trim();
  const phaseFilter = req.query.phase;

  const currentUser = await User.findById(req.user._id).select("mentees role name email");

  // Ensure current user's role in DB is not accidentally 'student'
  if (currentUser && currentUser.role === "student") {
    currentUser.role = "mentor";
    await currentUser.save();
  }

  // Find all mentor/admin accounts in the database to guarantee total exclusion
  const allMentorAccounts = await User.find({
    $or: [
      { role: { $in: ["admin", "mentor", "faculty", "hod", "ADMIN", "MENTOR", "FACULTY", "HOD", "staff", "STAFF"] } },
      { "mentees.0": { $exists: true } },
    ],
  }).select("_id email").lean();

  const allMentorIds = allMentorAccounts.map((m) => m._id.toString());
  const allMentorEmails = allMentorAccounts.map((m) => m.email?.toLowerCase()).filter(Boolean);

  // Clean up mentor's mentees array:
  // 1. Remove self (_id === req.user._id)
  // 2. Remove any other mentor/admin user IDs
  // 3. Validate all mentees have real student role
  const rawMenteeIds = (currentUser?.mentees || [])
    .map((id) => id.toString())
    .filter((id) => id !== req.user._id.toString() && !allMentorIds.includes(id));

  const nonStudentRoles = ["admin", "mentor", "faculty", "hod", "ADMIN", "MENTOR", "FACULTY", "HOD", "staff", "STAFF"];
  const nonStudentRegex = /faculty|mentor|admin|professor|prof\.|dr\.|hod|staff/i;

  const validStudentMentees = await User.find({
    _id: { $in: rawMenteeIds, $nin: allMentorAccounts.map((m) => m._id), $ne: req.user._id },
    role: { $in: ["student", "STUDENT"], $nin: nonStudentRoles },
    targetRole: { $not: nonStudentRegex },
    "profile.targetRole": { $not: nonStudentRegex },
    name: { $not: /^(dr\.|prof\.|professor|faculty|mentor|admin|hod)/i },
  }).select("_id").lean();

  const validMenteeIds = validStudentMentees.map((m) => m._id);
  const validMenteeIdStrings = validMenteeIds.map((id) => id.toString());

  // Auto-sync mentor's mentees field in DB if invalid IDs or self-reference existed
  if (currentUser && Array.isArray(currentUser.mentees) && currentUser.mentees.length !== validMenteeIds.length) {
    currentUser.mentees = validMenteeIds;
    await currentUser.save();
  }

  // STRICT RULE: Super Dream Track ONLY displays assigned mentees of the logged-in mentor
  const assignedOr = [{ assignedMentor: req.user._id }];
  if (validMenteeIds.length > 0) {
    assignedOr.push({ _id: { $in: validMenteeIds } });
  }

  // Base conditions: STRICTLY exclude current user, all mentor emails/IDs, and non-student roles
  const baseConditions = [
    { _id: { $ne: req.user._id, $nin: allMentorAccounts.map((m) => m._id) } },
    { role: { $in: ["student", "STUDENT"], $nin: nonStudentRoles } },
    { targetRole: { $not: nonStudentRegex } },
    { "profile.targetRole": { $not: nonStudentRegex } },
    { name: { $not: /^(dr\.|prof\.|professor|faculty|mentor|admin|hod)/i } },
    { $or: assignedOr },
  ];

  if (currentUser?.email) {
    baseConditions.push({ email: { $ne: currentUser.email.toLowerCase(), $nin: allMentorEmails } });
  }

  if (search) {
    const safeSearch = escapeRegex(search);
    baseConditions.push({
      $or: [
        { name: new RegExp(safeSearch, "i") },
        { email: new RegExp(safeSearch, "i") },
        { targetRole: new RegExp(safeSearch, "i") },
        { "profile.targetRole": new RegExp(safeSearch, "i") },
        { "profile.registerNumber": new RegExp(safeSearch, "i") },
      ],
    });
  }

  const userQuery = baseConditions.length === 1 ? baseConditions[0] : { $and: baseConditions };

  const users = await User.find(userQuery)
    .select("name email avatar targetRole profile githubUsername createdAt role assignedMentor")
    .sort({ createdAt: -1 })
    .lean();

  // Defense-in-depth: Filter out any non-student or mentor objects
  const filteredUsers = users.filter((u) => {
    const uId = u._id.toString();
    if (uId === req.user._id.toString() || allMentorIds.includes(uId)) return false;
    if (currentUser?.email && u.email?.toLowerCase() === currentUser.email.toLowerCase()) return false;
    if (allMentorEmails.includes(u.email?.toLowerCase())) return false;
    const tRole = (u.targetRole || u.profile?.targetRole || "").toLowerCase();
    if (tRole.includes("mentor") || tRole.includes("faculty") || tRole.includes("admin") || tRole.includes("professor") || tRole.includes("hod")) return false;
    const nameLower = (u.name || "").toLowerCase();
    if (nameLower.startsWith("dr.") || nameLower.startsWith("prof.") || nameLower.includes("faculty") || nameLower.includes("mentor") || nameLower.includes("admin")) return false;
    return true;
  });

  const userIds = filteredUsers.map((u) => u._id);
  const superDreams = await SuperDream.find({ student: { $in: userIds } }).lean();
  const superDreamMap = new Map(superDreams.map((sd) => [sd.student.toString(), sd]));

  const cohortList = await Promise.all(
    filteredUsers.map(async (u) => {
      let sd = superDreamMap.get(u._id.toString());
      if (!sd) {
        const realCodingStats = await getRealStudentCodingStats(u._id);
        const fullChecklist = createDefaultChecklist(
          u.name,
          u.profile?.registerNumber,
          u.profile?.department,
          u.targetRole || u.profile?.targetRole
        );
        const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(fullChecklist);
        const created = await SuperDream.create({
          student: u._id,
          checklist: fullChecklist,
          codingPlatformsStats: realCodingStats,
          movementHistory: [],
          overallReadiness: totalObtained,
          tierName,
          activePhase,
          verifiedDeliverablesCount: verifiedCount,
        });
        sd = created.toObject();
      }

      const readiness = sd?.overallReadiness ?? 0;
      const tier = sd?.tierName || "Foundational Tier (< ₹8 LPA)";
      const phase = sd?.activePhase || 1;
      const verifiedCourses = (sd?.courses || []).filter((c) => c.status === "completed" || c.certificateProof?.verificationChecks?.studentMatch).length;
      const completedTasks = (sd?.checklist?.section4SoftwareDev || []).filter((p) => p.verified || (p.current >= p.target && p.target > 0)).length;
      const avgTestScore = (sd?.tests || []).length > 0
        ? Math.round((sd.tests.reduce((acc, t) => acc + (t.highScore || 0), 0)) / sd.tests.length)
        : 0;
      const recentMovements = (sd?.movementHistory || []).slice(0, 8);

      let status = "In Training";
      if (readiness >= 80) status = "Qualified";
      else if (readiness < 40) status = "Review Required";

      return {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        avatar: resolveCandidateAvatar(u),
        targetRole: u.targetRole || u.profile?.targetRole || sd?.checklist?.profile?.targetRole || "Software Engineer",
        registerNumber: u.profile?.registerNumber || "N/A",
        department: u.profile?.department || "Computer Science",
        readinessIndex: Math.round(readiness),
        tierName: tier,
        activePhase: phase,
        verifiedCourses,
        completedTasks,
        avgTestScore,
        status,
        verifiedDeliverablesCount: sd?.verifiedDeliverablesCount || 0,
        lastActivityAt: sd?.lastActivityAt || u.createdAt,
        recentMovements,
        hasFullData: true,
        isAssignedToMe: validMenteeIdStrings.includes(u._id.toString()) || u.assignedMentor?.toString() === req.user._id.toString(),
      };
    })
  );

  const filtered = phaseFilter
    ? cohortList.filter((c) => String(c.activePhase) === String(phaseFilter))
    : cohortList;

  return ApiResponse.success({
    total: cohortList.length,
    filteredTotal: filtered.length,
    cohort: filtered,
    mentorName: currentUser?.name || req.user.name,
  }).send(res);
});

/**
 * POST /api/super-dream/assign-mentee
 * Assigns a registered student to the logged-in mentor's Super Dream and mentee cohort.
 */
const assignSuperDreamMentee = asyncHandler(async (req, res) => {
  const { studentId, studentEmail } = req.body;
  const input = (studentId || studentEmail || "").trim();

  if (!input) {
    throw ApiError.badRequest("Student ID or email is required");
  }

  let student = null;
  if (input.includes("@")) {
    student = await User.findOne({ email: input.toLowerCase() });
  } else if (input.match(/^[0-9a-fA-F]{24}$/)) {
    student = await User.findById(input);
  }

  if (!student) {
    throw ApiError.notFound("No registered student account found with this email/ID.");
  }

  if (student._id.toString() === req.user._id.toString()) {
    throw ApiError.badRequest("You cannot assign yourself as your own mentee. Please select a registered student account.");
  }

  if (student.role !== "student" || (student.mentees && student.mentees.length > 0)) {
    throw ApiError.badRequest("Selected account is a faculty mentor or administrator. Only registered student candidates can be assigned.");
  }

  const nameLower = (student.name || "").toLowerCase();
  const targetLower = (student.targetRole || student.profile?.targetRole || "").toLowerCase();
  if (
    nameLower.startsWith("dr.") ||
    nameLower.startsWith("prof.") ||
    nameLower.includes("mentor") ||
    nameLower.includes("faculty") ||
    targetLower.includes("mentor") ||
    targetLower.includes("faculty") ||
    targetLower.includes("admin")
  ) {
    throw ApiError.badRequest("Selected account is a faculty/mentor account and cannot be added as a mentee.");
  }

  student.assignedMentor = req.user._id;
  if (!student.profile) student.profile = {};
  student.profile.facultyMentor = req.user.name || "Faculty Mentor";
  await student.save();

  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { mentees: student._id },
  });

  return ApiResponse.success({
    message: `${student.name} (${student.email}) successfully assigned to your Super Dream roster!`,
    student: {
      id: student._id.toString(),
      name: student.name,
      email: student.email,
      avatar: resolveCandidateAvatar(student),
      targetRole: student.targetRole || student.profile?.targetRole || "Software Engineer",
    },
  }).send(res);
});

/**
 * POST /api/super-dream/unassign-mentee
 * Unassigns a student from the mentor's Super Dream and mentee roster.
 */
const unassignSuperDreamMentee = asyncHandler(async (req, res) => {
  const { studentId, studentEmail } = req.body;
  const input = (studentId || studentEmail || "").trim();

  if (!input) {
    throw ApiError.badRequest("Student ID or email is required");
  }

  let student = null;
  if (input.includes("@")) {
    student = await User.findOne({ email: input.toLowerCase() });
  } else if (input.match(/^[0-9a-fA-F]{24}$/)) {
    student = await User.findById(input);
  }

  if (!student) {
    throw ApiError.notFound("Student record not found");
  }

  // Remove from mentor's mentees array
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { mentees: student._id },
  });

  // Clear assigned mentor from student
  student.assignedMentor = null;
  if (student.profile && student.profile.facultyMentor) {
    student.profile.facultyMentor = null;
  }
  await student.save();

  return ApiResponse.success({
    message: `${student.name} (${student.email}) has been removed from your mentee and Super Dream roster.`,
    unassignedStudentId: student._id.toString(),
  }).send(res);
});

/**
 * GET /api/super-dream/student/:studentId
 * (Mentor / Admin) 360-degree deep inspection of a student's live Super Dream state.
 */
const getAdminStudentSuperDream = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const studentUser = await User.findById(studentId).select("-password -refreshToken").lean();
  if (!studentUser) {
    throw ApiError.notFound("Student not found");
  }

  if (studentUser.role !== "student" || studentUser._id.toString() === req.user._id.toString()) {
    throw ApiError.badRequest("Selected user profile is not a registered student candidate.");
  }

  const currentUser = await User.findById(req.user._id).select("mentees role").lean();
  const menteeSet = new Set((currentUser?.mentees || []).map((id) => id.toString()));
  const isMyMentee = menteeSet.has(studentUser._id.toString()) || studentUser.assignedMentor?.toString() === req.user._id.toString();

  if (req.user.role !== "admin" && !isMyMentee) {
    throw ApiError.forbidden("Access denied: You can only view Super Dream diagnostic portfolios of your assigned mentees.");
  }

  let sd = await SuperDream.findOne({ student: studentId }).lean();
  const [realCodingStats, resumes, interviews] = await Promise.all([
    getRealStudentCodingStats(studentId),
    Resume.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
    InterviewSession.find({ user: studentId }).sort({ createdAt: -1 }).lean(),
  ]);

  const latestResume = resumes.find((r) => r.status === "completed") || resumes[0] || null;
  const resumeData = {
    hasResume: Boolean(latestResume),
    totalResumes: resumes.length,
    latestResume: latestResume
      ? {
          _id: latestResume._id,
          filename: latestResume.filename,
          atsScore: latestResume.atsScore || 0,
          targetRole: latestResume.targetRole || latestResume.inferredTargetRole || "",
          matchedKeywords: latestResume.keywordBreakdown?.matched || [],
          missingKeywords: latestResume.keywordBreakdown?.missing || [],
          strengths: latestResume.strengths || [],
          improvements: latestResume.improvements || [],
          summary: latestResume.summary || "",
          extractedText: latestResume.extractedText || "",
          status: latestResume.status,
          updatedAt: latestResume.updatedAt || latestResume.createdAt,
        }
      : null,
  };

  const completedInterviews = interviews.filter((i) => i.status === "completed");
  const interviewData = {
    totalSessions: interviews.length,
    completedSessions: completedInterviews.length,
    avgScore:
      completedInterviews.length > 0
        ? Math.round(completedInterviews.reduce((a, b) => a + (b.overallScore || 0), 0) / completedInterviews.length)
        : 0,
    technicalCount: interviews.filter((i) => (i.rounds || []).some((r) => r.roundType === "technical")).length,
    systemDesignCount: interviews.filter((i) => (i.rounds || []).some((r) => r.roundType === "core")).length,
    hrCount: interviews.filter((i) => (i.rounds || []).some((r) => r.roundType === "hr")).length,
    aptitudeCount: interviews.filter((i) => (i.rounds || []).some((r) => r.roundType === "aptitude")).length,
    recentSessions: interviews.slice(0, 6).map((i) => ({
      id: i._id,
      title: i.title || "AI Mock Interview Session",
      overallScore: i.overallScore || 0,
      status: i.status,
      targetRole: i.targetRole || "Software Engineer",
      createdAt: i.createdAt,
    })),
  };

  if (!sd) {
    const fullChecklist = createDefaultChecklist(
      studentUser.name,
      studentUser.profile?.registerNumber,
      studentUser.profile?.department,
      studentUser.targetRole || studentUser.profile?.targetRole
    );
    const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(fullChecklist);
    const newDoc = await SuperDream.create({
      student: studentId,
      checklist: fullChecklist,
      codingPlatformsStats: realCodingStats,
      movementHistory: [],
      overallReadiness: totalObtained,
      tierName,
      activePhase,
      verifiedDeliverablesCount: verifiedCount,
    });
    sd = newDoc.toObject();
  } else {
    // Ensure all sections are populated and sync coding platforms
    const completedChecklist = ensureCompleteChecklist(sd.checklist, studentUser);
    completedChecklist.profile = {
      ...completedChecklist.profile,
      name: studentUser.name || completedChecklist.profile?.name || "",
      registerNumber: studentUser.profile?.registerNumber || completedChecklist.profile?.registerNumber || "",
      department: studentUser.profile?.department || completedChecklist.profile?.department || "",
      batch: studentUser.profile?.batch || completedChecklist.profile?.batch || "",
      currentSemester: studentUser.profile?.currentSemester || completedChecklist.profile?.currentSemester || "",
      targetRole: studentUser.targetRole || studentUser.profile?.targetRole || completedChecklist.profile?.targetRole || "",
    };

    // Dynamically sync Section 9 counters from real interview history if available
    if (completedInterviews.length > 0) {
      completedChecklist.section9InterviewPrep = (completedChecklist.section9InterviewPrep || []).map((item) => {
        if (item.id === "iv-1") return { ...item, current: Math.max(item.current || 0, interviewData.technicalCount) };
        if (item.id === "iv-2") return { ...item, current: Math.max(item.current || 0, interviewData.systemDesignCount) };
        if (item.id === "iv-3") return { ...item, current: Math.max(item.current || 0, interviewData.hrCount) };
        if (item.id === "iv-4") return { ...item, current: Math.max(item.current || 0, interviewData.aptitudeCount) };
        if (item.id === "iv-5") return { ...item, current: Math.max(item.current || 0, interviewData.completedSessions) };
        return item;
      });
    }

    sd.codingPlatformsStats = {
      ...(sd.codingPlatformsStats || {}),
      ...realCodingStats,
    };
    sd.checklist = syncSection3CodingChecklist(completedChecklist, sd.codingPlatformsStats);
    const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(sd.checklist);
    sd.overallReadiness = totalObtained;
    sd.tierName = tierName;
    sd.activePhase = activePhase;
    sd.verifiedDeliverablesCount = verifiedCount;
  }

  return ApiResponse.success({
    student: {
      _id: studentUser._id,
      name: studentUser.name,
      email: studentUser.email,
      avatar: resolveCandidateAvatar(studentUser),
      targetRole: studentUser.targetRole || studentUser.profile?.targetRole || "Software Engineer",
      githubUsername: studentUser.githubUsername,
      createdAt: studentUser.createdAt,
    },
    superDream: sd,
    resumeData,
    interviewData,
  }).send(res);
});

/**
 * POST /api/super-dream/student/:studentId/verify
 * (Mentor / Admin) Verifies a student's deliverable or certificate and updates score.
 */
const mentorVerifyDeliverable = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { sectionKey, itemId, verified, feedback, rating } = req.body;

  let sd = await SuperDream.findOne({ student: studentId });
  if (!sd) {
    throw ApiError.notFound("Super Dream record not found for student");
  }

  // Ensure complete checklist
  sd.checklist = ensureCompleteChecklist(sd.checklist);

  // Validate student submission existence before approving
  if (verified && sectionKey && itemId && sd.checklist[sectionKey]) {
    const targetItem = sd.checklist[sectionKey].find((item) => item.id === itemId);
    if (targetItem) {
      if (sectionKey === "section8Certifications") {
        const hasProof = Boolean(
          targetItem.credentialId ||
          targetItem.credentialUrl ||
          targetItem.certificatePdfUrl ||
          targetItem.certificatePdfName ||
          targetItem.status === "Completed"
        );
        if (!hasProof) {
          throw ApiError.badRequest(
            "Cannot verify certificate: Student has not submitted any credential ID, verification URL, or certificate document yet."
          );
        }
      } else if (sectionKey === "section4SoftwareDev") {
        const hasSubmission = Boolean(
          targetItem.githubUrl ||
          targetItem.repoUrl ||
          targetItem.liveUrl ||
          Number(targetItem.current) > 0 ||
          targetItem.status === "Completed"
        );
        if (!hasSubmission) {
          throw ApiError.badRequest(
            "Cannot verify deliverable: Student has not submitted any source repository, live demo URL, or completed work yet."
          );
        }
      } else if (sectionKey === "section5AiDataScience" || sectionKey === "section6CloudDevOps") {
        const hasProgress = Boolean(
          Number(targetItem.current) > 0 ||
          targetItem.repoUrl ||
          targetItem.liveUrl ||
          targetItem.status === "Completed"
        );
        if (!hasProgress) {
          throw ApiError.badRequest(
            "Cannot verify module: Student has not submitted any progress or architecture configuration yet."
          );
        }
      }
    }
  }

  // Update specific section item verification
  if (sectionKey && itemId && sd.checklist[sectionKey]) {
    sd.checklist[sectionKey] = sd.checklist[sectionKey].map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          verified: Boolean(verified),
          mentorFeedback: feedback || item.mentorFeedback,
          mentorRating: rating !== undefined ? Number(rating) : item.mentorRating,
          verifiedAt: new Date().toISOString(),
          verifiedBy: req.user.name || "Faculty Mentor",
        };
      }
      return item;
    });
  }

  // Check if item was in allocatedProjects
  if (sd.allocatedProjects) {
    sd.allocatedProjects = sd.allocatedProjects.map((p) => {
      if (p.id === itemId) {
        return {
          ...p,
          verified: Boolean(verified),
          mentorFeedback: feedback || p.mentorFeedback,
          mentorRating: rating !== undefined ? Number(rating) : p.mentorRating,
        };
      }
      return p;
    });
  }

  // Log real movement on behalf of mentor verification
  sd.movementHistory.unshift({
    actionType: "deliverable_updated",
    sectionId: 4,
    title: `Mentor Verified Deliverable: ${itemId}`,
    details: `Status: ${verified ? "Approved" : "Revision Requested"} • Feedback: "${feedback || "Verified by Mentor"}"`,
    metadata: { verifiedBy: req.user.name, verified },
    timestamp: new Date(),
  });

  const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(sd.checklist);
  sd.overallReadiness = totalObtained;
  sd.tierName = tierName;
  sd.activePhase = activePhase;
  sd.verifiedDeliverablesCount = verifiedCount;
  sd.lastActivityAt = new Date();

  sd.markModified("checklist");
  sd.markModified("allocatedProjects");
  sd.markModified("movementHistory");

  await sd.save();

  return ApiResponse.success({
    message: "Deliverable verified successfully",
    superDream: sd,
  }).send(res);
});

/**
 * POST /api/super-dream/student/:studentId/signoff
 * (Mentor / Admin) Mentor signs off the Section 10 Official Readiness Evaluation.
 */
const mentorSignoffEvaluation = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const {
    strengths,
    areasForImprovement,
    actionPlanNextSemester,
    recommendedLearningPaths,
    facultyMentorSignature,
    hodSignature,
  } = req.body;

  let sd = await SuperDream.findOne({ student: studentId });
  if (!sd) {
    throw ApiError.notFound("Super Dream record not found for student");
  }

  sd.checklist = ensureCompleteChecklist(sd.checklist);

  const today = new Date().toISOString().split("T")[0];

  sd.checklist.section10Evaluation = {
    ...sd.checklist.section10Evaluation,
    strengths: strengths ?? sd.checklist.section10Evaluation?.strengths ?? "",
    areasForImprovement: areasForImprovement ?? sd.checklist.section10Evaluation?.areasForImprovement ?? "",
    actionPlanNextSemester: actionPlanNextSemester ?? sd.checklist.section10Evaluation?.actionPlanNextSemester ?? "",
    recommendedLearningPaths: recommendedLearningPaths ?? sd.checklist.section10Evaluation?.recommendedLearningPaths ?? [],
    facultyMentorSignature: facultyMentorSignature || req.user.name || "Faculty Mentor",
    facultyMentorSignedDate: today,
    ...(hodSignature ? { hodSignature, hodSignedDate: today } : {}),
    reviewDate: today,
  };

  sd.movementHistory.unshift({
    actionType: "profile_updated",
    sectionId: 10,
    title: "Official Faculty Readiness Evaluation Signed Off",
    details: `Signed by ${req.user.name || "Faculty Mentor"} • Review Date: ${today}`,
    metadata: { signedBy: req.user.name },
    timestamp: new Date(),
  });

  const { totalObtained, tierName, activePhase, verifiedCount } = computeReadiness(sd.checklist);
  sd.overallReadiness = totalObtained;
  sd.tierName = tierName;
  sd.activePhase = activePhase;
  sd.verifiedDeliverablesCount = verifiedCount;
  sd.lastActivityAt = new Date();

  sd.markModified("checklist");
  sd.markModified("movementHistory");

  await sd.save();

  return ApiResponse.success({
    message: "Official evaluation signoff saved successfully",
    superDream: sd,
  }).send(res);
});

/**
 * DELETE /api/super-dream/reset
 * Deletes the student's Super Dream record completely, forcing a fresh clean start on next load.
 */
const resetMySuperDreamState = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  // Delete the entire Super Dream record from database
  const result = await SuperDream.deleteOne({ student: studentId });

  return ApiResponse.success({
    message: "Super Dream data reset successfully. All progress cleared to 0%.",
    deleted: result.deletedCount > 0,
  }).send(res);
});

module.exports = {
  getMySuperDreamState,
  syncMySuperDreamState,
  logSuperDreamMovement,
  getAdminSuperDreamCohort,
  assignSuperDreamMentee,
  unassignSuperDreamMentee,
  getAdminStudentSuperDream,
  mentorVerifyDeliverable,
  mentorSignoffEvaluation,
  resetMySuperDreamState,
};
