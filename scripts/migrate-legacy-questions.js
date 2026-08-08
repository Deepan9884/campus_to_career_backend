const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const legacyDocs = await Question.find({ domain: { $exists: true } }).lean();
  console.log('LEGACY_DOCS_FOUND:', legacyDocs.length);

  const result = await Question.collection.updateMany(
    { domain: { $exists: true } },
    {
      $set: { roundType: 'hr', itemType: 'open_ended' },
      $unset: { domain: '' }
    }
  );
  console.log('MIGRATED_COUNT:', result.modifiedCount);

  await mongoose.disconnect();
})();
