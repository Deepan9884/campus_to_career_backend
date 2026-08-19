const fs = require("fs");

/**
 * Validates the magic bytes (file signature) of a file on disk against its allowed extension.
 * @param {string} filePath - Absolute or relative path to the file.
 * @param {string[]} allowedExtensions - e.g. [".pdf", ".docx", ".jpg", ".jpeg", ".png"]
 * @returns {boolean} True if file magic bytes match an allowed format.
 */
function validateFileMagicBytes(filePath, allowedExtensions = []) {
  if (!fs.existsSync(filePath)) return false;

  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
  const isZipOrDocx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04; // PK..
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff; // ÿØÿ
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47; // ‰PNG

  const exts = allowedExtensions.map((e) => e.toLowerCase());

  if (isPdf && exts.includes(".pdf")) return true;
  if (isZipOrDocx && exts.includes(".docx")) return true;
  if (isJpeg && (exts.includes(".jpg") || exts.includes(".jpeg"))) return true;
  if (isPng && exts.includes(".png")) return true;

  // If no allowedExtensions provided, return true if matches any recognized safe format
  if (allowedExtensions.length === 0) {
    return isPdf || isZipOrDocx || isJpeg || isPng;
  }

  return false;
}

module.exports = {
  validateFileMagicBytes,
};
