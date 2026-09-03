const express = require('express');
const router = express.Router();
const reportController = require('../controllers/ReportController');
const { requireAdmin } = require('../middleware/authMiddleware');

router.use(requireAdmin);

router.get('/listings/csv', reportController.exportListingsCsv);
router.get('/room-requests/csv', reportController.exportRoomRequestsCsv);
router.get('/audit-logs/csv', reportController.exportAuditLogsCsv);
router.get('/audit-logs', reportController.getRecentAuditLogs);

module.exports = router;
