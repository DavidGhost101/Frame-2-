const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const listingRoutes = require('./listingRoutes');
const roomRequestRoutes = require('./roomRequestRoutes');
const adminRoutes = require('./adminRoutes');
const userRoutes = require('./userRoutes');
const reportRoutes = require('./reportRoutes');
const notificationRoutes = require('./notificationRoutes');
const aiRoutes = require('./aiRoutes');
const docsRoutes = require('./docsRoutes');

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/room-requests', roomRequestRoutes);
router.use('/admin', adminRoutes);
router.use('/users', userRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/ai', aiRoutes);
router.use('/docs', docsRoutes);

module.exports = router;
