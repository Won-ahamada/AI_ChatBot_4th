/**
 * Migration script to set up Qdrant collection
 * Run with: node scripts/migrate.js
 */

const config = require('../config');
const qdrant = require('../infra/qdrant');
const logger = require('../infra/logger');

async function migrate() {
  try {
    logger.info('Starting migration...');

    // Ensure Qdrant collection exists
    await qdrant.ensureCollection();

    logger.info('Migration completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate();
}

module.exports = migrate;