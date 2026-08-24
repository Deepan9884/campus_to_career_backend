/**
 * Clean Fake Super Dream Data Script
 * 
 * This script deletes ALL Super Dream records from the database,
 * forcing a fresh clean start with 0% completion for all students.
 * 
 * Usage:
 *   node scripts/cleanFakeSuperDreamData.js
 * 
 * Or to clean a specific user:
 *   node scripts/cleanFakeSuperDreamData.js USER_EMAIL
 */

require("dotenv").config();
const mongoose = require("mongoose");
const SuperDream = require("../src/models/SuperDream.model");
const User = require("../src/models/User.model");

async function cleanAllFakeSuperDreamData() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    const targetEmail = process.argv[2];

    if (targetEmail) {
      // Clean specific user
      console.log(`🎯 Cleaning Super Dream data for: ${targetEmail}`);
      
      const user = await User.findOne({ email: targetEmail });
      if (!user) {
        console.log(`❌ User not found: ${targetEmail}`);
        process.exit(1);
      }

      const result = await SuperDream.deleteOne({ student: user._id });
      
      if (result.deletedCount > 0) {
        console.log(`✅ Deleted Super Dream record for: ${user.name} (${user.email})`);
      } else {
        console.log(`ℹ️  No Super Dream record found for: ${user.name} (${user.email})`);
      }
    } else {
      // Clean ALL users
      console.log("🧹 Cleaning ALL Super Dream data from database...");
      console.log("⚠️  WARNING: This will delete Super Dream data for ALL students!\n");

      const count = await SuperDream.countDocuments();
      console.log(`📊 Found ${count} Super Dream records\n`);

      if (count === 0) {
        console.log("ℹ️  No Super Dream data to clean. Database is already empty.");
      } else {
        const result = await SuperDream.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} Super Dream records`);
      }
    }

    console.log("\n✨ Database cleanup complete!");
    console.log("📝 Next steps:");
    console.log("   1. Students should click 'Reset to 0%' button in Super Dream section");
    console.log("   2. Or logout and login to auto-create fresh clean records");
    console.log("   3. All sections will show 0% completion\n");

  } catch (error) {
    console.error("❌ Error cleaning database:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
  }
}

cleanAllFakeSuperDreamData();
