const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");
const mammoth = require("mammoth");
const aiService = require("./ai.service");
const StudyMaterial = require("../models/StudyMaterial.model");
const LanguageChat = require("../models/LanguageChat.model");
const ApiError = require("../utils/ApiError");

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

  // 3. Assemble RAG Prompt Context using "Context Stuffing"
  let contextText = `You are an expert ${language} tutor and AI study buddy. You are answering a student's question based strictly on the provided study materials below.\n\n`;
  contextText += `=== STUDY MATERIALS ===\n`;
  
  activeMaterials.forEach((mat, index) => {
    contextText += `\n--- Document ${index + 1}: ${mat.title} ---\n`;
    contextText += `${mat.parsedText}\n`;
  });
  
  contextText += `\n=== END OF MATERIALS ===\n\n`;
  contextText += `Instructions:\n`;
  contextText += `- Answer the user's question clearly and accurately using the context above.\n`;
  contextText += `- If the answer is not in the materials, rely on your extensive knowledge of ${language} to help them, but mention that it wasn't in their uploaded notes.\n`;
  contextText += `- Be encouraging, helpful, and format your answer with markdown for readability.\n`;

  // We construct the chat array for the AI
  const promptMessages = [];
  
  // Add the system context as a developer message if supported, or as a user message
  promptMessages.push({ role: "user", content: contextText });
  promptMessages.push({ role: "model", content: "Understood. I will act as the AI study buddy and answer based on the provided materials." });
  
  // Add previous conversation history (last 10 messages for context)
  const recentHistory = chat.messages.slice(-10);
  recentHistory.forEach((msg) => {
    promptMessages.push({
      role: msg.role === "assistant" ? "model" : "user",
      content: msg.content,
    });
  });

  // Add the current user message
  promptMessages.push({ role: "user", content: userMessage });

  // 4. Generate AI Response
  // We use aiService.generateContent which currently takes a single string prompt.
  // Wait, let's assemble it into a single massive string for standard generation.
  let fullPrompt = "";
  promptMessages.forEach((msg) => {
    fullPrompt += `[${msg.role === "model" ? "Assistant" : "User"}]: ${msg.content}\n\n`;
  });
  fullPrompt += `[Assistant]: `;

  const aiResponseText = await aiService.generateContent(fullPrompt);
  
  if (!aiResponseText) {
    throw new ApiError(500, "Failed to generate AI response");
  }

  // 5. Update Chat History
  chat.messages.push({ role: "user", content: userMessage });
  chat.messages.push({ role: "assistant", content: aiResponseText });
  chat.activeMaterials = activeMaterials.map((m) => m._id); // Update active materials in chat
  
  await chat.save();

  return {
    response: aiResponseText,
    materialsReferenced: activeMaterials.map(m => m.title),
  };
}

async function generateExamQuiz(userId, language, targetExam) {
  const activeMaterials = await StudyMaterial.find({ userId, language, isActive: true }).select("+parsedText");
  
  let contextText = "";
  if (activeMaterials.length > 0) {
    contextText = `Use the following study materials as inspiration for vocabulary and grammar to include in the quiz:\n`;
    activeMaterials.forEach((mat) => {
      contextText += `---\n${mat.parsedText}\n`;
    });
  }

  const prompt = `You are an expert ${language} exam assessor. Generate a practice quiz for the ${targetExam} level certification.
${contextText}

Generate exactly 10 multiple-choice questions that test vocabulary, grammar, and reading comprehension appropriate for ${targetExam}.
Format the output EXACTLY as a JSON array of objects, with no markdown codeblocks, following this exact schema:
[
  {
    "questionText": "The question here",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctOptionIndex": 0,
    "explanation": "Why this is correct"
  }
]`;

  const jsonResponse = await aiService.generateJson(prompt, {});
  return jsonResponse;
}

module.exports = {
  processUploadedMaterial,
  handleLanguageChat,
  generateExamQuiz,
};
