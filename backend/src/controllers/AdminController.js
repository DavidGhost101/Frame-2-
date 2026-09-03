const adminService = require('../services/AdminService');
const ApiResponse = require('../utils/apiResponse');

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

  async getLandlords(req, res, next) {
    try {
      const landlords = await adminService.getLandlords();
      return ApiResponse.success(res, 'Landlords retrieved successfully', landlords, 200, {
        landlords
      });
    } catch (err) {
      next(err);
    }
  }

  async setLandlordPaid(req, res, next) {
    try {
      const { isPaidSubscriber } = req.body;
      const landlord = await adminService.setLandlordPaid(req.params.id, isPaidSubscriber, req.user);
      return ApiResponse.success(res, 'Landlord paid status updated.', landlord, 200, {
        landlord
      });
    } catch (err) {
      next(err);
    }
  }

  async setLandlordBlocked(req, res, next) {
    try {
      const { isBlocked } = req.body;
      const landlord = await adminService.setLandlordBlocked(req.params.id, isBlocked, req.user);
      return ApiResponse.success(res, 'Landlord blocked status updated.', landlord, 200, {
        landlord
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
      return ApiResponse.success(res, `Listing marked as ${action}.`, listing, 200, {
        listing
      });
    } catch (err) {
      next(err);
    }
  }

  async approveListing(req, res, next) {
    try {
      const listing = await adminService.moderateListing(req.params.id, 'approve', req.user);
      return ApiResponse.success(res, 'Listing approved and published successfully.', listing, 200, {
        listing
      });
    } catch (err) {
      next(err);
    }
  }

  async rejectListing(req, res, next) {
    try {
      const reason = req.body && (req.body.reason || req.body.rejectionReason);
      const listing = await adminService.moderateListing(req.params.id, 'reject', req.user, { reason });
      return ApiResponse.success(res, 'Listing rejected successfully.', listing, 200, {
        listing
      });
    } catch (err) {
      next(err);
    }
  }

  async suspendListing(req, res, next) {
    try {
      const listing = await adminService.moderateListing(req.params.id, 'suspend', req.user);
      return ApiResponse.success(res, 'Listing suspended successfully.', listing, 200, {
        listing
      });
    } catch (err) {
      next(err);
    }
  }

  async updateListing(req, res, next) {
    try {
      const listing = await adminService.updateListingWithAudit(req.params.id, req.body, req.user);
      return ApiResponse.success(res, 'Listing updated successfully.', listing, 200, {
        listing
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
      return ApiResponse.success(res, `Successfully imported ${result.importedCount} listings.`, result, 201, {
        importedCount: result.importedCount,
        listings: result.listings
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AdminController();
