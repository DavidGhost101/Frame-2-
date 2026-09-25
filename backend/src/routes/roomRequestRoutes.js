const express = require('express');
const router = express.Router();
const roomRequestController = require('../controllers/RoomRequestController');
const { requireAdmin } = require('../middleware/authMiddleware');
const { searchLimiter, requestCreationLimiter, contactLimiter } = require('../middleware/rateLimiters');
const { idempotencyProtection } = require('../middleware/idempotencyMiddleware');

router.get('/', searchLimiter, roomRequestController.getRoomRequests);
router.get('/search', searchLimiter, roomRequestController.getRoomRequests);
router.post('/', requestCreationLimiter, idempotencyProtection(), roomRequestController.createRoomRequest);
router.post('/create', requestCreationLimiter, idempotencyProtection(), roomRequestController.createRoomRequest);
router.put('/:id/status', requireAdmin, roomRequestController.updateStatus);
router.delete('/:id', requireAdmin, roomRequestController.deleteRoomRequest);
router.post('/:id/contact', contactLimiter, roomRequestController.trackContact);

module.exports = router;
