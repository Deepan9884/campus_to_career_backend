/**
 * Live proctoring real-life behavior tests.
 *
 * Covers the admin live-proctoring radar + results completeness fixes:
 *  1. Candidates who START an exam get an in_progress session (take endpoint).
 *  2. Heartbeat refreshes live presence without touching finalized papers.
 *  3. Live feed reports true actives (fresh heartbeat), submitted/today counts,
 *     keeps recently finished exams visible, and normalizes violation details.
 *  4. stopExam notifies EVERY candidate (no early abort on email errors).
 */

// ── Model mocks ─────────────────────────────────────────────────────────────
jest.mock("../src/models/Exam.model", () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock("../src/models/ExamSubmission.model", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  distinct: jest.fn(),
}));
jest.mock("../src/models/User.model", () => ({
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock("../src/models/ProctoringViolation.model", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock("../src/models/Notification.model", () => ({ create: jest.fn() }));

// ── Service mocks (avoid Redis/AI heavy init at require time) ───────────────
jest.mock("../src/services/notification.service", () => ({
  pushToOpenConnections: jest.fn(),
}));
jest.mock("../src/services/email.service", () => ({
  sendProctoringBlockedEmail: jest.fn(),
  sendProctoringUnblockedEmail: jest.fn(),
}));
jest.mock("../src/services/ai.service", () => ({ generateContent: jest.fn() }));
jest.mock("../src/services/compiler.service", () => ({ executeCode: jest.fn() }));
jest.mock("../src/services/questionBank.service", () => ({}));
jest.mock("../src/services/cache.service", () => ({}));
jest.mock("../src/services/careerReadiness.service", () => ({}));
jest.mock("../src/services/encryption.service", () => ({
  decrypt: jest.fn((v) => v),
  isEncrypted: () => false,
}));
jest.mock("../src/middleware/auth.middleware", () => ({
  invalidateUserCache: jest.fn(),
}));
jest.mock("../src/services/proctoringBlock.service", () => ({
  evaluateAndAutoUnblockUser: jest.fn(),
}));

const Exam = require("../src/models/Exam.model");
const ExamSubmission = require("../src/models/ExamSubmission.model");
const User = require("../src/models/User.model");
const ProctoringViolation = require("../src/models/ProctoringViolation.model");
const Notification = require("../src/models/Notification.model");
const notificationService = require("../src/services/notification.service");
const emailService = require("../src/services/email.service");
const {
  evaluateAndAutoUnblockUser,
} = require("../src/services/proctoringBlock.service");

const adminController = require("../src/controllers/admin.controller");
const examController = require("../src/controllers/exam.controller");

// ── Helpers ─────────────────────────────────────────────────────────────────
const flush = async (ticks = 12) => {
  for (let i = 0; i < ticks; i += 1) {
    // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
    await new Promise((r) => setImmediate(r));
  }
};

// Mongoose query stub that is both awaitable (resolves to docs) and chainable.
function thenableChain(docs) {
  return {
    select: () => thenableChain(docs),
    populate: () => thenableChain(docs),
    sort: () => ({ exec: () => Promise.resolve(docs) }),
    limit: () => thenableChain(docs),
    lean: () => Promise.resolve(docs),
    exec: () => Promise.resolve(docs),
    then: (resolve) => resolve(docs),
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

// Mongoose-style query chain: .select().populate().sort().limit().lean()
function chain(result) {
  const lean = jest.fn().mockResolvedValue(result);
  const exec = jest.fn().mockResolvedValue(result);
  const limit = jest.fn().mockReturnValue({ lean, exec });
  const sort = jest.fn().mockReturnValue({ limit, lean, exec });
  const populate = jest.fn().mockReturnValue({ sort, limit, lean, exec });
  const select = jest.fn().mockReturnValue({ populate, sort, limit, lean, exec });
  return { select, populate, sort, limit, lean, exec };
}

const oid = (n) => `0000000000000000000000${String(n).padStart(2, "0")}`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/admin/proctoring/live-feed", () => {
  test("reports true actives via heartbeat, submitted/today counts, keeps recent finished exams", async () => {
    const now = Date.now();
    const activeExam = {
      _id: oid(11),
      title: "Live Midterm",
      examType: "mcq",
      category: "General",
      difficulty: "medium",
      durationMinutes: 60,
      status: "active",
    };
    const recentStopped = {
      _id: oid(12),
      title: "Morning Quiz",
      examType: "mcq",
      category: "General",
      difficulty: "medium",
      durationMinutes: 30,
      status: "stopped",
      updatedAt: new Date(now - 60 * 60 * 1000),
      stoppedAt: new Date(now - 60 * 60 * 1000),
    };
    const oldStopped = {
      _id: oid(13),
      title: "Ancient Quiz",
      examType: "mcq",
      category: "General",
      difficulty: "medium",
      durationMinutes: 30,
      status: "stopped",
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      stoppedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    };

    // Emulate MongoDB: only active/scheduled + recently finished exams match.
    Exam.find.mockImplementation((query) => {
      const gtes = [];
      JSON.stringify(query || {}, (k, v) => {
        if (k === "$gte") gtes.push(new Date(v).getTime());
        return v;
      });
      const cutoff = gtes.length ? Math.max(...gtes) : 0;
      const filtered = [activeExam, recentStopped, oldStopped].filter((e) => {
        if (["active", "scheduled"].includes(e.status)) return true;
        if (["completed", "stopped"].includes(e.status)) {
          return [e.updatedAt, e.stoppedAt]
            .filter(Boolean)
            .some((d) => new Date(d).getTime() >= cutoff);
        }
        return false;
      });
      return chain(filtered);
    });
    User.find.mockReturnValue(chain([]));
    ProctoringViolation.find.mockReturnValue(chain([]));
    User.countDocuments.mockResolvedValue(0);

    const freshWriter = {
      _id: oid(21),
      examId: oid(11),
      userId: { _id: oid(31), name: "Active Amy", email: "amy@x.com" },
      studentName: "Active Amy",
      status: "in_progress",
      isBlocked: false,
      violationsCount: 0,
      violationDetails: [],
      proctoringIntegrity: 100,
      totalScore: 0,
      durationSeconds: 100,
      submittedAt: null,
      updatedAt: new Date(now - 30 * 1000),
    };
    const staleWriter = {
      _id: oid(22),
      examId: oid(11),
      userId: { _id: oid(32), name: "Ghost Gary", email: "gary@x.com" },
      studentName: "Ghost Gary",
      status: "in_progress",
      isBlocked: false,
      violationsCount: 0,
      violationDetails: [],
      proctoringIntegrity: 100,
      totalScore: 0,
      durationSeconds: 50,
      submittedAt: null,
      // stale heartbeat AND seen yesterday -> neither active nor today
      updatedAt: new Date(now - 26 * 60 * 60 * 1000),
    };
    const finisher = {
      _id: oid(23),
      examId: oid(11),
      userId: { _id: oid(33), name: "Done Dan", email: "dan@x.com" },
      studentName: "Done Dan",
      status: "submitted",
      isBlocked: false,
      violationsCount: 1,
      violationDetails: ["Tab Switch / Window Unfocused strike"],
      proctoringIntegrity: 67,
      totalScore: 80,
      durationSeconds: 900,
      submittedAt: new Date(now - 2 * 60 * 60 * 1000),
      updatedAt: new Date(now - 2 * 60 * 60 * 1000),
    };
    const blocked = {
      _id: oid(24),
      examId: oid(11),
      userId: { _id: oid(34), name: "Blocked Bob", email: "bob@x.com" },
      studentName: "Blocked Bob",
      status: "disqualified",
      isBlocked: true,
      violationsCount: 3,
      violationDetails: [],
      proctoringIntegrity: 0,
      totalScore: 0,
      durationSeconds: 200,
      submittedAt: null,
      updatedAt: new Date(now - 30 * 60 * 1000),
    };
    const oldFinisher = {
      _id: oid(25),
      examId: oid(12),
      userId: { _id: oid(35), name: "Old Olive", email: "olive@x.com" },
      studentName: "Old Olive",
      status: "submitted",
      isBlocked: false,
      violationsCount: 0,
      violationDetails: [],
      proctoringIntegrity: 100,
      totalScore: 70,
      durationSeconds: 800,
      submittedAt: new Date(now - 3 * 60 * 60 * 1000),
      updatedAt: new Date(now - 3 * 60 * 60 * 1000),
    };
    ExamSubmission.find.mockReturnValue(
      chain([freshWriter, staleWriter, finisher, blocked, oldFinisher])
    );

    const res = mockRes();
    const next = jest.fn();
    adminController.getLiveProctoringFeed({}, res, next);
    await flush();
    expect(next).not.toHaveBeenCalled();

    const data = res.body.data;
    // Old stopped exam (5 days) is excluded; recent stopped exam stays visible
    expect(data.examsWithTakers.map((e) => String(e.examId))).toEqual(
      expect.arrayContaining([oid(11), oid(12)])
    );
    expect(data.examsWithTakers.map((e) => String(e.examId))).not.toContain(oid(13));

    const live = data.examsWithTakers.find((e) => String(e.examId) === oid(11));
    // Only the fresh heartbeat counts as online right now
    expect(live.activeCount).toBe(1);
    expect(live.submittedCount).toBe(1);
    // fresh + finisher + blocked seen today; stale ghost seen yesterday
    expect(live.todayCount).toBe(3);
    expect(live.blockedCount).toBe(1);

    const byName = Object.fromEntries(live.candidates.map((c) => [c.name, c]));
    expect(byName["Active Amy"].isActiveNow).toBe(true);
    expect(byName["Ghost Gary"].isActiveNow).toBe(false);
    expect(byName["Done Dan"].isSubmitted).toBe(true);
    // Stored string violation details are normalized for the telemetry pills
    expect(byName["Done Dan"].violationDetails[0].violationType).toBe("tab_switch");

    expect(data.totalActiveCandidates).toBe(1);
    expect(data.totalTodayCandidates).toBe(4);
  });
});

describe("POST /api/exams/student/:examId/heartbeat", () => {
  test("returns tracked:false when no session exists", async () => {
    ExamSubmission.findOne.mockResolvedValue(null);
    const res = mockRes();
    const next = jest.fn();
    examController.postExamHeartbeat(
      { params: { examId: oid(11) }, user: { _id: oid(31) }, body: {} },
      res,
      next
    );
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.data.tracked).toBe(false);
    expect(ExamSubmission.updateOne).not.toHaveBeenCalled();
  });

  test("refreshes in_progress sessions and max-merges violations", async () => {
    ExamSubmission.findOne.mockResolvedValue({
      _id: oid(21),
      status: "in_progress",
      violationsCount: 1,
      violationDetails: ["prior strike"],
    });
    ExamSubmission.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const res = mockRes();
    const next = jest.fn();
    examController.postExamHeartbeat(
      {
        params: { examId: oid(11) },
        user: { _id: oid(31) },
        body: { durationSeconds: 120, violationsCount: 0, violationDetails: [] },
      },
      res,
      next
    );
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.data.tracked).toBe(true);
    const updateArg = ExamSubmission.updateOne.mock.calls[0][1].$set;
    expect(updateArg.updatedAt).toBeInstanceOf(Date);
    // stale 0 from client must not wipe the stored count
    expect(updateArg.violationsCount).toBe(1);
    expect(updateArg.durationSeconds).toBe(120);
  });

  test("self-heals a missing session for an authorized candidate", async () => {
    ExamSubmission.findOne
      .mockResolvedValueOnce(null) // no session yet
      .mockResolvedValueOnce(null);
    const exam = {
      _id: oid(11),
      isPublished: true,
      status: "active",
      isScheduled: false,
      targetAudience: "all",
      allowRetakes: false,
      totalMarks: 100,
    };
    const ExamModel = require("../src/models/Exam.model");
    ExamModel.findById.mockReturnValue({ lean: () => Promise.resolve(exam) });
    evaluateAndAutoUnblockUser.mockResolvedValue({ isBlocked: false });
    const UserModel = require("../src/models/User.model");
    UserModel.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: "Amy", email: "amy@x.com" }) }),
    });
    const healed = { _id: oid(21), status: "in_progress", violationsCount: 0, violationDetails: [] };
    ExamSubmission.findOneAndUpdate.mockResolvedValue(healed);
    ExamSubmission.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = mockRes();
    const next = jest.fn();
    examController.postExamHeartbeat(
      {
        params: { examId: oid(11) },
        user: { _id: oid(31), role: "student" },
        body: { durationSeconds: 10 },
      },
      res,
      next
    );
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.data.tracked).toBe(true);
    expect(ExamSubmission.findOneAndUpdate).toHaveBeenCalled();
  });

  test("refuses to heal sessions for unauthorized students", async () => {
    ExamSubmission.findOne.mockResolvedValue(null);
    const exam = {
      _id: oid(11),
      isPublished: true,
      status: "active",
      isScheduled: false,
      targetAudience: "selected",
      assignedStudents: [],
      allowRetakes: false,
      totalMarks: 100,
    };
    const ExamModel = require("../src/models/Exam.model");
    ExamModel.findById.mockReturnValue({ lean: () => Promise.resolve(exam) });
    evaluateAndAutoUnblockUser.mockResolvedValue({ isBlocked: false });

    const res = mockRes();
    const next = jest.fn();
    examController.postExamHeartbeat(
      {
        params: { examId: oid(11) },
        user: { _id: oid(99), role: "student" },
        body: {},
      },
      res,
      next
    );
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.data.tracked).toBe(false);
    expect(ExamSubmission.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("never touches finalized papers", async () => {
    ExamSubmission.findOne.mockResolvedValue({
      _id: oid(23),
      status: "submitted",
      totalScore: 80,
    });
    const res = mockRes();
    const next = jest.fn();
    examController.postExamHeartbeat(
      { params: { examId: oid(11) }, user: { _id: oid(33) }, body: {} },
      res,
      next
    );
    await flush();
    expect(res.body.data.tracked).toBe(false);
    expect(ExamSubmission.updateOne).not.toHaveBeenCalled();
  });
});

