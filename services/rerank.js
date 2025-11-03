const OpenAI = require('openai');
const config = require('../config');
const redis = require('../infra/redis');
const logger = require('../infra/logger');
const metrics = require('../infra/metrics');
const { RerankError } = require('../infra/errorHandler');

class RerankService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.rerankModel;
    this.enabled = true; // Enable reranking by default
  }

  async rerank(query, documents, topK = config.rag.topK, useCache = true) {
    if (!this.enabled || documents.length === 0) {
      return documents.slice(0, topK);
    }

    const start = Date.now();

    try {
      // Check cache first
      if (useCache) {
        const cacheKey = redis.generateKey('rerank', query, config.rag.searchK, topK, 'v1');
        const cached = await redis.get(cacheKey);

        if (cached) {
          metrics.recordCacheHit('rerank');
          logger.debug('Rerank cache hit');
          return JSON.parse(cached);
        }
        metrics.recordCacheMiss('rerank');
      }

      // Prepare documents for reranking
      const texts = documents.map(doc => doc.payload.text);

      // Use OpenAI's new reranking capability via embeddings comparison
      const queryEmbedding = await this.openai.embeddings.create({
        model: this.model.replace('-rerank', ''), // Use base embedding model
        input: query,
        encoding_format: 'float'
      });

      const docEmbeddings = await this.openai.embeddings.create({
        model: this.model.replace('-rerank', ''),
        input: texts,
        encoding_format: 'float'
      });

      const queryVector = queryEmbedding.data[0].embedding;
      const docVectors = docEmbeddings.data.map(d => d.embedding);

      // Calculate relevance scores using cosine similarity
      const scoredDocuments = documents.map((doc, index) => {
        const docVector = docVectors[index];
        const similarity = this.cosineSimilarity(queryVector, docVector);

        return {
          ...doc,
          score: similarity,
          rerank_score: similarity
        };
      });

      // Sort by rerank score and take top K
      const reranked = scoredDocuments
        .sort((a, b) => b.rerank_score - a.rerank_score)
        .slice(0, topK);

      // Cache the result
      if (useCache) {
        const cacheKey = redis.generateKey('rerank', query, config.rag.searchK, topK, 'v1');
        await redis.set(cacheKey, reranked);
      }

      const duration = (Date.now() - start) / 1000;
      metrics.recordLLMLatency('openai', 'rerank', duration);

      logger.info(`Reranked ${documents.length} documents to top ${topK} in ${duration}s`);
      return reranked;

    } catch (error) {
      logger.error('Reranking failed:', error);

      // Fallback: return original documents sorted by vector search score
      logger.warn('Falling back to original vector search ranking');
      return documents
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async rankDocuments(query, documents, options = {}) {
    const topK = options.topK || config.rag.topK;
    const useCache = options.useCache !== false;

    if (documents.length <= topK) {
      return documents;
    }

    try {
      return await this.rerank(query, documents, topK, useCache);
    } catch (error) {
      logger.error('Document ranking failed:', error);
      // Return original documents as fallback
      return documents.slice(0, topK);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`Reranking ${enabled ? 'enabled' : 'disabled'}`);
  }
}

module.exports = new RerankService();