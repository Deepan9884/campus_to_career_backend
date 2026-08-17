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

connection.on("error", () => {
  // Suppress uncaught Redis connection error logs when Redis is not running
});

// Create Queues
const resumeQueue = new Queue("resume-analysis", { connection });
const githubQueue = new Queue("github-analysis", { connection });

// In-Memory Concurrency Pool for seamless multi-user background tasks when Redis is offline
class InMemoryQueuePool {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.activeWorkers = 0;
    this.queue = [];
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const { fn, resolve, reject } = this.queue.shift();
    this.activeWorkers++;

    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.activeWorkers--;
      this.processNext();
    }
  }
}

const memoryPool = new InMemoryQueuePool(6);

/**
 * Helper function to add a job to a queue with graceful non-blocking worker pool fallback
 */
async function enqueueJob(queueName, jobName, data) {
  try {
    if (queueName === "resume-analysis") {
      return await resumeQueue.add(jobName, data);
    }
    if (queueName === "github-analysis") {
      return await githubQueue.add(jobName, data);
    }
  } catch (err) {
    console.warn(`[Queue] Redis unavailable (${err.message}). Dispatched ${jobName} into adaptive memory pool.`);
    
    // Execute job asynchronously via managed in-memory worker pool
    if (queueName === "resume-analysis") {
      const { processResumeAnalysis } = require("../workers/resume.worker");
      if (processResumeAnalysis) {
        memoryPool.enqueue(() => processResumeAnalysis(data)).catch((e) =>
          console.error("[MemoryPool] Resume analysis worker error:", e.message)
        );
        return { id: `pool-${Date.now()}` };
      }
    }
    
    if (queueName === "github-analysis") {
      const { processGithubAnalysis } = require("../workers/github.worker");
      if (processGithubAnalysis) {
        memoryPool.enqueue(() => processGithubAnalysis(data)).catch((e) =>
          console.error("[MemoryPool] GitHub analysis worker error:", e.message)
        );
        return { id: `pool-${Date.now()}` };
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
  memoryPool,
};
