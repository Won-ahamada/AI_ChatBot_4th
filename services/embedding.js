const OpenAI = require('openai');
const config = require('../config');
const redis = require('../infra/redis');
const logger = require('../infra/logger');
const metrics = require('../infra/metrics');

class EmbeddingService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.embedModel;
  }

  async embedText(text, useCache = true) {
    const start = Date.now();

    try {
      // Check cache first
      if (useCache) {
        const cacheKey = redis.generateKey('embedding', this.model, text);
        const cached = await redis.get(cacheKey);

        if (cached) {
          metrics.recordCacheHit('embedding');
          logger.debug('Embedding cache hit');
          return JSON.parse(cached);
        }
        metrics.recordCacheMiss('embedding');
      }

      // Generate embedding
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;

      // Cache the result
      if (useCache) {
        const cacheKey = redis.generateKey('embedding', this.model, text);
        await redis.set(cacheKey, embedding);
      }

      const duration = (Date.now() - start) / 1000;
      metrics.recordLLMLatency('openai', this.model, duration);

      logger.debug(`Generated embedding for text (${text.length} chars) in ${duration}s`);
      return embedding;

    } catch (error) {
      const duration = (Date.now() - start) / 1000;
      logger.error('Embedding generation failed:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  async embedBatch(texts, useCache = true, batchSize = 16) {
    const embeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.embedText(text, useCache));

      try {
        const batchEmbeddings = await Promise.all(batchPromises);
        embeddings.push(...batchEmbeddings);

        // Add small delay between batches to avoid rate limits
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error(`Batch embedding failed for batch ${i}-${i + batchSize}:`, error);
        throw error;
      }
    }

    return embeddings;
  }

  async embedQuery(query) {
    logger.info(`Embedding query: "${query.substring(0, 100)}..."`);
    return await this.embedText(query, true);
  }

  async embedChunks(chunks) {
    logger.info(`Embedding ${chunks.length} chunks`);
    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await this.embedBatch(texts, true);

    return chunks.map((chunk, index) => ({
      ...chunk,
      vector: embeddings[index]
    }));
  }
}

module.exports = new EmbeddingService();