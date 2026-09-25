const adminService = require('../services/AdminService');
const listingService = require('../services/ListingService');
const ApiResponse = require('../utils/apiResponse');
const { serializeLandlord, serializeListing } = require('../utils/securitySanitizer');

class AdminController {
  async getDashboardStats(req, res, next) {
    try {
      const stats = await adminService.getDashboardStats();
      return ApiResponse.success(res, 'Dashboard metrics retrieved', stats, 200, {
        stats
      });
    } catch (err) {
      next(err);
    }
  }

  async getPendingListings(req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Number(req.query.limit) || 100);

      const result = await listingService.getListings({
        status: 'pending_review',
        sortBy: 'createdAt',
        order: 'desc',
        page,
        limit
      }, true);

      let listings = result.items || [];
      // Enforce newest-first ordering (createdAt DESC)
      listings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      const safeListings = listings.map(l => serializeListing(l, true));
      return ApiResponse.success(res, 'Pending listings retrieved successfully', safeListings, 200, {
        listings: safeListings,
        count: safeListings.length,
        total: result.total || safeListings.length,
        page,
        limit
      });
    } catch (err) {
      next(err);
    }
  }

  async getLandlords(req, res, next) {
    try {
      const landlords = await adminService.getLandlords();
      const safeLandlords = (landlords || []).map(l => ({
        ...serializeLandlord(l, true),
        listingCount: l.listingCount || 0
      }));
      return ApiResponse.success(res, 'Landlords retrieved successfully', safeLandlords, 200, {
        landlords: safeLandlords
      });
    } catch (err) {
      next(err);
    }
  }

  async setLandlordPaid(req, res, next) {
    try {
      const { isPaidSubscriber } = req.body;
      const landlord = await adminService.setLandlordPaid(req.params.id, isPaidSubscriber, req.user);
      const safeLandlord = serializeLandlord(landlord, true);
      return ApiResponse.success(res, 'Landlord paid status updated.', safeLandlord, 200, {
        landlord: safeLandlord
      });
    } catch (err) {
      next(err);
    }
  }

  async setLandlordBlocked(req, res, next) {
    try {
      const { isBlocked } = req.body;
      const landlord = await adminService.setLandlordBlocked(req.params.id, isBlocked, req.user);
      const safeLandlord = serializeLandlord(landlord, true);
      return ApiResponse.success(res, 'Landlord blocked status updated.', safeLandlord, 200, {
        landlord: safeLandlord
      });
    } catch (err) {
      next(err);
    }
  }

  async moderateListing(req, res, next) {
    try {
      const action = (req.body && req.body.action) || req.params.action || 'approve';
      const options = { reason: req.body && (req.body.reason || req.body.rejectionReason) };
      const listing = await adminService.moderateListing(req.params.id, action, req.user, options);
      const safeListing = serializeListing(listing, true);
      return ApiResponse.success(res, `Listing marked as ${action}.`, safeListing, 200, {
        listing: safeListing
      });
    } catch (err) {
      next(err);
    }
  }

  async approveListing(req, res, next) {
    try {
      const listing = await adminService.moderateListing(req.params.id, 'approve', req.user);
      const safeListing = serializeListing(listing, true);
      return ApiResponse.success(res, 'Listing approved and published successfully.', safeListing, 200, {
        listing: safeListing
      });
    } catch (err) {
      next(err);
    }
  }

  async rejectListing(req, res, next) {
    try {
      const reason = req.body && (req.body.reason || req.body.rejectionReason);
      const listing = await adminService.moderateListing(req.params.id, 'reject', req.user, { reason });
      const safeListing = serializeListing(listing, true);
      return ApiResponse.success(res, 'Listing rejected successfully.', safeListing, 200, {
        listing: safeListing
      });
    } catch (err) {
      next(err);
    }
  }

  async suspendListing(req, res, next) {
    try {
      const reason = req.body && (req.body.reason || req.body.suspensionReason);
      const listing = await adminService.moderateListing(req.params.id, 'suspend', req.user, { reason });
      const safeListing = serializeListing(listing, true);
      return ApiResponse.success(res, 'Listing suspended successfully.', safeListing, 200, {
        listing: safeListing
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteListing(req, res, next) {
    try {
      const listing = await adminService.moderateListing(req.params.id, 'delete', req.user);
      const safeListing = serializeListing(listing, true);
      return ApiResponse.success(res, 'Listing permanently deleted.', safeListing, 200, {
        listing: safeListing,
        deleted: true,
        id: req.params.id
      });
    } catch (err) {
      next(err);
    }
  }

  async updateListing(req, res, next) {
    try {
      const listing = await adminService.updateListingWithAudit(req.params.id, req.body, req.user);
      const safeListing = serializeListing(listing, true);
      return ApiResponse.success(res, 'Listing updated successfully.', safeListing, 200, {
        listing: safeListing
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkImport(req, res, next) {
    try {
      const { listings } = req.body;
      if (!Array.isArray(listings) || !listings.length) {
        return ApiResponse.error(res, 'Invalid or empty listings array provided for bulk import.', 400);
      }

      const result = await adminService.bulkImportListings(listings, req.user);
      const safeListings = (result.listings || []).map(l => serializeListing(l, true));
      return ApiResponse.success(res, `Successfully imported ${result.importedCount} listings.`, {
        importedCount: result.importedCount,
        listings: safeListings
      }, 201, {
        importedCount: result.importedCount,
        listings: safeListings
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AdminController();