describe("GET /api/exams/student/:examId (take) session tracking", () => {
  test("creates an in_progress session without overwriting existing data", async () => {
    const exam = {
      _id: oid(11),
      title: "Live Midterm",
      isPublished: true,
      status: "active",
      targetAudience: "all",
      allowRetakes: false,
      totalMarks: 100,
      sections: [],
    };
    // findById(...).lean() chain
    Exam.findById.mockReturnValue({ lean: () => Promise.resolve(exam) });
    ExamSubmission.findOne.mockResolvedValue(null);
    evaluateAndAutoUnblockUser.mockResolvedValue({ isBlocked: false });
    User.findById.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            name: "Active Amy",
            email: "amy@x.com",
            avatar: "",
            profile: { registerNumber: "REG1" },
          }),
      }),
    });
    ExamSubmission.updateOne.mockResolvedValue({ upsertedCount: 1 });

    const res = mockRes();
    const next = jest.fn();
    examController.getStudentExamForTaking(
      { params: { examId: oid(11) }, user: { _id: oid(31), name: "Amy" } },
      res,
      next
    );
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(ExamSubmission.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = ExamSubmission.updateOne.mock.calls[0];
    expect(String(filter.userId)).toBe(oid(31));
    expect(options.upsert).toBe(true);
    expect(update.$setOnInsert.status).toBe("in_progress");
    expect(update.$setOnInsert.totalScore).toBe(0);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(res.body.message).toMatch(/ready/i);
  });
});

describe("stopExam fan-out notifications", () => {
  test("notifies every candidate even if one email fails", async () => {
    const save = jest.fn().mockResolvedValue(true);
    Exam.findById.mockResolvedValue({
      _id: oid(11),
      title: "Live Midterm",
      status: "active",
      isPublished: true,
      save,
    });
    ExamSubmission.find.mockReturnValue(thenableChain([]));
    ExamSubmission.distinct.mockResolvedValue([oid(31), oid(32)]);
    Notification.create.mockResolvedValue({ _id: oid(99) });
    User.findById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: "Amy", email: "amy@x.com" }),
      }),
    });
    emailService.sendProctoringBlockedEmail
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce({ ok: true });
    notificationService.pushToOpenConnections.mockReturnValue(undefined);

    const res = mockRes();
    const next = jest.fn();
    examController.stopExam(
      { params: { examId: oid(11) }, user: { _id: oid(1), name: "Mentor" } },
      res,
      next
    );
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(Notification.create).toHaveBeenCalledTimes(2);
    expect(res.body.data.status).toBe("stopped");
  });
});
