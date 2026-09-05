/**
 * AI Output Sanitization Utility
 * Prevents XSS, injection, and data exfiltration via AI responses
 */

/**
 * Sanitize HTML string to prevent XSS
 * @param {string} html
 * @returns {string}
 */
function sanitizeHTML(html) {
  if (typeof html !== 'string') return html;

  // Remove script tags and event handlers
  let sanitized = html;
  
  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  // Remove style tags (can be used for CSS injection)
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed|frame|frameset)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');
  
  return sanitized;
}

/**
 * Sanitize text to prevent injection attacks
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return text;

  // Remove null bytes
  let sanitized = text.replace(/\x00/g, '');
  
  // Limit length to prevent DOS
  if (sanitized.length > 50000) {
    sanitized = sanitized.substring(0, 50000) + '... [truncated for security]';
  }
  
  return sanitized;
}

/**
 * Detect and block potential code execution patterns
 * @param {string} text
 * @returns {boolean} True if dangerous patterns detected
 */
function containsDangerousPatterns(text) {
  if (typeof text !== 'string') return false;

  const dangerousPatterns = [
    // SQL injection patterns
    /(\bunion\b|\bselect\b|\bfrom\b|\bwhere\b|\bdrop\b|\binsert\b|\bupdate\b|\bdelete\b).*(\bunion\b|\bselect\b|\bfrom\b|\bwhere\b)/i,
    
    // NoSQL injection patterns
    /\{\s*['"]\$\w+['"]\s*:/,
    
    // Command injection patterns (dangerous shell executions)
    /(?:^|[;&|`$])\s*(?:rm\s+-rf|curl\s+[^\s]+\s*\|\s*(?:bash|sh)|wget\s+[^\s]+\s*\|\s*(?:bash|sh))/i,
    
    // Path traversal targeting sensitive directories
    /(?:\.\.[\/\\]){2,}(?:etc|passwd|windows|system32)/i,
    
    // Server-side template injection (prototype / constructor access)
    /\{\{.*constructor\.constructor.*\}\}/i,
    
    // LDAP injection (targeted filter structures)
    /\([&|!]\s*\([a-z0-9_]+=[*a-z0-9_]+\)/i,
  ];

  return dangerousPatterns.some(pattern => pattern.test(text));
}

/**
 * Validate and sanitize AI-generated JSON structure
 * @param {Object} jsonObj
 * @param {Object} schema - Expected schema structure
 * @returns {Object} Sanitized object
 */
function sanitizeAIJSON(jsonObj, schema = null) {
  if (!jsonObj || typeof jsonObj !== 'object') {
    return jsonObj;
  }

  // Deep clone to avoid mutation
  const sanitized = JSON.parse(JSON.stringify(jsonObj));

  // Recursively sanitize all string values
  function sanitizeObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    } else if (obj !== null && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key to prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        result[key] = sanitizeObject(value);
      }
      return result;
    } else if (typeof obj === 'string') {
      // Sanitize string values
      return sanitizeHTML(sanitizeText(obj));
    }
    return obj;
  }

  return sanitizeObject(sanitized);
}

/**
 * Comprehensive AI output sanitization
 * @param {Object} aiResponse - AI service response
 * @returns {Object} Sanitized response
 */
function sanitizeAIOutput(aiResponse) {
  if (!aiResponse) return aiResponse;

  const result = { ...aiResponse };

  // Sanitize raw text output
  if (result.raw && typeof result.raw === 'string') {
    result.raw = sanitizeText(result.raw);
  }

  // Sanitize structured data
  if (result.data) {
    if (typeof result.data === 'string') {
      result.data = sanitizeHTML(sanitizeText(result.data));
    } else if (typeof result.data === 'object') {
      result.data = sanitizeAIJSON(result.data);
    }
  }

  return result;
}

/**
 * Validate AI response against expected schema
 * @param {Object} response
 * @param {Object} schema - Zod or JSON schema
 * @returns {Object} { valid: boolean, data: Object, errors: string[] }
 */
function validateAIResponseSchema(response, schema) {
  if (!schema) {
    return { valid: true, data: response, errors: [] };
  }

  try {
    // If using Zod schema
    if (schema.parse) {
      const validated = schema.parse(response);
      return { valid: true, data: validated, errors: [] };
    }

    // Basic type validation if no schema parser
    return { valid: true, data: response, errors: [] };
  } catch (err) {
    console.error('[AI Output] Schema validation failed:', err.message);
    return {
      valid: false,
      data: null,
      errors: [err.message]
    };
  }
}

/**
 * Detect potential data exfiltration attempts in AI output
 * @param {string} text
 * @returns {boolean}
 */
function containsDataExfiltration(text) {
  if (typeof text !== 'string') return false;

  const exfiltrationPatterns = [
    // API keys, tokens
    /\b(sk|pk|api|token)[-_]?[a-zA-Z0-9]{20,}/i,
    
    // AWS credentials
    /AKIA[0-9A-Z]{16}/,
    
    // Private keys
    /-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----/,
    
    // Connection strings
    /mongodb(\+srv)?:\/\/[^\s]+/,
    /postgres(ql)?:\/\/[^\s]+/,
    /mysql:\/\/[^\s]+/,
    
    // Email addresses (potential PII leakage)
    /\b[A-Za-z0-9._%+-]{3,}@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    
    // Credit card patterns
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
    
    // SSN patterns
    /\b\d{3}-\d{2}-\d{4}\b/,
  ];

  return exfiltrationPatterns.some(pattern => pattern.test(text));
}

/**
 * Complete AI output security pipeline
 * @param {Object} aiResponse
 * @param {Object} options - { schema, strict, logViolations }
 * @returns {Object}
 */
function secureAIOutput(aiResponse, options = {}) {
  const { schema = null, strict = false, logViolations = true } = options;

  if (!aiResponse) return aiResponse;

  // Step 1: Check for data exfiltration
  const rawText = JSON.stringify(aiResponse);
  if (containsDataExfiltration(rawText)) {
    if (logViolations) {
      console.error('[AI Security] Potential data exfiltration detected in AI response');
    }
    
    if (strict) {
      return {
        success: false,
        data: null,
        raw: null,
        securityBlocked: true,
        message: 'AI response blocked due to security concerns'
      };
    }
  }

  // Step 2: Sanitize output
  const sanitized = sanitizeAIOutput(aiResponse);

  // Step 3: Validate schema if provided
  if (schema && sanitized.data) {
    const validation = validateAIResponseSchema(sanitized.data, schema);
    if (!validation.valid) {
      if (logViolations) {
        console.error('[AI Security] Schema validation failed:', validation.errors);
      }
      
      if (strict) {
        return {
          success: false,
          data: null,
          raw: null,
          validationError: true,
          errors: validation.errors,
          message: 'AI response does not match expected format'
        };
      }
    }
    sanitized.data = validation.data;
  }

  return sanitized;
}

module.exports = {
  sanitizeHTML,
  sanitizeText,
  sanitizeAIJSON,
  sanitizeAIOutput,
  containsDangerousPatterns,
  containsDataExfiltration,
  validateAIResponseSchema,
  secureAIOutput
};
