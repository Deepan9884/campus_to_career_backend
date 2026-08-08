const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const AIUsageLog = require('../src/models/AIUsageLog.model');

const data = require('./output/question-bank-draft.json');

const mcqIssues = data.questions.filter(q => q.itemType === 'mcq' &&
  (!Array.isArray(q.options) || q.options.length !== 4 ||
   typeof q.correctOptionIndex !== 'number' || q.correctOptionIndex < 0 || q.correctOptionIndex > 3));
console.log('MCQ_ISSUES:', mcqIssues.length);
if (mcqIssues.length > 0) {
  console.log(JSON.stringify(mcqIssues, null, 2));
}

const aptCategories = data.questions.filter(q => q.roundType === 'aptitude')
  .reduce((acc, q) => { acc[q.category] = (acc[q.category]||0)+1; return acc; }, {});
console.log('APTITUDE_CATEGORY_BREAKDOWN:', JSON.stringify(aptCategories, null, 2));

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // We can't query `{ userId: 'system-seed-script' }` directly because userId is likely an ObjectId in the schema
    // Doing so will throw a CastError. So we will query manually and handle it, or we know it failed already.
    try {
      const logs = await AIUsageLog.find({ userId: 'system-seed-script' });
      console.log('AIUsageLog COUNT FOR system-seed-script:', logs.length);
    } catch (castErr) {
      console.log('AIUsageLog QUERY ERROR:', castErr.message);
    }

  } catch (err) {
    console.log('DB CONNECTION ERROR:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
