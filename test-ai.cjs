const mongoose = require("mongoose");
const aiService = require("./src/services/ai.service");
require("dotenv").config({ path: "./.env" });

const responseSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionId: { type: "string" },
            section: { type: "integer" },
            sectionTitle: { type: "string" },
            type: { type: "string" },
            difficulty: { type: "string" },
            questionText: { type: "string" },
            options: {
              type: "array",
              items: { type: "string" },
            },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
            keyPoints: { type: "array", items: { type: "string" }, minItems: 1 },
            starterCode: { type: "string" },
            testCases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "string" },
                  expectedOutput: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
          required: ["questionId", "section", "sectionTitle", "type", "questionText", "keyPoints"],
        },
        minItems: 8,
        maxItems: 12,
      },
    },
    required: ["questions"],
  };

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const res = await aiService.generateContent({
      prompt: "Generate a quiz for Python basics",
      responseSchema,
      feature: "quiz-generation",
      userId: new mongoose.Types.ObjectId()
    });
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("ERROR:", err);
  }
  mongoose.disconnect();
}
test();
