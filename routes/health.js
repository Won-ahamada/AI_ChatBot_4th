const express = require('express');
const config = require('../config');
const redis = require('../infra/redis');
const qdrant = require('../infra/qdrant');
const queueService = require('../infra/queue');
const metrics = require('../infra/metrics');
const logger = require('../infra/logger');

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  const healthCheck = {
    timestamp: new Date().toISOString(),
    service: 'keris-rag-chatbot',
    version: '2.1.0',
    status: 'healthy',
    checks: {}
  };

  let overallStatus = 'healthy';

  try {
    // Check Redis connection
    try {
      await redis.connect();
      await redis.set('health_check', 'ok', 10);
      const result = await redis.get('health_check');
      healthCheck.checks.redis = {
        status: result === '"ok"' ? 'healthy' : 'unhealthy',
        message: 'Redis connection successful'
      };
    } catch (error) {
      healthCheck.checks.redis = {
        status: 'unhealthy',
        message: `Redis connection failed: ${error.message}`
      };
      overallStatus = 'unhealthy';
    }

    // Check Qdrant connection
    try {
      await qdrant.ensureCollection();
      const collectionInfo = await qdrant.getCollectionInfo();
      healthCheck.checks.qdrant = {
        status: 'healthy',
        message: 'Qdrant connection successful',
        collection: config.qdrant.collection,
        points_count: collectionInfo.points_count || 0
      };
    } catch (error) {
      healthCheck.checks.qdrant = {
        status: 'unhealthy',
        message: `Qdrant connection failed: ${error.message}`
      };
      overallStatus = 'unhealthy';
    }

    // Check queue health
    try {
      const queueStats = {};
      for (const queueName of ['parse', 'embed', 'upsert']) {
        const stats = await queueService.getQueueStats(queueName);
        queueStats[queueName] = stats;
      }

      healthCheck.checks.queues = {
        status: 'healthy',
        message: 'Queues operational',
        stats: queueStats
      };
    } catch (error) {
      healthCheck.checks.queues = {
        status: 'unhealthy',
        message: `Queue check failed: ${error.message}`
      };
      overallStatus = 'degraded'; // Queues not critical for read operations
    }

    // Check OpenAI API (optional - just check if key is configured)
    healthCheck.checks.openai = {
      status: config.openai.apiKey ? 'configured' : 'not_configured',
      message: config.openai.apiKey ? 'OpenAI API key configured' : 'OpenAI API key missing',
      model: config.openai.model
    };

    if (!config.openai.apiKey) {
      overallStatus = 'unhealthy';
    }

    // System metrics
    healthCheck.checks.system = {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      node_version: process.version,
      platform: process.platform
    };

    healthCheck.status = overallStatus;

    const statusCode = overallStatus === 'healthy' ? 200 :
                      overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    logger.error('Health check error:', error);

    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;

    res.status(503).json(healthCheck);
  }
});

// Detailed status endpoint
router.get('/status', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      service: 'keris-rag-chatbot',
      version: '2.1.0',
      environment: process.env.NODE_ENV || 'development',
      config: {
        rag: {
          topK: config.rag.topK,
          searchK: config.rag.searchK,
          mmrLambda: config.rag.mmrLambda,
          maxHistoryTurns: config.rag.maxHistoryTurns
        },
        document: {
          chunkSize: config.document.chunkSize,
          chunkOverlap: config.document.chunkOverlap
        },
        cache: {
          ttl: config.cache.ttl
        }
      },
      queues: {},
      collection: {},
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        node_version: process.version,
        platform: process.platform,
        pid: process.pid
      }
    };

    // Get queue statistics
    try {
      for (const queueName of ['parse', 'embed', 'upsert']) {
        status.queues[queueName] = await queueService.getQueueStats(queueName);
      }
    } catch (error) {
      status.queues.error = error.message;
    }

    // Get collection info
    try {
      status.collection = await qdrant.getCollectionInfo();
    } catch (error) {
      status.collection.error = error.message;
    }

    res.json(status);

  } catch (error) {
    logger.error('Status endpoint error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
});

// Metrics endpoint (Prometheus format)
router.get('/metrics', async (req, res) => {
  try {
    const metrics_data = await metrics.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics_data);
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).text('Failed to get metrics');
  }
});

// Ready endpoint (for Kubernetes readiness probe)
router.get('/ready', async (req, res) => {
  try {
    // Check if essential services are ready
    await redis.connect();
    await qdrant.ensureCollection();

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Live endpoint (for Kubernetes liveness probe)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;