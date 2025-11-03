const express = require('express');
const ragService = require('../services/rag');
const logger = require('../infra/logger');
const metrics = require('../infra/metrics');
const { ValidationError, TimeoutError } = require('../infra/errorHandler');

const router = express.Router();

// Chat endpoint with SSE streaming
router.post('/chat', async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, model = 'chatgpt', history = [] } = req.body;

    // Validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new ValidationError('Message is required and must be a non-empty string');
    }

    if (message.length > 4000) {
      throw new ValidationError('Message is too long (max 4000 characters)');
    }

    if (!Array.isArray(history)) {
      throw new ValidationError('History must be an array');
    }

    if (history.length > 20) {
      throw new ValidationError('History is too long (max 20 turns)');
    }

    const validModels = ['chatgpt', 'claude', 'gemini'];
    if (!validModels.includes(model)) {
      throw new ValidationError(`Invalid model. Must be one of: ${validModels.join(', ')}`);
    }

    logger.info(`Chat request: ${message.substring(0, 100)}... (model: ${model})`);

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Helper function to send SSE data
    const sendSSE = (type, data) => {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Handle client disconnect
    req.on('close', () => {
      logger.info('Client disconnected from chat stream');
      res.end();
    });

    try {
      // Stream the RAG response
      const streamGenerator = ragService.streamChat(message, model, history);

      for await (const chunk of streamGenerator) {
        if (req.destroyed) break;

        switch (chunk.type) {
          case 'status':
            sendSSE('status', { message: chunk.content });
            break;
          case 'sources':
            sendSSE('sources', { sources: chunk.content });
            break;
          case 'content':
            sendSSE('content', { content: chunk.content });
            break;
          case 'done':
            sendSSE('done', chunk.content);
            break;
          case 'error':
            sendSSE('error', { error: chunk.content });
            break;
        }
      }

    } catch (error) {
      logger.error('Chat streaming error:', error);
      sendSSE('error', {
        error: error.message,
        code: error.name || 'CHAT_ERROR'
      });
    }

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Chat stream completed in ${duration}s`);

    res.end();

  } catch (error) {
    logger.error('Chat request error:', error);

    if (res.headersSent) {
      // If headers already sent (streaming), send error event
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    } else {
      // If headers not sent, return JSON error
      const statusCode = error.name === 'ValidationError' ? 400 :
                         error.name === 'TimeoutError' ? 408 : 500;

      res.status(statusCode).json({
        error: {
          code: error.name || 'CHAT_ERROR',
          message: error.message
        }
      });
    }

    metrics.recordError(error.name || 'ChatError', '/chat');
  }
});

// Non-streaming chat endpoint (fallback)
router.post('/chat/sync', async (req, res) => {
  try {
    const { message, model = 'chatgpt', history = [] } = req.body;

    // Same validation as streaming endpoint
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new ValidationError('Message is required and must be a non-empty string');
    }

    const result = await ragService.chat(message, model, history, true);

    res.json({
      response: result.response,
      sources: result.sources,
      metadata: result.metadata
    });

  } catch (error) {
    logger.error('Sync chat error:', error);
    throw error; // Will be handled by error middleware
  }
});

module.exports = router;