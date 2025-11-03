const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../infra/logger');
const qdrant = require('../infra/qdrant');
const embeddingService = require('./embedding');
const parserService = require('./parser');
const queueService = require('../infra/queue');

class IndexerService {
  constructor() {
    this.chunkSize = config.document.chunkSize;
    this.chunkOverlap = config.document.chunkOverlap;
    this.setupWorkers();
  }

  setupWorkers() {
    // Parse queue worker
    queueService.createWorker('parse', async (job) => {
      const { filePath, filename, mimeType, docId } = job.data;
      logger.info(`Processing parse job for: ${filename}`);

      try {
        const document = await parserService.parseFile(filePath, filename, mimeType);
        document.id = docId; // Use provided doc ID

        // Add to embed queue
        await queueService.addJob('embed', 'embedDocument', {
          document,
          filename
        });

        return { success: true, document };
      } catch (error) {
        logger.error(`Parse job failed for ${filename}:`, error);
        throw error;
      }
    }, 4);

    // Embed queue worker
    queueService.createWorker('embed', async (job) => {
      const { document, filename } = job.data;
      logger.info(`Processing embed job for: ${filename}`);

      try {
        const chunks = this.createChunks(document);
        const embeddedChunks = await embeddingService.embedChunks(chunks);

        // Add to upsert queue
        await queueService.addJob('upsert', 'upsertDocument', {
          document,
          chunks: embeddedChunks,
          filename
        });

        return { success: true, chunksCount: embeddedChunks.length };
      } catch (error) {
        logger.error(`Embed job failed for ${filename}:`, error);
        throw error;
      }
    }, 4);

    // Upsert queue worker
    queueService.createWorker('upsert', async (job) => {
      const { document, chunks, filename } = job.data;
      logger.info(`Processing upsert job for: ${filename}`);

      try {
        await this.upsertToQdrant(document, chunks);
        logger.info(`Successfully indexed ${filename}: ${chunks.length} chunks`);
        return { success: true, chunksCount: chunks.length };
      } catch (error) {
        logger.error(`Upsert job failed for ${filename}:`, error);
        throw error;
      }
    }, 2);
  }

  async indexDocument(filePath, filename, mimeType) {
    try {
      const docId = uuidv4();

      // Add to parse queue
      await queueService.addJob('parse', 'parseDocument', {
        filePath,
        filename,
        mimeType,
        docId
      });

      logger.info(`Document ${filename} queued for indexing with ID: ${docId}`);
      return { docId, queued: true };

    } catch (error) {
      logger.error(`Failed to queue document ${filename}:`, error);
      throw error;
    }
  }

  async reindexDocument(docId, filePath, filename, mimeType) {
    try {
      // Delete existing document from Qdrant
      await qdrant.deleteByDocId(docId);
      logger.info(`Deleted existing document: ${docId}`);

      // Re-add to parse queue with same doc ID
      await queueService.addJob('parse', 'parseDocument', {
        filePath,
        filename,
        mimeType,
        docId
      });

      logger.info(`Document ${filename} queued for reindexing with ID: ${docId}`);
      return { docId, queued: true };

    } catch (error) {
      logger.error(`Failed to reindex document ${filename}:`, error);
      throw error;
    }
  }

  createChunks(document) {
    const chunks = [];

    document.pages.forEach(page => {
      const pageText = page.text;
      const pageChunks = this.splitTextIntoChunks(pageText, this.chunkSize, this.chunkOverlap);

      pageChunks.forEach((chunkText, chunkIndex) => {
        chunks.push({
          id: uuidv4(),
          doc_id: document.id,
          chunk_id: `${document.id}_p${page.page}_c${chunkIndex}`,
          source: document.source,
          title: document.filename,
          page: page.page,
          text: chunkText,
          mime: document.mimeType,
          updated_at: document.parsedAt
        });
      });
    });

    logger.info(`Created ${chunks.length} chunks for document ${document.filename}`);
    return chunks;
  }

  splitTextIntoChunks(text, chunkSize, overlap) {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastSentence = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const lastSpace = text.lastIndexOf(' ', end);

        const breakPoint = Math.max(lastSentence, lastNewline, lastSpace);
        if (breakPoint > start + chunkSize * 0.5) {
          end = breakPoint + 1;
        }
      }

      chunks.push(text.substring(start, end).trim());

      // Move start position with overlap
      start = Math.max(start + 1, end - overlap);

      // Avoid infinite loop
      if (start >= text.length - 1) break;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  async upsertToQdrant(document, chunks) {
    try {
      const points = chunks.map(chunk => ({
        id: chunk.id,
        vector: chunk.vector,
        payload: {
          doc_id: chunk.doc_id,
          chunk_id: chunk.chunk_id,
          source: chunk.source,
          title: chunk.title,
          page: chunk.page,
          text: chunk.text,
          mime: chunk.mime,
          updated_at: chunk.updated_at
        }
      }));

      await qdrant.upsert(points);
      logger.info(`Upserted ${points.length} points for document ${document.filename}`);

    } catch (error) {
      logger.error(`Failed to upsert document ${document.filename}:`, error);
      throw error;
    }
  }

  async deleteDocument(docId) {
    try {
      await qdrant.deleteByDocId(docId);
      logger.info(`Deleted document: ${docId}`);
    } catch (error) {
      logger.error(`Failed to delete document ${docId}:`, error);
      throw error;
    }
  }

  async getIndexingStats() {
    try {
      const stats = {};

      for (const queueName of ['parse', 'embed', 'upsert']) {
        stats[queueName] = await queueService.getQueueStats(queueName);
      }

      const collectionInfo = await qdrant.getCollectionInfo();
      stats.collection = {
        points_count: collectionInfo.points_count,
        vectors_count: collectionInfo.vectors_count
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get indexing stats:', error);
      return {};
    }
  }
}

module.exports = new IndexerService();