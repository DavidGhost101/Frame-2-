const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/NotificationController');
const { requireAdmin } = require('../middleware/authMiddleware');

router.use(requireAdmin);

router.get('/logs', notificationController.getRecentLogs);
router.post('/send-sms', notificationController.sendManualSms);

module.exports = router;
