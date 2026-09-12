require('dotenv').config();
const { connectDatabase } = require('./backend/src/database/connection');
const BackgroundJobRunner = require('./backend/src/jobs/backgroundJobRunner');
const AdminInitService = require('./backend/src/services/AdminInitService');
const app = require('./backend/src/app');

// Process-level crash guards to ensure 100% uptime in Cloud Run
process.on('uncaughtException', (err) => {
  console.error('Server Uncaught Exception (handled):', err && err.message ? err.message : err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('Server Unhandled Rejection (handled):', reason && reason.message ? reason.message : reason);
});

const PORT = 3000;
let server;

if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Rent A Room Soweto Production Backend running on http://0.0.0.0:${PORT}`);
    console.log(`API Documentation available at http://0.0.0.0:${PORT}/api/docs`);
    console.log(`Health Check: http://0.0.0.0:${PORT}/health`);

    try {
      await connectDatabase();
      BackgroundJobRunner.start();
      await AdminInitService.initialize();
    } catch (e) {
      console.warn('Database initialization notice:', e.message);
    }
  });

  server.on('error', (err) => {
    console.error('Server error encountered:', err);
  });

  process.on('SIGTERM', () => {
    if (server) {
      server.close(() => {
        console.log('Server terminated cleanly.');
        process.exit(0);
      });
    }
  });
}

module.exports = app;
