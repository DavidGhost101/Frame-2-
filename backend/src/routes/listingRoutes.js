const express = require('express');
const router = express.Router();
const listingController = require('../controllers/ListingController');
const listingService = require('../services/ListingService');
const { authenticate, optionalAuth, checkNotBlocked, requireAdmin } = require('../middleware/authMiddleware');
const { listingCreateLimiter } = require('../middleware/rateLimiters');
const ApiResponse = require('../utils/apiResponse');
const { serializeListing } = require('../utils/securitySanitizer');

router.get('/', listingController.getListings);

// Administrative recent messages feed (strictly protected)
router.get('/messages/recent', requireAdmin, listingController.getAllRecentMessages);

// Get landlord's own listings
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const landlordId = req.user.landlordId || req.user.userId;
    const result = await listingService.getListings({ status: 'all', limit: 50 });
    const myListings = (result.items || [])
      .filter(l => l.landlordId && (l.landlordId._id || l.landlordId).toString() === landlordId.toString())
      .map(l => serializeListing(l, true));
    return ApiResponse.success(res, 'My listings retrieved', myListings, 200, {
      listings: myListings,
      count: myListings.length
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', listingController.getListingById);

// Create listing with blocked landlord protection (supports direct posting as well as authenticated landlords)
router.post('/create', optionalAuth, checkNotBlocked, listingCreateLimiter, listingController.createListing);
router.post('/', optionalAuth, checkNotBlocked, listingCreateLimiter, listingController.createListing);

// Edit listing with blocked landlord protection
router.put('/:id', authenticate, checkNotBlocked, listingController.updateListing);
router.patch('/:id', authenticate, checkNotBlocked, listingController.updateListing);
router.delete('/:id', authenticate, listingController.deleteListing);
router.post('/:id/contact', listingController.trackContact);
router.post('/:id/report', listingController.reportListing);

// In-Platform Tenant <-> Landlord Chat Messaging Endpoints
router.get('/:id/messages', listingController.getMessages);
router.post('/:id/messages', listingController.sendMessage);

module.exports = router;
