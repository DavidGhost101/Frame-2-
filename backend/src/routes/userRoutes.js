const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const { requireAdmin } = require('../middleware/authMiddleware');

router.use(requireAdmin);

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.put('/:id/role', userController.updateUserRole);
router.put('/:id/status', userController.updateUserStatus);

module.exports = router;
