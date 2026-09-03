const crypto = require("crypto");

// Encryption configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // AES block size
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Get encryption key from environment
 * @returns {string}
 */
function getEncryptionKey() {
  let key = process.env.ENCRYPTION_KEY;
  if (!key) {
    const seed = process.env.JWT_SECRET || "c2c_default_secure_encryption_seed_2026";
    key = crypto.createHash("sha256").update(seed).digest("hex");
    process.env.ENCRYPTION_KEY = key;
  }
  if (key.length < 32) {
    key = crypto.createHash("sha256").update(key).digest("hex");
    process.env.ENCRYPTION_KEY = key;
  }
  return key;
}

/**
 * Derive a key from password using PBKDF2
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Buffer}
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: salt:iv:encrypted:tag (all hex encoded)
 */
function encrypt(text) {
  if (!text || typeof text !== "string") {
    return text; // Return as-is if not a string
  }

  try {
    const masterKey = getEncryptionKey();
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(masterKey, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    // Format: salt:iv:encrypted:tag
    return `${salt.toString("hex")}:${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
  } catch (err) {
    console.error("[Encryption] Error encrypting data:", err.message);
    throw new Error("Encryption failed");
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted text in format: salt:iv:encrypted:tag
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== "string") {
    return encryptedText; // Return as-is if not a string
  }

  // Check if it's encrypted (contains colons)
  if (!encryptedText.includes(":")) {
    return encryptedText; // Not encrypted, return as-is
  }

  try {
    const masterKey = getEncryptionKey();
    const parts = encryptedText.split(":");

    if (parts.length !== 4) {
      console.warn("[Encryption] Invalid encrypted format, returning as-is");
      return encryptedText;
    }

    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const tag = Buffer.from(parts[3], "hex");

    const key = deriveKey(masterKey, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("[Encryption] Error decrypting data:", err.message);
    throw new Error("Decryption failed");
  }
}

/**
 * Check if a value is encrypted
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 4 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/**
 * Encrypt sensitive fields in an object
 * @param {Object} obj - Object with fields to encrypt
 * @param {string[]} fields - Array of field names to encrypt
 * @returns {Object} - Object with encrypted fields
 */
function encryptFields(obj, fields) {
  const result = { ...obj };

  for (const field of fields) {
    if (field.includes(".")) {
      // Handle nested fields (e.g., "profile.registerNumber")
      const parts = field.split(".");
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }

      const lastKey = parts[parts.length - 1];
      if (current[lastKey] && !isEncrypted(current[lastKey])) {
        current[lastKey] = encrypt(current[lastKey]);
      }
    } else {
      // Handle top-level fields
      if (result[field] && !isEncrypted(result[field])) {
        result[field] = encrypt(result[field]);
      }
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in an object
 * @param {Object} obj - Object with encrypted fields
 * @param {string[]} fields - Array of field names to decrypt
 * @returns {Object} - Object with decrypted fields
 */
function decryptFields(obj, fields) {
  const result = { ...obj };

  for (const field of fields) {
    if (field.includes(".")) {
      // Handle nested fields
      const parts = field.split(".");
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) return result;
        current = current[parts[i]];
      }

      const lastKey = parts[parts.length - 1];
      if (current[lastKey] && isEncrypted(current[lastKey])) {
        current[lastKey] = decrypt(current[lastKey]);
      }
    } else {
      // Handle top-level fields
      if (result[field] && isEncrypted(result[field])) {
        result[field] = decrypt(result[field]);
      }
    }
  }

  return result;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptFields,
  decryptFields,
  getEncryptionKey, // For validation
};
