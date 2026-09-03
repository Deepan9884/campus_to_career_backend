/**
 * Cleanup script to remove duplicate and failed GitHub analyses
 * Keeps only the most recent successful analysis per repository per user
 */

require("dotenv").config();
const mongoose = require("mongoose");
const RepoAnalysis = require("../src/models/RepoAnalysis.model");

async function cleanupDuplicates() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Step 1: Delete all failed analyses
    console.log("\n🗑️  Removing failed analyses...");
    const failedResult = await RepoAnalysis.deleteMany({ status: "failed" });
    console.log(`   Deleted ${failedResult.deletedCount} failed analyses`);

    // Step 2: Delete all processing analyses older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    console.log("\n🗑️  Removing stale processing analyses...");
    const staleResult = await RepoAnalysis.deleteMany({
      status: "processing",
      createdAt: { $lt: oneHourAgo },
    });
    console.log(`   Deleted ${staleResult.deletedCount} stale processing analyses`);

    // Step 3: Find and remove duplicate completed analyses
    console.log("\n🔍 Finding duplicate completed analyses...");
    const allCompleted = await RepoAnalysis.find({ status: "completed" })
      .sort({ createdAt: -1 })
      .lean();

    const seen = new Map(); // Key: "userId-repoFullName", Value: latest analysis ID
    const duplicateIds = [];

    for (const analysis of allCompleted) {
      const key = `${analysis.user}-${analysis.repoFullName}`;
      
      if (seen.has(key)) {
        // This is a duplicate - mark for deletion
        duplicateIds.push(analysis._id);
      } else {
        // This is the first (most recent) - keep it
        seen.set(key, analysis._id);
      }
    }

    if (duplicateIds.length > 0) {
      console.log(`\n🗑️  Removing ${duplicateIds.length} duplicate analyses...`);
      const dupResult = await RepoAnalysis.deleteMany({
        _id: { $in: duplicateIds },
      });
      console.log(`   Deleted ${dupResult.deletedCount} duplicates`);
    } else {
      console.log("   No duplicates found");
    }

    // Step 4: Show final statistics
    console.log("\n📊 Final Statistics:");
    const finalStats = await RepoAnalysis.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    finalStats.forEach((stat) => {
      console.log(`   ${stat._id}: ${stat.count}`);
    });

    const totalCount = await RepoAnalysis.countDocuments();
    console.log(`   Total: ${totalCount}`);

    console.log("\n✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

cleanupDuplicates();
