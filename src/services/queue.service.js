const { Queue } = require("bullmq");
const IORedis = require("ioredis");

// Provide a default Redis connection string if not in env
const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
});

connection.on("error", (err) => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});

// Create Queues
const resumeQueue = new Queue("resume-analysis", { connection });
const githubQueue = new Queue("github-analysis", { connection });

// Helper function to add a job to a queue with graceful inline fallback
async function enqueueJob(queueName, jobName, data) {
  try {
    if (queueName === "resume-analysis") {
      return await resumeQueue.add(jobName, data);
    }
    if (queueName === "github-analysis") {
      return await githubQueue.add(jobName, data);
    }
  } catch (err) {
    console.warn(`[Queue] Redis queue unavailable (${err.message}). Processing ${jobName} inline in background...`);
    
    // Execute job asynchronously in background
    if (queueName === "resume-analysis") {
      const { processResumeAnalysis } = require("../workers/resume.worker");
      if (processResumeAnalysis) {
        processResumeAnalysis(data).catch((e) =>
          console.error("[Fallback] Resume analysis error:", e.message)
        );
        return { id: `inline-${Date.now()}` };
      }
    }
    
    if (queueName === "github-analysis") {
      const { processGithubAnalysis } = require("../workers/github.worker");
      if (processGithubAnalysis) {
        processGithubAnalysis(data).catch((e) =>
          console.error("[Fallback] GitHub analysis error:", e.message)
        );
        return { id: `inline-${Date.now()}` };
      }
    }

    throw err;
  }
  throw new Error(`Queue ${queueName} not found`);
}

module.exports = {
  connection,
  resumeQueue,
  githubQueue,
  enqueueJob,
};
