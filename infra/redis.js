const { createClient } = require('redis');
const config = require('../config');
const logger = require('./logger');

class RedisClient {
  constructor() {
    this.client = createClient({
      url: config.redis.url
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
    });

    this.client.on('end', () => {
      logger.info('Redis disconnected');
    });
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect() {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  async get(key) {
    try {
      await this.connect();
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key, value, ttl = config.cache.ttl) {
    try {
      await this.connect();
      if (ttl) {
        return await this.client.setEx(key, ttl, JSON.stringify(value));
      }
      return await this.client.set(key, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      await this.connect();
      return await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  }

  async keys(pattern) {
    try {
      await this.connect();
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error:', error);
      return [];
    }
  }

  async flush(pattern) {
    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        return await this.client.del(keys);
      }
      return 0;
    } catch (error) {
      logger.error('Redis FLUSH error:', error);
      return 0;
    }
  }

  generateKey(type, ...parts) {
    const keyMap = {
      embedding: (model, text) => `emb:${model}:${this.hash(text)}`,
      retrieval: (query, topk, ver = '1') => `retr:${this.hash(query)}:${topk}:${ver}`,
      rerank: (query, searchK, topK, ver = '1') => `rrk:${this.hash(query)}:${searchK}:${topK}:${ver}`,
      answer: (llm, user, ctx, tpl = 'v2.1') => `ans:${llm}:${this.hash(user)}:${this.hash(ctx)}:${tpl}`,
      doc_status: (docId) => `doc:${docId}:status`,
      session_history: (sessionId) => `sess:${sessionId}`
    };

    const generator = keyMap[type];
    if (!generator) {
      throw new Error(`Unknown cache key type: ${type}`);
    }

    return generator(...parts);
  }

  hash(text) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }
}

module.exports = new RedisClient();