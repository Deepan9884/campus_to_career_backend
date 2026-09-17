const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");
const mammoth = require("mammoth");
const aiService = require("./ai.service");
const StudyMaterial = require("../models/StudyMaterial.model");
const LanguageChat = require("../models/LanguageChat.model");
const ApiError = require("../utils/ApiError");
const { getFallbackQuiz, getFallbackListening } = require("./foreignLanguage.banks");

function extractPdfText(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataError", (err) => {
      reject(new Error(err?.parserError || "Failed to parse PDF"));
    });
    parser.on("pdfParser_dataReady", (pdfData) => {
      try {
        const texts = [];
        pdfData.Pages.forEach((page) => {
          page.Texts.forEach((t) => {
            t.R.forEach((r) => {
              try {
                texts.push(decodeURIComponent(r.T));
              } catch {
                texts.push(r.T);
              }
            });
          });
        });
        resolve(texts.join(" "));
      } catch (e) {
        reject(new Error("Failed to extract text from PDF: " + e.message));
      }
    });
    parser.loadPDF(filePath);
  });
}

async function extractTextFromFile(filePath, ext) {
  if (ext === ".pdf") {
    return await extractPdfText(filePath);
  } else if (ext === ".docx") {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } else if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(filePath, "utf-8");
  }
  throw new Error("Unsupported file format");
}

async function processUploadedMaterial(userId, file, language, title, materialType) {
  const ext = path.extname(file.originalname).toLowerCase();

  // Extract text based on file type
  const parsedText = await extractTextFromFile(file.path, ext);

  if (!parsedText || parsedText.trim().length < 50) {
    throw new ApiError(400, "Could not extract meaningful text from the file. It may be an image-only PDF.");
  }

  // Estimate token count (very rough estimate: 4 chars per token)
  const tokenCount = Math.ceil(parsedText.length / 4);

  const material = await StudyMaterial.create({
    userId,
    title,
    language,
    originalFileName: file.originalname,
    fileType: ext.replace(".", ""),
    parsedText,
    tokenCount,
    materialType,
    isActive: true,
  });

  return material;
}

