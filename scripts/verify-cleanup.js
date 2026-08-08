const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const total = await Question.countDocuments({});
  const byRoundType = await Question.aggregate([
    { $group: { _id: '$roundType', count: { $sum: 1 } } }
  ]);
  const dupeCheck = await Question.aggregate([
    { $group: { _id: { roundType: '$roundType', questionText: '$questionText' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  const strayRemaining = await Question.countDocuments({ domain: { $exists: true } });

  console.log('TOTAL_COUNT:', total); // expected: 241 (207 + 34)
  console.log('BY_ROUND_TYPE:', JSON.stringify(byRoundType, null, 2)); // expected hr: 40+34=74, others unchanged from original 43/44/40/40
  console.log('REMAINING_DUPLICATE_GROUPS:', dupeCheck.length); // expected: 0
  console.log('STRAY_DOCS_WITH_DOMAIN_FIELD_REMAINING:', strayRemaining); // expected: 0

  await mongoose.disconnect();
})();
