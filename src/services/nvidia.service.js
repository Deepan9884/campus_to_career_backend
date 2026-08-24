const env = require('../config/env');

/**
 * Clean & extract JSON from LLM response text (handles reasoning models & code fences)
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  let clean = text.trim();

  // 1. Try markdown code fences first
  const fenceMatches = clean.match(/```(?:json)?\s*([\s\S]*?)```/g);
  if (fenceMatches && fenceMatches.length > 0) {
    // Pick the last code fence (often where reasoning models put the final output)
    for (let i = fenceMatches.length - 1; i >= 0; i--) {
      const inner = fenceMatches[i].replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(inner);
      } catch {}
    }
  }

  // 2. Direct JSON parse
  try {
    return JSON.parse(clean);
  } catch {}

  // 3. Find the last balanced { ... } or [ ... ] block
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = clean.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  const firstBracket = clean.indexOf('[');
  const lastBracket = clean.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = clean.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  return null;
}

/**
 * Invoke NVIDIA Nemotron LLM via NVIDIA API Catalog (OpenAI-compatible)
 * @param {Object} options
 * @param {string} options.prompt - The input prompt
 * @param {Object} [options.responseSchema] - Optional schema for structured output
 * @param {string} [options.model] - Model name (default: nvidia/llama-3.1-nemotron-70b-instruct)
 * @param {number} [options.temperature=0.2]
 * @param {number} [options.maxTokens=2048]
 */
async function callNemotron({ prompt, responseSchema, model, temperature = 0.2, maxTokens = 2048 }) {
  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      errorType: 'MISSING_API_KEY',
      message: 'NVIDIA_API_KEY is not configured',
      retryable: false,
    };
  }

  const activeModel = model || env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
  const apiUrl = (env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '') + '/chat/completions';

  let systemPrompt = 'You are an expert AI career coach, technical examiner, and software architect for Campus to Career AI.';
  if (responseSchema) {
    systemPrompt += ' Always respond ONLY with valid, RFC-8259 compliant JSON matching the user schema without markdown commentary.';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: responseSchema ? 0.1 : temperature,
        top_p: 0.7,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`[NVIDIA Nemotron] API returned status ${res.status}: ${errorText.substring(0, 200)}`);
      return {
        success: false,
        errorType: res.status === 429 ? 'QUOTA_EXCEEDED' : 'API_ERROR',
        message: `NVIDIA API error: ${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    }

    const json = await res.json();
    const rawContent = json?.choices?.[0]?.message?.content || '';
    const totalTokens = json?.usage?.total_tokens || null;

    let parsedData = null;
    if (responseSchema || rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[')) {
      parsedData = extractJson(rawContent);
    }

    return {
      success: true,
      data: parsedData || rawContent,
      raw: rawContent,
      model: activeModel.startsWith('nvidia/') ? activeModel : `nvidia/${activeModel}`,
      tokensEstimate: totalTokens,
      isFallback: true,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[NVIDIA Nemotron] Request failed: ${err.message}`);
    return {
      success: false,
      errorType: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: err.message,
      retryable: true,
    };
  }
}

module.exports = {
  callNemotron,
  extractJson,
};
