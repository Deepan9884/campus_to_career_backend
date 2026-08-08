const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const uploadDir = path.join(__dirname, "../../uploads/certificates");

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err = new Error(`Only .pdf, .jpg, .jpeg, and .png files are allowed. Received: ${ext}`);
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
}

// INTERIM: local disk storage as a placeholder. Real persistent storage strategy (cloud vs. disk) is a separate decision pending discussion — see project notes.
const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename(_req, file, cb) {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = { upload, MAX_FILE_SIZE, ALLOWED_EXTENSIONS, uploadDir };
