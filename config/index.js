require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT) || 3000,

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    rerankModel: process.env.OPENAI_RERANK_MODEL || 'text-embedding-3-large-rerank',
    embedModel: process.env.EMBED_MODEL || 'text-embedding-3-large'
  },

  // Qdrant
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION || 'keris_docs'
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // Cache
  cache: {
    ttl: parseInt(process.env.CACHE_TTL_SECONDS) || 3600
  },

  // RAG
  rag: {
    topK: parseInt(process.env.TOP_K) || 6,
    searchK: parseInt(process.env.SEARCH_K) || 20,
    mmrLambda: parseFloat(process.env.MMR_LAMBDA) || 0.3,
    maxHistoryTurns: parseInt(process.env.MAX_HISTORY_TURNS) || 8
  },

  // Document Processing
  document: {
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 1200,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 180,
    storageDir: process.env.FILE_STORAGE_DIR || './storage'
  },

  // Queue
  queue: {
    driver: process.env.QUEUE_DRIVER || 'bullmq'
  },

  // Security
  security: {
    rateLimitRpm: parseInt(process.env.RATE_LIMIT_RPM) || 60,
    apiKey: process.env.API_KEY
  },

  // Performance
  performance: {
    timeoutMs: parseInt(process.env.TIMEOUT_MS) || 30000
  },

  // Observability
  observability: {
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }
};

// Validation
if (!config.openai.apiKey) {
  throw new Error('OPENAI_API_KEY is required');
}

if (!config.security.apiKey) {
  throw new Error('API_KEY is required');
}

module.exports = config;