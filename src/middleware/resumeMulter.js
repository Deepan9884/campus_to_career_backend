const multer = require("multer");
const path = require("path");
const os = require("os");

const ALLOWED_EXTENSIONS = [".pdf", ".docx"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err = new Error(`Only .pdf and .docx files are allowed. Received: ${ext}`);
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename(_req, file, cb) {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = { upload, MAX_FILE_SIZE, ALLOWED_EXTENSIONS };