/** Truncate material text so prompts stay within model limits. */
function clipped(text, max) {
  const t = String(text || "");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** Unwrap aiService.generateContent result into plain text. */
function unwrapText(result) {
  if (!result) return "";
  if (typeof result.data === "string" && result.data.trim()) return result.data.trim();
  if (typeof result.raw === "string" && result.raw.trim()) return result.raw.trim();
  if (result.data && typeof result.data === "object") {
    if (typeof result.data.response === "string") return result.data.response.trim();
    if (typeof result.data.answer === "string") return result.data.answer.trim();
    if (typeof result.data.text === "string") return result.data.text.trim();
  }
  return "";
}

/** Strictly validate + normalize AI quiz output into QuizQuestion[]. Returns null if unusable. */
function normalizeQuizQuestions(data) {
  let arr = null;
  if (Array.isArray(data)) arr = data;
  else if (data && Array.isArray(data.questions)) arr = data.questions;
  else if (data && Array.isArray(data.quiz)) arr = data.quiz;
  if (!arr) return null;

  const clean = [];
  for (const q of arr) {
    if (!q || typeof q.questionText !== "string" || !q.questionText.trim()) continue;
    if (!Array.isArray(q.options) || q.options.length < 2) continue;
    const options = q.options.slice(0, 4).map((o) => String(o));
    while (options.length < 4) options.push("—");
    let idx = Number(q.correctOptionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
      // Try to resolve from correctAnswer text
      const ca = String(q.correctAnswer || "");
      const found = options.findIndex((o) => o === ca || (ca && o.includes(ca.slice(0, 12))));
      idx = found >= 0 ? found : 0;
    }
    clean.push({
      questionText: q.questionText.trim(),
      options,
      correctOptionIndex: idx,
      explanation: String(q.explanation || "Review this point in your study material."),
    });
    if (clean.length >= 10) break;
  }
  return clean.length >= 5 ? clean : null;
}

/** Strictly validate listening payload. Returns null if unusable. */
function normalizeListening(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const script = String(data.script || "").trim();
  if (script.length < 40) return null;
  const questions = normalizeQuizQuestions(data.questions || []);
  return {
    title: String(data.title || "Listening practice").slice(0, 120),
    script,
    translation: String(data.translation || "").slice(0, 4000),
    questions: questions || [],
  };
}

async function handleLanguageChat(userId, language, userMessage) {
  // 1. Fetch active materials for this user and language
  const activeMaterials = await StudyMaterial.find({ userId, language, isActive: true }).select("+parsedText");

  if (!activeMaterials || activeMaterials.length === 0) {
    throw new ApiError(400, "Please upload and activate at least one study material before chatting.");
  }

  // 2. Fetch or create chat history
  let chat = await LanguageChat.findOne({ userId, language });
  if (!chat) {
    chat = new LanguageChat({
      userId,
      language,
      messages: [],
      activeMaterials: activeMaterials.map((m) => m._id),
    });
  }

  // 3. Assemble RAG prompt (clipped so the request can't blow token limits)
  let contextText = `You are an expert ${language} tutor and AI study buddy. Answer the student's question using the study materials below.\n\n=== STUDY MATERIALS ===\n`;
  let budget = 12000;
  for (const mat of activeMaterials) {
    if (budget <= 0) break;
    const chunk = clipped(mat.parsedText || "", Math.min(4000, budget));
    contextText += `\n--- Document: ${mat.title} ---\n${chunk}\n`;
    budget -= chunk.length;
  }
  contextText += `\n=== END OF MATERIALS ===\n\nInstructions:\n- Answer clearly using the context above.\n- If the answer is not in the materials, use your ${language} knowledge but say it wasn't in their notes.\n- Be encouraging and format with markdown.\n`;

  const recentHistory = chat.messages.slice(-10);
  let fullPrompt = `[User]: ${contextText}\n\n[Assistant]: Understood. I will act as the AI study buddy and answer based on the provided materials.\n\n`;
  recentHistory.forEach((msg) => {
    fullPrompt += `[${msg.role === "assistant" ? "Assistant" : "User"}]: ${msg.content}\n\n`;
  });
  fullPrompt += `[User]: ${userMessage}\n\n[Assistant]: `;

  // 4. Correct aiService call signature: generateContent({prompt, feature, userId})
  let result;
  try {
    result = await aiService.generateContent({
      prompt: fullPrompt,
      feature: "foreign-language-chat",
      userId,
    });
  } catch (err) {
    throw new ApiError(500, "AI tutor is temporarily unavailable. Please try again in a moment.");
  }

  const aiResponseText = unwrapText(result);
  if (!result || result.success === false || !aiResponseText) {
    throw new ApiError(500, result?.message || "AI tutor is temporarily unavailable. Please try again in a moment.");
  }

  // 5. Update Chat History
  chat.messages.push({ role: "user", content: userMessage });
  chat.messages.push({ role: "assistant", content: aiResponseText });
  chat.activeMaterials = activeMaterials.map((m) => m._id);

  await chat.save();

  return {
    response: aiResponseText,
    materialsReferenced: activeMaterials.map((m) => m.title),
  };
}

async function generateExamQuiz(userId, language, targetExam) {
  const activeMaterials = await StudyMaterial.find({ userId, language, isActive: true }).select("+parsedText");

  let contextText = "";
  if (activeMaterials.length > 0) {
    // Clip aggressively: full dumps cause timeouts / 500s
    const parts = [];
    let budget = 6000;
    for (const mat of activeMaterials) {
      if (budget <= 0) break;
      const chunk = clipped(mat.parsedText || "", Math.min(2000, budget));
      parts.push(chunk);
      budget -= chunk.length;
    }
    contextText = `Use this study material for vocabulary/grammar inspiration:\n${parts.join("\n---\n")}\n`;
  }

  const prompt = `You are an expert ${language} exam assessor. Generate a practice quiz for the ${targetExam} level certification.\n${contextText}\nGenerate exactly 10 multiple-choice questions testing vocabulary, grammar, and reading comprehension appropriate for ${targetExam}.\nReply with ONLY a JSON array, no markdown fences, following exactly:\n[{"questionText":"...","options":["a","b","c","d"],"correctOptionIndex":0,"explanation":"..."}]`;

  try {
    const result = await aiService.generateContent({
      prompt,
      feature: "foreign-language-quiz",
      userId,
    });
    const payload = result && result.success ? (result.data ?? result.raw) : null;
    // data may already be parsed object/array, or raw string
    let parsed = payload;
    if (typeof parsed === "string") {
      const fence = parsed.match(/```(?:json)?\s*([\s\S]*?)```/);
      const text = (fence ? fence[1] : parsed).trim();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    const clean = normalizeQuizQuestions(parsed);
    if (clean) return clean;
    console.warn("[ForeignLanguage] AI quiz output unusable, serving bank fallback.");
  } catch (err) {
    console.warn("[ForeignLanguage] AI quiz failed, serving bank fallback:", err?.message);
  }

  // NEVER 500 — deterministic local bank, rotated per request so sets differ
  return getFallbackQuiz(language, targetExam, Date.now() % 100000);
}

async function generateListeningScript(userId, language, targetExam, topic) {
  const activeMaterials = await StudyMaterial.find({ userId, language, isActive: true }).select("+parsedText");

  let contextText = "";
  if (activeMaterials.length > 0) {
    const snippet = activeMaterials
      .map((m) => clipped(m.parsedText || "", 1200))
      .join("\n---\n");
    contextText = `Draw vocabulary and themes from these study notes where possible:\n${snippet}\n`;
  }

  const safeTopic = topic || "daily conversation";
  const prompt = `You are an expert ${language} (${targetExam} level) listening-exam scriptwriter.\n${contextText}\nTopic: ${safeTopic}.\nWrite a realistic exam-style listening passage in ${language} suitable for ${targetExam} learners (120-220 words, natural dialogue or monologue), then an English translation, then exactly 3 multiple-choice comprehension questions with 4 options each.\nReply with ONLY JSON, no markdown fences:\n{"title":"...","script":"...","translation":"...","questions":[{"questionText":"...","options":["a","b","c","d"],"correctOptionIndex":0,"explanation":"..."}]}`;

  try {
    const result = await aiService.generateContent({
      prompt,
      feature: "foreign-language-listening",
      userId,
    });
    const payload = result && result.success ? (result.data ?? result.raw) : null;
    let parsed = payload;
    if (typeof parsed === "string") {
      const fence = parsed.match(/```(?:json)?\s*([\s\S]*?)```/);
      const text = (fence ? fence[1] : parsed).trim();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    const clean = normalizeListening(parsed);
    if (clean) return clean;
    console.warn("[ForeignLanguage] AI listening output unusable, serving bank fallback.");
  } catch (err) {
    console.warn("[ForeignLanguage] AI listening failed, serving bank fallback:", err?.message);
  }

  return getFallbackListening(language, targetExam, safeTopic);
}

module.exports = {
  processUploadedMaterial,
  handleLanguageChat,
  generateExamQuiz,
  generateListeningScript,
};
