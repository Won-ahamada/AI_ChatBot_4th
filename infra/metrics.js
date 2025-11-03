const promClient = require('prom-client');
const logger = require('./logger');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const chatLatency = new promClient.Histogram({
  name: 'chat_latency_seconds',
  help: 'Chat response latency in seconds',
  labelNames: ['model'],
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const qdrantSearchLatency = new promClient.Histogram({
  name: 'qdrant_search_latency_seconds',
  help: 'Qdrant search latency in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
});

const llmLatency = new promClient.Histogram({
  name: 'llm_latency_seconds',
  help: 'LLM API latency in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const cacheHitRate = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type']
});

const cacheMissRate = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type']
});

const queueLag = new promClient.Gauge({
  name: 'queue_lag_seconds',
  help: 'Queue processing lag in seconds',
  labelNames: ['queue_name']
});

const errorRate = new promClient.Counter({
  name: 'errors_total',
  help: 'Total errors',
  labelNames: ['type', 'route']
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(chatLatency);
register.registerMetric(qdrantSearchLatency);
register.registerMetric(llmLatency);
register.registerMetric(cacheHitRate);
register.registerMetric(cacheMissRate);
register.registerMetric(queueLag);
register.registerMetric(errorRate);

// Middleware
const middleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });

  next();
};

// Metrics collection functions
const metrics = {
  register,

  middleware,

  recordChatLatency: (model, duration) => {
    chatLatency.labels(model).observe(duration);
  },

  recordQdrantLatency: (duration) => {
    qdrantSearchLatency.observe(duration);
  },

  recordLLMLatency: (provider, model, duration) => {
    llmLatency.labels(provider, model).observe(duration);
  },

  recordCacheHit: (type) => {
    cacheHitRate.labels(type).inc();
  },

  recordCacheMiss: (type) => {
    cacheMissRate.labels(type).inc();
  },

  recordQueueLag: (queueName, lag) => {
    queueLag.labels(queueName).set(lag);
  },

  recordError: (type, route) => {
    errorRate.labels(type, route).inc();
  },

  async getMetrics() {
    try {
      return await register.metrics();
    } catch (error) {
      logger.error('Error getting metrics:', error);
      return '';
    }
  }
};

module.exports = metrics;