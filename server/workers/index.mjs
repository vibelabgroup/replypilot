import { redis, dequeueJob, publish } from '../utils/redis.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { processAIGenerationJob } from '../services/aiService.mjs';
import { sendSms } from '../sms/gateway.mjs';
import { processNotificationJob } from '../services/notificationService.mjs';
import { processEmailDraftJob } from '../services/emailDraftService.mjs';
import { getAccountsDueForSync } from '../services/emailTokenService.mjs';
import { syncEmailAccount } from '../services/emailIngestionService.mjs';

// Worker configuration
const WORKER_CONFIG = {
  ai: {
    queue: 'ai_queue',
    concurrency: 5,
    handler: processAIGenerationJob,
  },
  shop: {
    queue: 'shop_sync_queue',
    concurrency: 2,
    handler: async (job) => {
      const { type } = job || {};
      const { runProductSync, runOrderSync } = await import('../services/storeIntegrationService.mjs');

      if (type === 'shop_sync_products') {
        return await runProductSync(job);
      }
      if (type === 'shop_sync_orders') {
        return await runOrderSync(job);
      }

      throw new Error(`Unknown shop sync job type: ${type}`);
    },
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
  emailDraft: {
    queue: 'email_draft_queue',
    concurrency: 3,
    handler: processEmailDraftJob,
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
        runWorker('emailDraft'),
        runEmailSyncScheduler(),
        runStoreSyncScheduler(),
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

// ---------------------------------------------------------------------------
// Email sync scheduler – polls email accounts on their next_sync_at cadence
// ---------------------------------------------------------------------------

let emailSyncRunning = true;

const runEmailSyncScheduler = async () => {
  logInfo('Starting email sync scheduler');

  while (emailSyncRunning) {
    try {
      const accounts = await getAccountsDueForSync();

      for (const account of accounts) {
        try {
          await syncEmailAccount(account);
        } catch (err) {
          logError('Email sync failed for account', {
            emailAccountId: account.id,
            error: err?.message,
          });
        }
      }
    } catch (err) {
      logError('Email sync scheduler error', { error: err?.message });
    }

    // Sleep 30s between scheduler ticks
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
};

// ---------------------------------------------------------------------------
// Store sync scheduler – triggers product/order syncs for store connections
// ---------------------------------------------------------------------------

let storeSyncRunning = true;

const runStoreSyncScheduler = async () => {
  logInfo('Starting store sync scheduler');
  const { enqueueJob } = await import('../utils/redis.mjs');
  const { query } = await import('../utils/db.mjs');

  while (storeSyncRunning) {
    try {
      const result = await query(
        `SELECT id, customer_id
         FROM store_connections
         WHERE status = 'active'
           AND (next_sync_at IS NULL OR next_sync_at <= NOW())
         ORDER BY last_sync_at ASC NULLS FIRST
         LIMIT 20`,
        []
      );

      for (const conn of result.rows) {
        await enqueueJob('shop_sync_queue', {
          type: 'shop_sync_products',
          storeConnectionId: conn.id,
          customerId: conn.customer_id,
          createdAt: Date.now(),
        });

        await enqueueJob('shop_sync_queue', {
          type: 'shop_sync_orders',
          storeConnectionId: conn.id,
          customerId: conn.customer_id,
          createdAt: Date.now(),
        });

        // Schedule next sync
        await query(
          `UPDATE store_connections
           SET next_sync_at = NOW() + (sync_interval_minutes || ' minutes')::INTERVAL,
               updated_at = NOW()
           WHERE id = $1`,
          [conn.id]
        );
      }
    } catch (err) {
      logError('Store sync scheduler error', { error: err?.message });
    }

    // Sleep 60s between scheduler ticks
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
};

// Graceful shutdown
const shutdown = () => {
  logInfo('Worker shutting down gracefully');
  emailSyncRunning = false;
  storeSyncRunning = false;
  redis.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the worker
startWorker();