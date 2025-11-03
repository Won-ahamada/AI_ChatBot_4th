const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const parserService = require('../services/parser');
const indexerService = require('../services/indexer');
const logger = require('../infra/logger');
const redis = require('../infra/redis');
const { ValidationError, NotFoundError } = require('../infra/errorHandler');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`Unsupported file type: ${file.mimetype}`), false);
    }
  }
});

// List files endpoint
router.get('/files', async (req, res) => {
  try {
    const files = await parserService.listFiles();

    res.json({
      files: files.map(file => ({
        name: file.filename,
        filename: file.filename, // For backward compatibility
        size: file.size,
        modified: file.modified,
        extension: file.extension
      }))
    });

  } catch (error) {
    logger.error('List files error:', error);
    throw error;
  }
});

// Upload files endpoint
router.post('/files', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new ValidationError('No files provided');
    }

    const results = [];

    for (const file of req.files) {
      try {
        logger.info(`Processing upload: ${file.originalname} (${file.mimetype})`);

        // Validate file type
        if (!parserService.isSupported(file.mimetype)) {
          results.push({
            filename: file.originalname,
            success: false,
            error: `Unsupported file type: ${file.mimetype}`
          });
          continue;
        }

        // Save file to storage
        const savedFile = await parserService.saveFile(file.buffer, file.originalname);

        // Queue for indexing
        const indexResult = await indexerService.indexDocument(
          savedFile.filePath,
          savedFile.filename,
          file.mimetype
        );

        results.push({
          filename: file.originalname,
          savedAs: savedFile.filename,
          success: true,
          queued: true,
          docId: indexResult.docId,
          size: savedFile.size
        });

        logger.info(`File uploaded and queued: ${file.originalname} -> ${savedFile.filename}`);

      } catch (error) {
        logger.error(`Upload failed for ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    res.json({
      message: `${successCount}/${totalCount} files uploaded successfully`,
      files: results,
      ok: successCount > 0,
      queued: successCount > 0
    });

  } catch (error) {
    logger.error('File upload error:', error);
    throw error;
  }
});

// Delete file endpoint
router.delete('/files/:name', async (req, res) => {
  try {
    const filename = req.params.name;

    if (!filename) {
      throw new ValidationError('Filename is required');
    }

    // Check if file exists
    const files = await parserService.listFiles();
    const fileExists = files.some(f => f.filename === filename);

    if (!fileExists) {
      throw new NotFoundError(`File not found: ${filename}`);
    }

    // Get document ID from filename (you might want to store this mapping)
    // For now, we'll try to find it in the vector store
    try {
      // Delete from file system
      await parserService.deleteFile(filename);

      // Clear related cache entries
      const cachePattern = `*${filename}*`;
      await redis.flush(cachePattern);

      logger.info(`File deleted: ${filename}`);

      res.json({
        message: `File deleted: ${filename}`,
        success: true
      });

    } catch (deleteError) {
      logger.error(`Failed to delete file ${filename}:`, deleteError);
      throw new Error(`Failed to delete file: ${deleteError.message}`);
    }

  } catch (error) {
    logger.error('File deletion error:', error);
    throw error;
  }
});

// Reindex file endpoint
router.post('/reindex/:name', async (req, res) => {
  try {
    const filename = req.params.name;

    if (!filename) {
      throw new ValidationError('Filename is required');
    }

    // Check if file exists
    const files = await parserService.listFiles();
    const file = files.find(f => f.filename === filename);

    if (!file) {
      throw new NotFoundError(`File not found: ${filename}`);
    }

    // Determine file path and MIME type
    const filePath = path.join(parserService.storageDir, filename);
    const ext = path.extname(filename).toLowerCase();

    const mimeTypeMap = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };

    const mimeType = mimeTypeMap[ext];
    if (!mimeType) {
      throw new ValidationError(`Unsupported file extension: ${ext}`);
    }

    // Generate a new document ID for reindexing
    const docId = require('crypto').randomUUID();

    // Queue for reindexing
    const result = await indexerService.reindexDocument(docId, filePath, filename, mimeType);

    // Clear related cache entries
    const cachePattern = `*${filename}*`;
    await redis.flush(cachePattern);

    logger.info(`File queued for reindexing: ${filename}`);

    res.json({
      message: `File queued for reindexing: ${filename}`,
      docId: result.docId,
      queued: result.queued,
      success: true
    });

  } catch (error) {
    logger.error('File reindex error:', error);
    throw error;
  }
});

// Get indexing stats endpoint
router.get('/files/stats', async (req, res) => {
  try {
    const stats = await indexerService.getIndexingStats();

    res.json({
      queues: stats,
      collection: stats.collection || {},
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Stats retrieval error:', error);
    throw error;
  }
});

module.exports = router;