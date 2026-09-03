const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");
const mammoth = require("mammoth");

const Resume = require("../models/Resume.model");
const aiService = require("../services/ai.service");
const notificationService = require("../services/notification.service");
const activityLogService = require("../services/activityLog.service");
const badgeService = require("../services/badge.service");
const queueService = require("../services/queue.service");
const { validateFileMagicBytes } = require("../utils/fileValidation");
const { sanitizePromptInput } = require("../utils/promptSanitizer");
const { buildAnalysisPrompt } = require("../utils/resumeAnalysisPrompt");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

/**
 * Extract text from a PDF file using pdf2json.
 */
function extractPdfText(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataError", (err) => {
      reject(new Error(err?.parserError || "Failed to parse PDF"));
    });
    parser.on("pdfParser_dataReady", (pdfData) => {
      try {
        const texts = [];
        pdfData.Pages.forEach((page) => {
          page.Texts.forEach((t) => {
            t.R.forEach((r) => {
              try {
                texts.push(decodeURIComponent(r.T));
              } catch {
                texts.push(r.T);
              }
            });
          });
        });
        resolve(texts.join(" "));
      } catch (e) {
        reject(new Error("Failed to extract text from PDF: " + e.message));
      }
    });
    parser.loadPDF(filePath);
  });
}

/**
 * Extract text from a file on disk.
 * Returns the extracted string, or throws if extraction fails / text too short.
 */
async function extractTextFromFile(filePath, ext) {
  let text;
  if (ext === ".pdf") {
    text = await extractPdfText(filePath);
  } else if (ext === ".docx") {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const trimmed = (text || "").trim();
  if (trimmed.length < 100) {
    throw Object.assign(
      new Error(
        "Extracted text is too short (under 100 characters). The file may be a scanned image or empty.",
      ),
      { code: "TEXT_TOO_SHORT" },
    );
  }

  return trimmed;
}

/**
 * POST /api/resume/upload
 * Upload a resume PDF/DOCX, extract text, analyze via Gemini, return results.
 */
const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("No file uploaded. Please attach a .pdf or .docx file.");
  }

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const targetRole = req.body.targetRole || null;

  // Validate magic bytes to prevent spoofed/polyglot files
  if (!validateFileMagicBytes(filePath, [ext])) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
    throw ApiError.badRequest("Invalid file signature. The file contents do not match a valid PDF or DOCX file.");
  }

  try {
    const extractedText = await extractTextFromFile(filePath, ext);

    const resume = await Resume.create({
      user: req.user._id,
      filename: req.file.originalname,
      extractedText,
      targetRole,
      status: "processing",
    });

    const jobData = {
      resumeId: resume._id.toString(),
      extractedText,
      targetRole,
      userId: req.user._id.toString(),
    };

    const { processResumeAnalysis } = require("../workers/resume.worker");
    await processResumeAnalysis(jobData);

    const updatedResume = await Resume.findById(resume._id);
    return ApiResponse.success(updatedResume).send(res);
  } catch (error) {
    if (error.statusCode) throw error;

    // Handle extraction failures gracefully
    if (error.code === "TEXT_TOO_SHORT" || error.message?.includes("Extracted text")) {
      await Resume.create({
        user: req.user._id,
        filename: req.file.originalname,
        extractedText: "",
        targetRole: targetRole || null,
        status: "failed",
        errorMessage: error.message,
      });

      throw ApiError.badRequest(error.message);
    }

    // Unknown extraction error
    await Resume.create({
      user: req.user._id,
      filename: req.file.originalname,
      extractedText: "",
      targetRole: targetRole || null,
      status: "failed",
      errorMessage: error.message || "Failed to extract text from file",
    });

    if (
      error.message?.includes("corrupt") ||
      error.message?.includes("invalid PDF") ||
      error.message?.includes("not a valid")
    ) {
      throw ApiError.badRequest(
        "Unable to read the file. It may be corrupted or in an unsupported format.",
      );
    }

    throw error;
  } finally {
    // Always clean up the temp file
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Silently ignore cleanup failures
    }
  }
});

/**
 * GET /api/resume/history
 * List past analyses for the current user (summary fields only).
 */
const getResumeHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [resumes, total] = await Promise.all([
    Resume.find({ user: req.user._id })
      .select("filename atsScore status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Resume.countDocuments({ user: req.user._id }),
  ]);

  return ApiResponse.success({
    resumes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }).send(res);
});

/**
 * GET /api/resume/:id
 * Get full analysis detail for one resume (must belong to user).
 */
const getResumeById = asyncHandler(async (req, res) => {
  const resume = await Resume.findById(req.params.id);

  if (!resume || resume.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Resume not found");
  }

  return ApiResponse.success(resume).send(res);
});

/**
 * DELETE /api/resume/:id
 * Delete a resume analysis (must belong to user).
 */
const deleteResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findById(req.params.id);

  if (!resume || resume.user.toString() !== req.user._id.toString()) {
    throw ApiError.notFound("Resume not found");
  }

  await Resume.findByIdAndDelete(req.params.id);

  return ApiResponse.success(null, "Resume analysis deleted").send(res);
});

/**
 * POST /api/resume/improve-bullet
 * Improve a specific bullet point using AI.
 */
const improveBulletPoint = asyncHandler(async (req, res) => {
  const { bulletPoint, role } = req.body;
  if (!bulletPoint) {
    throw ApiError.badRequest("Bullet point text is required");
  }

  const safeBullet = sanitizePromptInput(bulletPoint, 1000);
  const safeRole = role ? sanitizePromptInput(role, 100) : "";

  const prompt = `You are an expert resume writer and career coach. The user wants to improve a bullet point on their resume.
${safeRole ? `Their target role is: [User-provided target role: \`\`\`${safeRole}\`\`\`]` : ""}

Original bullet point:
"""
${safeBullet}
"""

Please rewrite this bullet point to be more impactful, using strong action verbs, quantifiable metrics where possible, and focusing on the value delivered. Make it sound professional and ATS-friendly.
Return your response as a JSON object exactly matching this schema:
{
  "improved": "The single best rewritten version of the bullet point"
}`;

  const result = await aiService.generateContent({
    prompt,
    responseSchema: {
      type: "object",
      properties: {
        improved: { type: "string" },
      },
      required: ["improved"],
    },
    feature: "resume_improve_bullet",
    userId: req.user._id,
  });

  if (!result.success || !result.data) {
    throw ApiError.internal(result.message || "Failed to generate improved bullet point");
  }

  const parsed = typeof result.data === "object" ? result.data : { improved: result.data };

  return ApiResponse.success(parsed, "Bullet point improved").send(res);
});

module.exports = {
  uploadResume,
  getResumeHistory,
  getResumeById,
  deleteResume,
  improveBulletPoint,
  buildAnalysisPrompt,
};
