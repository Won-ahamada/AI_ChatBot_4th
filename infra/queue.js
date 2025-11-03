const { Queue, Worker } = require('bullmq');
const config = require('../config');
const logger = require('./logger');

class QueueService {
  constructor() {
    this.connection = {
      host: config.redis.url.includes('://') ?
        new URL(config.redis.url).hostname : 'localhost',
      port: config.redis.url.includes('://') ?
        new URL(config.redis.url).port || 6379 : 6379
    };

    this.queues = {
      parse: new Queue('parse', { connection: this.connection }),
      embed: new Queue('embed', { connection: this.connection }),
      upsert: new Queue('upsert', { connection: this.connection })
    };

    this.workers = {};
  }

  async addJob(queueName, jobName, data, options = {}) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const job = await queue.add(jobName, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        ...options
      });

      logger.info(`Job added to ${queueName}: ${job.id}`);
      return job;
    } catch (error) {
      logger.error(`Error adding job to ${queueName}:`, error);
      throw error;
    }
  }

  createWorker(queueName, processor, concurrency = 1) {
    const worker = new Worker(queueName, processor, {
      connection: this.connection,
      concurrency
    });

    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed in queue ${queueName}:`, err);
    });

    worker.on('error', (err) => {
      logger.error(`Worker error in queue ${queueName}:`, err);
    });

    this.workers[queueName] = worker;
    return worker;
  }

  async getQueueStats(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    } catch (error) {
      logger.error(`Error getting stats for queue ${queueName}:`, error);
      return null;
    }
  }

  async closeAll() {
    try {
      // Close all workers
      await Promise.all(
        Object.values(this.workers).map(worker => worker.close())
      );

      // Close all queues
      await Promise.all(
        Object.values(this.queues).map(queue => queue.close())
      );

      logger.info('All queues and workers closed');
    } catch (error) {
      logger.error('Error closing queues:', error);
    }
  }
}

module.exports = new QueueService();