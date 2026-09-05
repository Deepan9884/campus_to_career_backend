/**
 * Password Validation Utility
 * Provides comprehensive password strength validation
 */

// Common weak passwords to block
const COMMON_PASSWORDS = [
  'password', 'password123', '12345678', 'qwerty123', 'admin123',
  'welcome123', 'letmein123', 'monkey123', '123456789', 'password1',
  'abc123456', 'superman1', 'iloveyou1', 'starwars1', 'football1'
];

/**
 * Calculate password entropy (bits)
 * Higher entropy = stronger password
 * @param {string} password
 * @returns {number} Entropy in bits
 */
function calculateEntropy(password) {
  if (!password) return 0;

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

  return password.length * Math.log2(poolSize);
}

/**
 * Validate password strength
 * @param {string} password
 * @returns {Object} { valid: boolean, strength: string, issues: string[] }
 */
function validatePasswordStrength(password) {
  const issues = [];
  
  if (!password) {
    return { valid: false, strength: 'invalid', issues: ['Password is required'] };
  }

  // Check minimum length
  if (password.length < 8) {
    issues.push('Password must be at least 8 characters long');
  }

  // Check maximum length (prevent DOS)
  if (password.length > 128) {
    issues.push('Password must not exceed 128 characters');
  }

  // Check for uppercase letter
  if (!/[A-Z]/.test(password)) {
    issues.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase letter
  if (!/[a-z]/.test(password)) {
    issues.push('Password must contain at least one lowercase letter');
  }

  // Check for number
  if (!/[0-9]/.test(password)) {
    issues.push('Password must contain at least one number');
  }

  // Check for special character
  if (!/[@$!%*?&]/.test(password)) {
    issues.push('Password must contain at least one special character (@$!%*?&)');
  }

  // Check for common passwords
  const lowerPassword = password.toLowerCase();
  const isCommon = COMMON_PASSWORDS.some(common => lowerPassword.includes(common));
  if (isCommon) {
    issues.push('Password contains common words or patterns - please choose a more unique password');
  }

  // Check for sequential characters (1234, abcd, etc.)
  if (/(?:abcd|bcde|cdef|defg|efgh|fghi|ghij|hijk|ijkl|jklm|klmn|lmno|mnop|nopq|opqr|pqrs|qrst|rstu|stuv|tuvw|uvwx|vwxy|wxyz|0123|1234|2345|3456|4567|5678|6789)/i.test(password)) {
    issues.push('Password should not contain sequential characters (abcd, 1234, etc.)');
  }

  // Check for repeated characters (aaa, 111, etc.)
  if (/(.)\1{2,}/.test(password)) {
    issues.push('Password should not contain repeated characters (aaa, 111, etc.)');
  }

  // Calculate entropy and strength
  const entropy = calculateEntropy(password);
  let strength = 'weak';
  
  if (issues.length === 0) {
    if (entropy >= 80) {
      strength = 'very strong';
    } else if (entropy >= 60) {
      strength = 'strong';
    } else if (entropy >= 50) {
      strength = 'moderate';
    } else {
      strength = 'weak';
      issues.push('Password strength is weak - consider making it longer or more complex');
    }
  }

  return {
    valid: issues.length === 0,
    strength,
    entropy: Math.round(entropy),
    issues
  };
}

/**
 * Express middleware for password validation
 * @param {string} field - Field name to validate (default: 'password')
 */
function validatePasswordMiddleware(field = 'password') {
  return (req, res, next) => {
    const password = req.body[field];
    
    if (!password) {
      return next(); // Let model validation handle required check
    }

    const validation = validatePasswordStrength(password);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements',
        issues: validation.issues
      });
    }

    // Attach validation result to request for logging
    req.passwordValidation = validation;
    next();
  };
}

/**
 * Check if new password is different from old password
 * @param {string} newPassword
 * @param {string} oldPasswordHash
 * @returns {Promise<boolean>}
 */
async function isPasswordDifferent(newPassword, oldPasswordHash) {
  const bcryptjs = require('bcryptjs');
  try {
    const isSame = await bcryptjs.compare(newPassword, oldPasswordHash);
    return !isSame;
  } catch (err) {
    return true; // Assume different if comparison fails
  }
}

module.exports = {
  validatePasswordStrength,
  validatePasswordMiddleware,
  calculateEntropy,
  isPasswordDifferent,
  COMMON_PASSWORDS
};
