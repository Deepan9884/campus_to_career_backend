const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Precise window around the known duplicate insert timestamp
  const windowStart = new Date('2026-07-22T05:19:00.000Z');
  const windowEnd = new Date('2026-07-22T05:20:00.000Z');

  const toDelete = await Question.find({
    createdAt: { $gte: windowStart, $lt: windowEnd }
  }).lean();

  console.log('CANDIDATES_FOR_DELETION:', toDelete.length);
  // Sanity check: this MUST be 207. If it's not, STOP and report — do not proceed to deletion.
  if (toDelete.length !== 207) {
    console.log('ABORT: candidate count does not match expected 207. No deletion performed.');
    await mongoose.disconnect();
    return;
  }

  const idsToDelete = toDelete.map(d => d._id);
  const result = await Question.deleteMany({ _id: { $in: idsToDelete } });
  console.log('DELETED_COUNT:', result.deletedCount);

  await mongoose.disconnect();
})();
