const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const foreignLanguageController = require("../controllers/foreignLanguage.controller");
const verifyJWT = require("../middleware/auth.middleware");

const router = Router();

// Set up multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../../uploads/temp");
    // Ensure directory exists
    const fs = require("fs");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".pdf" && ext !== ".docx" && ext !== ".txt" && ext !== ".md") {
      return cb(new Error("Only PDF, DOCX, TXT, and MD files are allowed"));
    }
    cb(null, true);
  },
});

const certUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx"].includes(ext)) {
      return cb(new Error("Certificate must be PDF, PNG, JPG, WEBP or DOCX"));
    }
    cb(null, true);
  },
});

router.use(verifyJWT);

// Profile
router.get("/profile", foreignLanguageController.getProfile);
router.put("/profile", foreignLanguageController.updateProfile);

// Materials
router.post("/materials", upload.single("file"), foreignLanguageController.uploadMaterial);
router.get("/materials", foreignLanguageController.getMaterials);
router.patch("/materials/:id/active", foreignLanguageController.toggleMaterialActive);
router.delete("/materials/:id", foreignLanguageController.deleteMaterial);

// Chat
router.post("/chat", foreignLanguageController.chatWithMaterials);
router.get("/chat", foreignLanguageController.getChatHistory);

// Quiz
router.post("/quiz", foreignLanguageController.generateQuiz);

// Listening (AI exam-style script + questions)
router.post("/listening", foreignLanguageController.generateListening);

// Certificates
router.post("/certificates", certUpload.single("file"), foreignLanguageController.uploadCertificate);
router.get("/certificates", foreignLanguageController.getCertificates);
router.delete("/certificates/:id", foreignLanguageController.deleteCertificate);

module.exports = router;
