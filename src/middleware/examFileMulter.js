const multer = require("multer");
const path = require("path");
const os = require("os");

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "application/octet-stream",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function fileFilter(_req, file, cb) {
  const safeName = file.originalname.replace(/[\0\r\n]/g, "");
  const ext = path.extname(safeName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err = new Error(`Only .pdf, .docx, and .txt files are allowed. Received: ${ext}`);
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }

  if (file.mimetype && !ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    const err = new Error(`Invalid file MIME type: ${file.mimetype}`);
    err.code = "INVALID_MIME_TYPE";
    return cb(err, false);
  }

  cb(null, true);
}

const examUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname.replace(/[\0\r\n]/g, "")).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `exam-doc-${unique}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = { examUpload, MAX_FILE_SIZE, ALLOWED_EXTENSIONS };
