const mongoose = require("mongoose");
const Batch = require("../models/Batch.model");
const User = require("../models/User.model");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const isAdmin = (req) => req.user && req.user.role === "admin";

// Mentors see only their own batches; admins see everything.
const scopeFilter = (req) => (isAdmin(req) ? {} : { createdBy: req.user._id });

const batchSummaryProjection = "name email profile.registerNumber targetRole";

async function withMembers(batch) {
  const obj = batch.toObject ? batch.toObject() : batch;
  const members = await User.find({ _id: { $in: obj.studentIds || [] } })
    .select(batchSummaryProjection)
    .lean();
  return { ...obj, studentCount: (obj.studentIds || []).length, members };
}

// Keep only IDs that belong to real student accounts.
async function resolveStudentIds(rawIds) {
  const ids = Array.from(
    new Set((Array.isArray(rawIds) ? rawIds : []).map((id) => String(id).trim()).filter(Boolean))
  ).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (ids.length === 0) return [];
  const found = await User.find({ _id: { $in: ids }, role: "student" }).distinct("_id");
  return found.map((id) => id.toString());
}

/**
 * GET /api/admin/batches — list saved batches (own scope; all for admins).
 */
const listBatches = asyncHandler(async (req, res) => {
  const batches = await Batch.find(scopeFilter(req)).sort({ updatedAt: -1 }).lean();
  const withCounts = batches.map((b) => ({ ...b, studentCount: (b.studentIds || []).length }));
  return ApiResponse.success({ batches: withCounts }).send(res);
});

/**
 * GET /api/admin/batches/:id — single batch with member details.
 */
const getBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }
  return ApiResponse.success({ batch: await withMembers(batch) }).send(res);
});

/**
 * POST /api/admin/batches — save current selection as a reusable batch.
 */
const createBatch = asyncHandler(async (req, res) => {
  const { name, description = "", studentIds = [] } = req.body;

  if (!name || !String(name).trim()) {
    throw new ApiError(400, "Batch name is required");
  }

  const resolved = await resolveStudentIds(studentIds);
  if (resolved.length === 0) {
    throw new ApiError(400, "Add at least one valid student to the batch");
  }

  try {
    const batch = await Batch.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
      studentIds: resolved,
      createdBy: req.user._id,
    });
    return ApiResponse.created({ batch: await withMembers(batch) }).send(res);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, "You already have a batch with this name");
    }
    throw err;
  }
});

/**
 * PATCH /api/admin/batches/:id — rename / edit members / update description.
 */
const updateBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  const { name, description, studentIds } = req.body;
  if (name !== undefined) {
    if (!String(name).trim()) {
      throw new ApiError(400, "Batch name cannot be empty");
    }
    batch.name = String(name).trim();
  }
  if (description !== undefined) {
    batch.description = String(description || "").trim();
  }
  if (studentIds !== undefined) {
    const resolved = await resolveStudentIds(studentIds);
    if (resolved.length === 0) {
      throw new ApiError(400, "A batch must contain at least one valid student");
    }
    batch.studentIds = resolved;
  }

  try {
    await batch.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, "You already have a batch with this name");
    }
    throw err;
  }
  return ApiResponse.success({ batch: await withMembers(batch) }).send(res);
});

/**
 * DELETE /api/admin/batches/:id — delete a saved batch.
 * Published exams keep their snapshotted assignedStudents; only the reusable
 * group definition is removed.
 */
const deleteBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findOneAndDelete({ _id: req.params.id, ...scopeFilter(req) });
  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }
  return ApiResponse.success(null, "Batch deleted").send(res);
});

module.exports = {
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  deleteBatch,
};
