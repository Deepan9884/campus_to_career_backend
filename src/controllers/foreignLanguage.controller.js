const fs = require("fs");
const LanguageProfile = require("../models/LanguageProfile.model");
const StudyMaterial = require("../models/StudyMaterial.model");
const LanguageChat = require("../models/LanguageChat.model");
const LanguageCertificate = require("../models/LanguageCertificate.model");
const foreignLanguageService = require("../services/foreignLanguage.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const getProfile = asyncHandler(async (req, res) => {
  let profile = await LanguageProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = await LanguageProfile.create({ userId: req.user._id });
  }
  res.status(200).json(new ApiResponse(200, profile, "Profile fetched successfully"));
});

const updateProfile = asyncHandler(async (req, res) => {
  const { activeLanguage, targetExam, fluencyLevel, preferences } = req.body;
  
  let profile = await LanguageProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = new LanguageProfile({ userId: req.user._id });
  }

  if (activeLanguage) profile.activeLanguage = activeLanguage;
  if (targetExam) profile.targetExam = targetExam;
  if (fluencyLevel) profile.fluencyLevel = fluencyLevel;
  if (preferences) profile.preferences = { ...profile.preferences, ...preferences };

  await profile.save();
  res.status(200).json(new ApiResponse(200, profile, "Profile updated successfully"));
});

const uploadMaterial = asyncHandler(async (req, res) => {
  const { language, title, materialType } = req.body;
  
  if (!req.file) {
    throw new ApiError(400, "Please upload a study material file (PDF, DOCX, TXT)");
  }

  try {
    const material = await foreignLanguageService.processUploadedMaterial(
      req.user._id,
      req.file,
      language,
      title || req.file.originalname,
      materialType
    );
    
    // Clean up uploaded file from disk after successful parsing
    fs.unlinkSync(req.file.path);
    
    res.status(201).json(new ApiResponse(201, material, "Material uploaded and parsed successfully"));
  } catch (error) {
    // Clean up uploaded file on failure
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
});

const getMaterials = asyncHandler(async (req, res) => {
  const { language } = req.query;
  if (!language) throw new ApiError(400, "Language is required");

  const materials = await StudyMaterial.find({ userId: req.user._id, language });
  res.status(200).json(new ApiResponse(200, materials, "Materials fetched successfully"));
});

const toggleMaterialActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  
  const material = await StudyMaterial.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { isActive },
    { new: true }
  );
  
  if (!material) throw new ApiError(404, "Material not found");
  
  res.status(200).json(new ApiResponse(200, material, "Material status updated"));
});

const deleteMaterial = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const material = await StudyMaterial.findOneAndDelete({ _id: id, userId: req.user._id });
  
  if (!material) throw new ApiError(404, "Material not found");
  
  res.status(200).json(new ApiResponse(200, null, "Material deleted successfully"));
});

const chatWithMaterials = asyncHandler(async (req, res) => {
  const { language, message } = req.body;
  if (!language || !message) throw new ApiError(400, "Language and message are required");

  const result = await foreignLanguageService.handleLanguageChat(req.user._id, language, message);
  
  res.status(200).json(new ApiResponse(200, result, "Chat response generated successfully"));
});

const getChatHistory = asyncHandler(async (req, res) => {
  const { language } = req.query;
  if (!language) throw new ApiError(400, "Language is required");

  const chat = await LanguageChat.findOne({ userId: req.user._id, language })
    .populate("activeMaterials", "title fileType");
    
  res.status(200).json(new ApiResponse(200, chat || { messages: [] }, "Chat history fetched successfully"));
});

const generateQuiz = asyncHandler(async (req, res) => {
  const { language, targetExam } = req.body;
  if (!language || !targetExam) throw new ApiError(400, "Language and targetExam are required");

  const quizQuestions = await foreignLanguageService.generateExamQuiz(req.user._id, language, targetExam);

  res.status(200).json(new ApiResponse(200, quizQuestions, "Quiz generated successfully"));
});

const generateListening = asyncHandler(async (req, res) => {
  const { language, targetExam, topic } = req.body;
  if (!language || !targetExam) throw new ApiError(400, "Language and targetExam are required");

  const script = await foreignLanguageService.generateListeningScript(
    req.user._id,
    language,
    targetExam,
    topic
  );

  res.status(200).json(new ApiResponse(200, script, "Listening script generated successfully"));
});

// ── Certificates ──

const uploadCertificate = asyncHandler(async (req, res) => {
  const { language, examLevel, certificateTitle, issuer, status, score, credentialId, issuedDate, notes } = req.body;

  if (!certificateTitle) throw new ApiError(400, "Certificate title is required");

  const cert = await LanguageCertificate.create({
    userId: req.user._id,
    language: language || "Japanese",
    examLevel: examLevel || "N5",
    certificateTitle,
    issuer: issuer || "Other",
    status: status || "Completed",
    score: score || "",
    credentialId: credentialId || "",
    issuedDate: issuedDate || "",
    notes: notes || "",
    originalFileName: req.file ? req.file.originalname : "",
    fileType: req.file ? req.file.originalname.split(".").pop().toLowerCase() : "",
    fileSize: req.file ? req.file.size : 0,
  });

  res.status(201).json(new ApiResponse(201, cert, "Certificate saved successfully"));
});

const getCertificates = asyncHandler(async (req, res) => {
  const { language } = req.query;
  const filter = { userId: req.user._id };
  if (language) filter.language = language;

  const certs = await LanguageCertificate.find(filter).sort({ createdAt: -1 });
  res.status(200).json(new ApiResponse(200, certs, "Certificates fetched successfully"));
});

const deleteCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cert = await LanguageCertificate.findOneAndDelete({ _id: id, userId: req.user._id });

  if (!cert) throw new ApiError(404, "Certificate not found");

  res.status(200).json(new ApiResponse(200, null, "Certificate deleted successfully"));
});

module.exports = {
  getProfile,
  updateProfile,
  uploadMaterial,
  getMaterials,
  toggleMaterialActive,
  deleteMaterial,
  chatWithMaterials,
  getChatHistory,
  generateQuiz,
  generateListening,
  uploadCertificate,
  getCertificates,
  deleteCertificate,
};
