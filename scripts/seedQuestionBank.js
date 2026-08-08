const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const aiService = require('../src/services/ai.service');

// Constants for generation
const ROUNDS = [
  {
    type: 'quiz',
    itemType: 'mcq',
    contentDesc: 'General CS fundamentals (data structures, DBMS, OS, networking basics), mixed difficulty',
    batches: [
      { difficulty: 'easy', count: 14 },
      { difficulty: 'medium', count: 12 },
      { difficulty: 'medium', count: 11 },
      { difficulty: 'hard', count: 8 }
    ]
  },
  {
    type: 'aptitude',
    itemType: 'mcq',
    contentDesc: 'Quant (approx 1/3), logical reasoning (approx 1/3), verbal (approx 1/3)',
    batches: [
      { difficulty: 'easy', count: 14 },
      { difficulty: 'medium', count: 12 },
      { difficulty: 'medium', count: 11 },
      { difficulty: 'hard', count: 8 }
    ]
  },
  {
    type: 'core',
    itemType: 'open_ended',
    contentDesc: 'Core CS subjects (DBMS, OOP, OS, CN) — role-agnostic, short-answer style',
    batches: [
      { difficulty: 'easy', count: 12 },
      { difficulty: 'medium', count: 10 },
      { difficulty: 'medium', count: 10 },
      { difficulty: 'hard', count: 8 }
    ]
  },
  {
    type: 'technical',
    itemType: 'open_ended',
    contentDesc: 'DSA/problem-solving explanation questions (not full coding — approach/reasoning)',
    batches: [
      { difficulty: 'easy', count: 12 },
      { difficulty: 'medium', count: 10 },
      { difficulty: 'medium', count: 10 },
      { difficulty: 'hard', count: 8 }
    ]
  },
  {
    type: 'hr',
    itemType: 'open_ended',
    contentDesc: 'Behavioral questions (STAR-style prompts, teamwork, conflict, motivation)',
    batches: [
      { difficulty: 'easy', count: 12 },
      { difficulty: 'medium', count: 10 },
      { difficulty: 'medium', count: 10 },
      { difficulty: 'hard', count: 8 }
    ]
  }
];

const mcqSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      category: { type: "string" },
      questionText: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      correctOptionIndex: { type: "number" }
    },
    required: ["category", "questionText", "options", "correctOptionIndex"]
  }
};

const openEndedSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      category: { type: "string" },
      questionText: { type: "string" },
      idealAnswerPoints: { type: "array", items: { type: "string" } }
    },
    required: ["category", "questionText", "idealAnswerPoints"]
  }
};

async function generateBatch(round, batch, userId) {
  const { type, itemType, contentDesc } = round;
  const { difficulty, count } = batch;

  let prompt = `You are an expert technical interviewer creating a question bank.
Generate exactly ${count} distinct questions for a "${type}" round.
Content focus: ${contentDesc}
Difficulty level: ${difficulty}. Ensure the questions strictly match this difficulty.
`;

  if (itemType === 'mcq') {
    prompt += `
For each question, provide:
- category: A short sub-topic (e.g. "Data Structures", "Quant", "Networking").
- questionText: The actual question.
- options: Exactly 4 distinct multiple-choice options (array of strings).
- correctOptionIndex: The 0-based index (0, 1, 2, or 3) of the correct option.
IMPORTANT: Ensure exactly one option is unambiguously correct.`;
  } else {
    prompt += `
For each question, provide:
- category: A short sub-topic (e.g. "DBMS", "Behavioral", "System Design").
- questionText: The actual question prompt.
- idealAnswerPoints: An array of 3-5 short strings representing key points a strong answer should cover.`;
  }

  const responseSchema = itemType === 'mcq' ? mcqSchema : openEndedSchema;
  const feature = 'interview-question';

  console.log(`[+] Generating ${count} ${difficulty} ${type} questions...`);

  const result = await aiService.generateContent({
    prompt,
    responseSchema,
    feature,
    userId
  });

  if (!result.success) {
    console.error(`[-] Failed to generate batch for ${type} (${difficulty}): ${result.message}`);
    return [];
  }

  const data = result.data || [];
  // Ensure we limit strictly to requested count in case Gemini gives extra
  const items = data.slice(0, count);

  // Map to the final expected schema
  return items.map(item => {
    const base = {
      roundType: type,
      itemType: itemType,
      category: item.category || 'General',
      difficulty: difficulty,
      questionText: item.questionText,
      targetRoles: []
    };

    if (itemType === 'mcq') {
      base.options = item.options.slice(0, 4);
      base.correctOptionIndex = item.correctOptionIndex;
    } else {
      base.idealAnswerPoints = item.idealAnswerPoints || [];
    }

    return base;
  });
}

async function run() {
  const mongoose = require('mongoose');
  const User = require('../src/models/User.model');
  
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const systemUser = await User.findOne();
  const userId = systemUser ? systemUser._id : new mongoose.Types.ObjectId();

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const allQuestions = [];
  const counts = { quiz: 0, aptitude: 0, core: 0, technical: 0, hr: 0 };
  const duplicatesRemoved = { quiz: 0, aptitude: 0, core: 0, technical: 0, hr: 0 };

  for (const round of ROUNDS) {
    console.log(`\n=== Starting Round: ${round.type} ===`);
    let roundQuestions = [];

    for (const batch of round.batches) {
      const generated = await generateBatch(round, batch, userId);
      roundQuestions = roundQuestions.concat(generated);
      // Wait a moment between batches to avoid immediate rate limit spikes
      await new Promise(r => setTimeout(r, 2000)); 
    }

    // Deduplicate within the round
    const uniqueTextSet = new Set();
    const uniqueRoundQuestions = [];

    for (const q of roundQuestions) {
      if (!q || !q.questionText) continue;
      const normalized = q.questionText.trim().toLowerCase();
      if (uniqueTextSet.has(normalized)) {
        duplicatesRemoved[round.type]++;
      } else {
        uniqueTextSet.add(normalized);
        uniqueRoundQuestions.push(q);
      }
    }

    allQuestions.push(...uniqueRoundQuestions);
    counts[round.type] = uniqueRoundQuestions.length;
    console.log(`=== Finished ${round.type}: ${counts[round.type]} generated, ${duplicatesRemoved[round.type]} dupes removed ===`);
  }

  const finalOutput = {
    generatedAt: new Date().toISOString(),
    counts,
    duplicatesRemoved,
    questions: allQuestions
  };

  const outputPath = path.join(outputDir, 'question-bank-draft.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2));

  console.log('\n--- FINAL SUMMARY ---');
  console.log('Counts:', counts);
  console.log('Duplicates Removed:', duplicatesRemoved);
  console.log(`Data written to ${outputPath}`);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

run().catch(console.error);
