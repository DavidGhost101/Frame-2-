const mongoose = require('mongoose');
const config = require('../config');
const Logger = require('../utils/logger');
const seedData = require('./seedData');

// Ensure buffered commands fail fast rather than hanging
mongoose.set('bufferCommands', false);

async function connectDatabase() {
  const uri = config.db.uri;

  // 1. If real external URI is configured (not localhost), attempt connection
  if (uri && !uri.includes('localhost:27017') && !uri.includes('127.0.0.1:27017')) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: config.db.connectTimeoutMs || 3000
      });
      Logger.info('Connected to external MongoDB database.');
      await seedData.seed();
      return mongoose.connection;
    } catch (err) {
      Logger.warn('External MongoDB connection unavailable, using resilient in-memory store:', { error: err.message });
    }
  }

  // 2. Fast fallback to resilient in-memory data store
  Logger.info('Resilient in-memory storage active and ready.');
  return null;
}

module.exports = {
  connectDatabase
};
