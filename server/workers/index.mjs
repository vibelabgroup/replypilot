import { redis, dequeueJob, publish } from '../utils/redis.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { processAIGenerationJob } from '../services/aiService.mjs';
import { sendSms } from '../sms/gateway.mjs';
import { processNotificationJob } from '../services/notificationService.mjs';

// Worker configuration
const WORKER_CONFIG = {
  ai: {
    queue: 'ai_queue',
    concurrency: 5,
    handler: processAIGenerationJob,
  },
  sms: {
    queue: 'sms_queue',
    concurrency: 10,
    handler: async (job) => {
      const { customerId, to, body, options } = job;
      return await sendSms({
        customerId,
        to,
        body,
        from: options?.from,
        options,
      });
    },
  },
  notifications: {
    queue: 'notification_queue',
    concurrency: 5,
    handler: processNotificationJob,
  },
};

// Process a job
const processJob = async (queueName, job, handler) => {
  const startTime = Date.now();
  
  try {
    logDebug(`Processing job from ${queueName}`, { jobId: job.createdAt });
    
    const result = await handler(job);
    
    const duration = Date.now() - startTime;
    logInfo(`Job completed from ${queueName}`, {
      jobId: job.createdAt,
      duration: `${duration}ms`,
      success: result.success,
    });
    
    // Publish completion event
    await publish(`worker:${queueName}:completed`, {
      jobId: job.createdAt,
      customerId: job.customerId,
      duration,
      success: result.success,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(`Job failed from ${queueName}`, {
      jobId: job.createdAt,
      duration: `${duration}ms`,
      error: error.message,
    });
    
    // Publish failure event
    await publish(`worker:${queueName}:failed`, {
      jobId: job.createdAt,
      customerId: job.customerId,
      duration,
      error: error.message,
    });
    
    throw error;
  }
};

// Worker runner
const runWorker = async (workerType) => {
  const config = WORKER_CONFIG[workerType];
  if (!config) {
    throw new Error(`Unknown worker type: ${workerType}`);
  }
  
  logInfo(`Starting ${workerType} worker`, { queue: config.queue, concurrency: config.concurrency });
  
  // Track active jobs
  let activeJobs = 0;
  const maxConcurrency = config.concurrency;
  
  const processNextJob = async () => {
    if (activeJobs >= maxConcurrency) {
      return;
    }
    
    const job = await dequeueJob(config.queue, 5);
    
    if (!job) {
      // No job available, wait and try again
      setTimeout(processNextJob, 1000);
      return;
    }
    
    activeJobs++;
    
    // Handle delay for AI responses
    if (job.delayMs && job.scheduledFor > Date.now()) {
      const delay = job.scheduledFor - Date.now();
      logDebug(`Delaying AI response`, { delay: `${delay}ms`, customerId: job.customerId });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    processJob(config.queue, job, config.handler)
      .catch(error => {
        // Error already logged in processJob
      })
      .finally(() => {
        activeJobs--;
        // Immediately try to get next job
        processNextJob();
      });
    
    // Try to get more jobs up to concurrency limit
    if (activeJobs < maxConcurrency) {
      processNextJob();
    }
  };
  
  // Start multiple workers
  const workers = [];
  for (let i = 0; i < maxConcurrency; i++) {
    workers.push(processNextJob());
  }
  
  await Promise.all(workers);
};

// Main worker loop
const startWorker = async () => {
  const workerType = process.argv[2] || 'all';
  
  try {
    logInfo('Worker starting', { type: workerType });
    
    // Wait for Redis to be ready
    if (redis.status !== 'ready') {
      await new Promise((resolve) => {
        redis.once('ready', resolve);
      });
    }
    
    if (workerType === 'all') {
      // Run all worker types in parallel
      await Promise.all([
        runWorker('ai'),
        runWorker('sms'),
        runWorker('notifications'),
      ]);
    } else if (WORKER_CONFIG[workerType]) {
      await runWorker(workerType);
    } else {
      throw new Error(`Unknown worker type: ${workerType}. Available: ${Object.keys(WORKER_CONFIG).join(', ')}`);
    }
  } catch (error) {
    logError('Worker failed', { error: error.message });
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = () => {
  logInfo('Worker shutting down gracefully');
  redis.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the worker
startWorker();