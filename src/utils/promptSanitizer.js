/**
 * Prompt Sanitizer Utility
 * Neutralizes prompt injection attempts, system prompt overrides,
 * markdown delimiter escapes, and bounds input string lengths.
 */

/**
 * Sanitizes user-supplied string before embedding into LLM prompt templates.
 * @param {string} input - Raw user input.
 * @param {number} [maxLength=2000] - Maximum allowed length.
 * @returns {string} Sanitized string.
 */
function sanitizePromptInput(input, maxLength = 2000) {
  if (typeof input !== "string") {
    if (!input) return "";
    input = String(input);
  }

  let sanitized = input.trim();

  // Enforce maximum length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  // Remove null bytes and dangerous control characters
  sanitized = sanitized.replace(/[\0\x08\x0B\x0C\x0E-\x1F]/g, "");

  // Neutralize markdown code fence breakouts
  sanitized = sanitized.replace(/```/g, "'''");

  // Neutralize common prompt injection directives
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    /system\s*:\s*you\s+are/gi,
    /\[system\s+message\]/gi,
    /\[instruction\]/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "[filtered instruction]");
  }

  return sanitized;
}

module.exports = {
  sanitizePromptInput,
};
