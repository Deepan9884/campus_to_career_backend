const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const totalCount = await Question.countDocuments({});
  console.log('TOTAL_COUNT:', totalCount);

  const byRoundType = await Question.aggregate([
    { $group: { _id: "$roundType", count: { $sum: 1 } } }
  ]);
  console.log('BY_ROUND_TYPE:', JSON.stringify(byRoundType, null, 2));

  const strayCount = await Question.countDocuments({
    roundType: { $nin: ["quiz", "aptitude", "core", "technical", "hr"] }
  });
  console.log('STRAY_DOC_COUNT (invalid/missing roundType):', strayCount);

  const strayDocs = await Question.find({
    roundType: { $nin: ["quiz", "aptitude", "core", "technical", "hr"] }
  }).lean();
  console.log('STRAY_DOC_SAMPLE (first 5, raw):', JSON.stringify(strayDocs.slice(0, 5), null, 2));

  // Check specifically if these are pre-migration docs with the old 'domain' field
  const withOldDomainField = strayDocs.filter(d => d.domain !== undefined).length;
  console.log('STRAY_DOCS_WITH_LEGACY_DOMAIN_FIELD:', withOldDomainField);

  await mongoose.disconnect();
})();
