const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const dupes = await Question.aggregate([
    { $group: {
        _id: { roundType: "$roundType", questionText: "$questionText" },
        count: { $sum: 1 },
        ids: { $push: "$_id" },
        createdAts: { $push: "$createdAt" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);
  console.log('DUPLICATE_GROUPS_COUNT:', dupes.length);
  console.log('TOTAL_DUPLICATE_DOCS:', dupes.reduce((sum, d) => sum + d.count, 0));
  console.log('SAMPLE_DUPLICATE_GROUPS:', JSON.stringify(dupes.slice(0, 5), null, 2));

  await mongoose.disconnect();
})();
