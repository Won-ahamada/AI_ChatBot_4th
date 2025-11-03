const { QdrantClient } = require('@qdrant/js-client-rest');
const config = require('../config');
const logger = require('./logger');

class QdrantService {
  constructor() {
    this.client = new QdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey || undefined
    });
    this.collection = config.qdrant.collection;
  }

  async ensureCollection() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collection);

      if (!exists) {
        logger.info(`Creating Qdrant collection: ${this.collection}`);
        await this.client.createCollection(this.collection, {
          vectors: {
            size: 3072, // text-embedding-3-large vector size
            distance: 'Cosine'
          },
          hnsw_config: {
            ef_construct: 128,
            m: 16
          }
        });

        // Create payload indexes
        await this.client.createPayloadIndex(this.collection, {
          field_name: 'doc_id',
          field_schema: 'keyword'
        });

        await this.client.createPayloadIndex(this.collection, {
          field_name: 'page',
          field_schema: 'integer'
        });

        await this.client.createPayloadIndex(this.collection, {
          field_name: 'updated_at',
          field_schema: 'datetime'
        });

        logger.info(`Qdrant collection ${this.collection} created successfully`);
      }
    } catch (error) {
      logger.error('Error ensuring Qdrant collection:', error);
      throw error;
    }
  }

  async search(vector, limit = 20, scoreThreshold = 0.1, filter = null) {
    try {
      const searchParams = {
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
        params: {
          ef: 64,
          exact: false
        }
      };

      if (filter) {
        searchParams.filter = filter;
      }

      const result = await this.client.search(this.collection, searchParams);
      return result;
    } catch (error) {
      logger.error('Qdrant search error:', error);
      throw error;
    }
  }

  async upsert(points) {
    try {
      if (!Array.isArray(points)) {
        points = [points];
      }

      const result = await this.client.upsert(this.collection, {
        wait: true,
        points
      });

      return result;
    } catch (error) {
      logger.error('Qdrant upsert error:', error);
      throw error;
    }
  }

  async deleteByDocId(docId) {
    try {
      const result = await this.client.delete(this.collection, {
        filter: {
          must: [
            {
              key: 'doc_id',
              match: { value: docId }
            }
          ]
        }
      });

      logger.info(`Deleted ${result.operation_id} points for document: ${docId}`);
      return result;
    } catch (error) {
      logger.error('Qdrant delete error:', error);
      throw error;
    }
  }

  async getCollectionInfo() {
    try {
      return await this.client.getCollection(this.collection);
    } catch (error) {
      logger.error('Qdrant collection info error:', error);
      throw error;
    }
  }

  async scroll(filter = null, limit = 100, offset = null) {
    try {
      const scrollParams = {
        limit,
        with_payload: true,
        with_vector: false
      };

      if (filter) {
        scrollParams.filter = filter;
      }

      if (offset) {
        scrollParams.offset = offset;
      }

      return await this.client.scroll(this.collection, scrollParams);
    } catch (error) {
      logger.error('Qdrant scroll error:', error);
      throw error;
    }
  }
}

module.exports = new QdrantService();