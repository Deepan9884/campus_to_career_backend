const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');
const draftData = require('./output/question-bank-draft.json');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const draftTexts = new Set(draftData.questions.map(q => q.questionText.trim().toLowerCase()));
  const liveDocs = await Question.find({}).select('questionText roundType createdAt').lean();
  const matchingLive = liveDocs.filter(d => draftTexts.has((d.questionText || '').trim().toLowerCase()));

  console.log('DRAFT_QUESTION_COUNT:', draftData.questions.length);
  console.log('LIVE_DOCS_MATCHING_DRAFT_TEXT:', matchingLive.length);

  // Group matches by createdAt date to see if they cluster into two distinct insert events
  const byDate = matchingLive.reduce((acc, d) => {
    const day = new Date(d.createdAt).toISOString().slice(0, 16); // to the minute
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  console.log('MATCHING_DOCS_BY_INSERT_TIMESTAMP:', JSON.stringify(byDate, null, 2));

  await mongoose.disconnect();
})();
