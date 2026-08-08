const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Question = require('../src/models/Question.model');

async function getGroupedCounts() {
  const counts = await Question.aggregate([
    { $group: { _id: "$roundType", count: { $sum: 1 } } }
  ]);
  const result = { quiz: 0, aptitude: 0, core: 0, technical: 0, hr: 0, total: 0 };
  let total = 0;
  for (const item of counts) {
    if (item._id && result.hasOwnProperty(item._id)) {
      result[item._id] = item.count;
    } else if (item._id) {
      result[item._id] = item.count;
    }
    total += item.count;
  }
  result.total = total;
  return result;
}

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment");
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("[db] Connected to live MongoDB.");

    // Dry-run count before insertion
    const beforeCounts = await getGroupedCounts();
    console.log("\n=== BEFORE COUNTS (by roundType) ===");
    console.log(JSON.stringify(beforeCounts, null, 2));

    // Locate question-bank-draft.json
    let draftPath = path.join(__dirname, 'output', 'question-bank-draft.json');
    if (!fs.existsSync(draftPath)) {
      draftPath = path.join(__dirname, 'question-bank-draft.json');
    }
    if (!fs.existsSync(draftPath)) {
      draftPath = path.join(__dirname, '../question-bank-draft.json');
    }

    console.log(`\nReading draft file from: ${draftPath}`);
    const rawData = fs.readFileSync(draftPath, 'utf8');
    const data = JSON.parse(rawData);

    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("No questions found in draft JSON.");
    }

    console.log(`\nAttempting to insert ${data.questions.length} questions into Question collection...`);

    let insertSuccessCount = 0;
    let insertionFailures = [];

    try {
      const result = await Question.insertMany(data.questions, { ordered: false });
      insertSuccessCount = result.length;
      console.log(`\n[SUCCESS] Successfully inserted ${insertSuccessCount}/${data.questions.length} questions.`);
    } catch (insertErr) {
      console.error("\n[ERROR] Partial or full insertion failure detected!");
      console.error("Error Message:", insertErr.message);

      if (insertErr.insertedDocs) {
        insertSuccessCount = insertErr.insertedDocs.length;
        console.log(`Successfully inserted before error: ${insertSuccessCount}`);
      }

      if (insertErr.writeErrors && Array.isArray(insertErr.writeErrors)) {
        console.error(`Write Errors Count: ${insertErr.writeErrors.length}`);
        insertionFailures = insertErr.writeErrors.map((we) => ({
          index: we.index,
          code: we.code,
          errmsg: we.errmsg,
          failedQuestion: data.questions[we.index]?.questionText || "Unknown"
        }));
        console.error("Detailed Write Errors:", JSON.stringify(insertionFailures, null, 2));
      } else {
        insertionFailures.push({ message: insertErr.message });
      }
    }

    // After count
    const afterCounts = await getGroupedCounts();
    console.log("\n=== AFTER COUNTS (by roundType) ===");
    console.log(JSON.stringify(afterCounts, null, 2));

    console.log("\n=== INSERTION SUMMARY ===");
    console.log(`Target Count in Draft: ${data.questions.length}`);
    console.log(`Successfully Inserted: ${insertSuccessCount}`);
    console.log(`Insertion Failures: ${insertionFailures.length}`);

  } catch (err) {
    console.error("Script execution failed:", err.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("[db] Disconnected from MongoDB.");
    }
  }
}

run();
