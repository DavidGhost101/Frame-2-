const express = require('express');
const router = express.Router();
const roomRequestController = require('../controllers/RoomRequestController');
const { requireAdmin } = require('../middleware/authMiddleware');

router.get('/', roomRequestController.getRoomRequests);
router.post('/', roomRequestController.createRoomRequest);
router.post('/create', roomRequestController.createRoomRequest);
router.put('/:id/status', requireAdmin, roomRequestController.updateStatus);
router.post('/:id/contact', roomRequestController.trackContact);

module.exports = router;
