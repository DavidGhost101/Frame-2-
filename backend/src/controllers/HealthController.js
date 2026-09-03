const mongoose = require('mongoose');
const ApiResponse = require('../utils/apiResponse');

class HealthController {
  async getHealth(req, res) {
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    const memoryUsage = process.memoryUsage();

    return res.status(200).json({
      status: 'healthy',
      database: isDbConnected ? 'connected' : 'fallback_ready',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        memoryUsageMb: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024)
        }
      }
    });
  }
}

module.exports = new HealthController();
