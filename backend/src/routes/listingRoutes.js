const express = require('express');
const router = express.Router();
const listingController = require('../controllers/ListingController');
const listingService = require('../services/ListingService');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { listingCreateLimiter } = require('../middleware/rateLimiters');
const ApiResponse = require('../utils/apiResponse');

router.get('/', listingController.getListings);

// Get landlord's own listings
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const landlordId = req.user.landlordId || req.user.userId;
    const result = await listingService.getListings({ status: 'all', limit: 50 });
    const myListings = (result.items || []).filter(
      l => l.landlordId && (l.landlordId._id || l.landlordId).toString() === landlordId.toString()
    );
    return ApiResponse.success(res, 'My listings retrieved', myListings, 200, {
      listings: myListings,
      count: myListings.length
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', listingController.getListingById);

// Create listing (supports direct posting without prior OTP login as well as authenticated landlords)
router.post('/create', optionalAuth, listingCreateLimiter, listingController.createListing);
router.post('/', optionalAuth, listingCreateLimiter, listingController.createListing);

router.put('/:id', authenticate, listingController.updateListing);
router.delete('/:id', authenticate, listingController.deleteListing);
router.post('/:id/contact', listingController.trackContact);
router.post('/:id/report', listingController.reportListing);

// In-Platform Tenant <-> Landlord Chat Messaging Endpoints
router.get('/:id/messages', listingController.getMessages);
router.post('/:id/messages', listingController.sendMessage);
router.get('/messages/recent', listingController.getAllRecentMessages);

module.exports = router;
