const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const logger = require('./infra/logger');
const metrics = require('./infra/metrics');
const rateLimit = require('./infra/rateLimit');
const errorHandler = require('./infra/errorHandler');

// Import routes
const chatRoutes = require('./routes/chat');
const fileRoutes = require('./routes/files');
const healthRoutes = require('./routes/health');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? ['http://localhost:3000'] : true,
  credentials: true
}));

// Rate limiting
app.use(rateLimit);

// Body parsing middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Static files
app.use(express.static(path.join(__dirname)));

// Metrics middleware
app.use(metrics.middleware);

// API authentication middleware
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (req.path.startsWith('/api/') && apiKey !== config.security.apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use(authenticateAPI);

// API routes
app.use('/api', chatRoutes);
app.use('/api', fileRoutes);
app.use('/api', healthRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info(`KERIS RAG Chatbot server running on port ${config.port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;