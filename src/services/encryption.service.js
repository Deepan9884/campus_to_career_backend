const crypto = require("crypto");

// Encryption configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // AES block size
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations
const CURRENT_KEY_VERSION = 1; // Increment when rotating keys

/**
 * Get encryption keys by version
 * Supports multiple key versions for rotation
 * @returns {Object} Map of version -> key
 */
function getEncryptionKeys() {
  const keys = {};
  
  // Current key (required)
  const currentKey = process.env.ENCRYPTION_KEY;
  if (!currentKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required but not set. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  if (currentKey.length < 64) {
    throw new Error('ENCRYPTION_KEY must be at least 64 characters (32 bytes hex)');
  }
  keys[CURRENT_KEY_VERSION] = currentKey;
  
  // Previous key versions for decryption (optional, for migration period)
  const oldKey = process.env.ENCRYPTION_KEY_V0;
  if (oldKey && oldKey.length >= 64) {
    keys[0] = oldKey;
  }
  
  return keys;
}

/**
 * Get encryption key from environment (legacy support)
 * @returns {string}
 */
function getEncryptionKey() {
  const keys = getEncryptionKeys();
  return keys[CURRENT_KEY_VERSION];
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
 * Encrypt a string value with version support
 * @param {string} text - Plain text to encrypt
 * @param {number} keyVersion - Key version to use (default: current)
 * @returns {string} - Encrypted text in format: v{version}:salt:iv:encrypted:tag (all hex encoded)
 */
function encrypt(text, keyVersion = CURRENT_KEY_VERSION) {
  if (!text || typeof text !== "string") {
    return text; // Return as-is if not a string
  }

  try {
    const keys = getEncryptionKeys();
    const masterKey = keys[keyVersion];
    
    if (!masterKey) {
      throw new Error(`Encryption key version ${keyVersion} not found`);
    }
    
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(masterKey, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    // Format: v{version}:salt:iv:encrypted:tag
    return `v${keyVersion}:${salt.toString("hex")}:${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
  } catch (err) {
    console.error("[Encryption] Error encrypting data:", err.message);
    throw new Error("Encryption failed");
  }
}

/**
 * Decrypt an encrypted string with version support
 * @param {string} encryptedText - Encrypted text in format: v{version}:salt:iv:encrypted:tag OR legacy salt:iv:encrypted:tag
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
    const keys = getEncryptionKeys();
    const parts = encryptedText.split(":");
    
    let keyVersion = CURRENT_KEY_VERSION;
    let salt, iv, encrypted, tag;
    
    // Check if versioned format (v1:salt:iv:encrypted:tag) or legacy (salt:iv:encrypted:tag)
    if (parts[0].startsWith("v")) {
      if (parts.length !== 5) {
        console.warn("[Encryption] Invalid encrypted format, returning as-is");
        return encryptedText;
      }
      
      keyVersion = parseInt(parts[0].substring(1), 10);
      salt = Buffer.from(parts[1], "hex");
      iv = Buffer.from(parts[2], "hex");
      encrypted = parts[3];
      tag = Buffer.from(parts[4], "hex");
    } else {
      // Legacy format (assume version 1)
      if (parts.length !== 4) {
        console.warn("[Encryption] Invalid encrypted format, returning as-is");
        return encryptedText;
      }
      
      keyVersion = CURRENT_KEY_VERSION;
      salt = Buffer.from(parts[0], "hex");
      iv = Buffer.from(parts[1], "hex");
      encrypted = parts[2];
      tag = Buffer.from(parts[3], "hex");
    }
    
    const masterKey = keys[keyVersion];
    if (!masterKey) {
      console.warn(`[Encryption] Key version ${keyVersion} not found, cannot decrypt`);
      return encryptedText;
    }

    const key = deriveKey(masterKey, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.warn("[Encryption] Decryption failed (key mismatch or corrupt data):", err.message);
    return encryptedText;
  }
}

/**
 * Check if a value is encrypted
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  
  // Check for versioned format (v1:...)
  if (value.startsWith("v") && value.includes(":")) {
    const parts = value.split(":");
    if (parts.length === 5 && /^v\d+$/.test(parts[0])) {
      return parts.slice(1).every((p) => /^[0-9a-f]+$/i.test(p));
    }
  }
  
  // Check for legacy format (4 parts, all hex)
  const parts = value.split(":");
  return parts.length === 4 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/**
 * Get the encryption version of an encrypted value
 * @param {string} encryptedValue
 * @returns {number} Version number, or null if not encrypted
 */
function getEncryptionVersion(encryptedValue) {
  if (!isEncrypted(encryptedValue)) return null;
  
  if (encryptedValue.startsWith("v")) {
    const versionPart = encryptedValue.split(":")[0];
    return parseInt(versionPart.substring(1), 10);
  }
  
  // Legacy format assumed to be version 1
  return CURRENT_KEY_VERSION;
}

/**
 * Re-encrypt data with the current key version
 * Useful for key rotation migration
 * @param {string} encryptedText
 * @returns {string} Re-encrypted with current key version
 */
function reencrypt(encryptedText) {
  if (!isEncrypted(encryptedText)) {
    return encryptedText;
  }
  
  const version = getEncryptionVersion(encryptedText);
  if (version === CURRENT_KEY_VERSION) {
    return encryptedText; // Already using current version
  }
  
  // Decrypt with old key and encrypt with new key
  const plaintext = decrypt(encryptedText);
  return encrypt(plaintext, CURRENT_KEY_VERSION);
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
  getEncryptionKeys,
  getEncryptionVersion,
  reencrypt,
  CURRENT_KEY_VERSION,
};
