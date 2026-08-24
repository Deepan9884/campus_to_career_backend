const multer = require("multer");
const path = require("path");

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/octet-stream",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function fileFilter(_req, file, cb) {
  const safeName = file.originalname.replace(/[\0\r\n]/g, "");
  const ext = path.extname(safeName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err = new Error(`Only .pdf, .jpg, .jpeg, .webp and .png files are allowed. Received: ${ext}`);
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = { upload, MAX_FILE_SIZE, ALLOWED_EXTENSIONS };
