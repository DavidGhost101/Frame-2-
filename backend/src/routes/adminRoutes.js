const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const adminController = require('../controllers/AdminController');
const authController = require('../controllers/AuthController');
const listingService = require('../services/ListingService');
const adminService = require('../services/AdminService');
const userService = require('../services/UserService');
const roomRequestService = require('../services/RoomRequestService');
const { requireAdmin } = require('../middleware/authMiddleware');
const { auditAdminAction } = require('../middleware/auditMiddleware');
const auditLogRepository = require('../repositories/AuditLogRepository');
const fallbackStore = require('../../../services/fallbackStore');
const ApiResponse = require('../utils/apiResponse');
const Listing = require('../models/Listing');
const Landlord = require('../models/Landlord');
const RoomRequest = require('../models/RoomRequest');
const User = require('../models/User');

// Audit middleware logs all administrative actions to AuditLog collection
router.use(auditAdminAction);


// Public Admin Auth & Verification Endpoints (before requireAdmin middleware)

router.post('/login', authController.adminLogin);
router.post('/verify', authController.adminLogin);
router.post('/verify-key', authController.adminLogin);
router.post('/logout', authController.logout);

// Session and verification check endpoints (validates session token or x-admin-key header)
router.get('/session', requireAdmin, (req, res) => {
  return ApiResponse.success(res, 'Admin session valid', {
    user: req.user || { role: 'ADMIN', admin: true, fullName: 'System Admin' },
    authenticated: true
  });
});

router.get('/verify', requireAdmin, (req, res) => {
  return ApiResponse.success(res, 'Admin verification successful', {
    user: req.user || { role: 'ADMIN', admin: true, fullName: 'System Admin' },
    authenticated: true
  });
});

// Protect all remaining admin endpoints
router.use(requireAdmin);

// Dashboard stats
router.get('/stats', adminController.getDashboardStats);

// ----------------------------------------------------
// Listings Management
// ----------------------------------------------------
router.get('/listings', async (req, res, next) => {
  try {
    const isFlagged = req.query.flagged === 'true';
    const status = req.query.status || 'all';
    const keyword = req.query.keyword || '';
    const result = await listingService.getListings({ status, keyword, limit: 100 });
    let listings = result.items || [];
    if (isFlagged) {
      listings = listings.filter(l => l.flagged === true || (l.reportCount && l.reportCount > 0));
    }
    return ApiResponse.success(res, 'Admin listings retrieved', listings, 200, {
      listings,
      count: listings.length
    });
  } catch (err) {
    next(err);
  }
});

router.get('/listings/:id', async (req, res, next) => {
  try {
    const listing = await listingService.getListingById(req.params.id);
    return ApiResponse.success(res, 'Listing details retrieved', listing, 200, { listing });
  } catch (err) {
    next(err);
  }
});

// Update listing (handles status change, text fields, flags, etc. with audit tracking)
router.patch('/listings/:id', adminController.updateListing);
router.put('/listings/:id', adminController.updateListing);

// Dedicated moderation endpoints
router.post('/listings/:id/approve', adminController.approveListing);
router.put('/listings/:id/approve', adminController.approveListing);

router.post('/listings/:id/reject', adminController.rejectListing);
router.put('/listings/:id/reject', adminController.rejectListing);

router.post('/listings/:id/suspend', adminController.suspendListing);
router.put('/listings/:id/suspend', adminController.suspendListing);

router.delete('/listings/:id', async (req, res, next) => {
  try {
    const listing = await adminService.moderateListing(req.params.id, 'delete', req.user);
    return ApiResponse.success(res, 'Listing deleted successfully', listing);
  } catch (err) {
    next(err);
  }
});


router.put('/listings/:id/moderate', adminController.moderateListing);

// Bulk import listings
router.post('/listings/import', async (req, res, next) => {
  try {
    const rawListings = req.body.listings || [];
    const formatted = rawListings.map(item => ({
      title: item.title,
      suburb: item.suburb,
      address: item.address || item.suburb,
      monthlyRent: item.monthlyRent,
      propertyType: item.propertyType || 'Backroom',
      landlordName: item.landlordFullName || item.landlordName,
      phone: item.landlordPhone || item.phone || '+27820000000',
      amenities: item.amenities || [],
      image: item.image || ''
    }));

    const result = await adminService.bulkImportListings(formatted, req.user);
    const resultsArray = result.listings.map(l => ({ success: true, id: l._id, title: l.title }));
    return ApiResponse.success(res, `Imported ${result.importedCount} listings`, result, 200, {
      results: resultsArray,
      count: result.importedCount
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-import', adminController.bulkImport);

// ----------------------------------------------------
// Landlords Management
// ----------------------------------------------------
router.get('/landlords', adminController.getLandlords);

router.patch('/landlords/:id', async (req, res, next) => {
  try {
    const { isPaidSubscriber, isBlocked, isPhoneVerified, fullName, phone } = req.body;
    let updateData = {};
    if (isPaidSubscriber !== undefined) updateData.isPaidSubscriber = Boolean(isPaidSubscriber);
    if (isBlocked !== undefined) updateData.isBlocked = Boolean(isBlocked);
    if (isPhoneVerified !== undefined) updateData.isPhoneVerified = Boolean(isPhoneVerified);
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;

    const landlord = await Landlord.findByIdAndUpdate(req.params.id, updateData, { new: true });
    return ApiResponse.success(res, 'Landlord updated successfully', landlord, 200, { landlord });
  } catch (err) {
    next(err);
  }
});

router.put('/landlords/:id', async (req, res, next) => {
  try {
    const landlord = await Landlord.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return ApiResponse.success(res, 'Landlord updated successfully', landlord, 200, { landlord });
  } catch (err) {
    next(err);
  }
});

router.put('/landlords/:id/paid', adminController.setLandlordPaid);
router.put('/landlords/:id/block', adminController.setLandlordBlocked);

router.delete('/landlords/:id', async (req, res, next) => {
  try {
    await Landlord.findByIdAndUpdate(req.params.id, { isDeleted: true, isBlocked: true });
    return ApiResponse.success(res, 'Landlord account deactivated');
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// Users Management
// ----------------------------------------------------
router.get('/users', async (req, res, next) => {
  try {
    const result = await userService.getUsers(req.query);
    return ApiResponse.success(res, 'Users retrieved successfully', result.users, 200, {
      users: result.users,
      total: result.total,
      page: result.page,
      limit: result.limit
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const { role, status } = req.body;
    let updateData = {};
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    return ApiResponse.success(res, 'User updated successfully', user, 200, { user });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    return ApiResponse.success(res, 'User updated successfully', user, 200, { user });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { status: 'suspended', isDeleted: true });
    return ApiResponse.success(res, 'User suspended successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// Room Requests Management
// ----------------------------------------------------
router.get('/room-requests', async (req, res, next) => {
  try {
    const result = await roomRequestService.getRoomRequests(req.query);
    const requests = result.items || [];
    return ApiResponse.success(res, 'Room requests retrieved successfully', requests, 200, {
      requests,
      total: result.total,
      count: requests.length
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/room-requests/:id', async (req, res, next) => {
  try {
    const { status, seekerName, suburb, maxBudget, roomType, notes } = req.body;
    let updateData = {};
    if (status !== undefined) updateData.status = status;
    if (seekerName !== undefined) updateData.seekerName = seekerName;
    if (suburb !== undefined) updateData.suburb = suburb;
    if (maxBudget !== undefined) updateData.maxBudget = Number(maxBudget);
    if (roomType !== undefined) updateData.roomType = roomType;
    if (notes !== undefined) updateData.notes = notes;

    const request = await RoomRequest.findByIdAndUpdate(req.params.id, updateData, { new: true });
    return ApiResponse.success(res, 'Room request updated successfully', request, 200, { request });
  } catch (err) {
    next(err);
  }
});

router.put('/room-requests/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const request = await roomRequestService.updateStatus(req.params.id, status);
    return ApiResponse.success(res, 'Room request status updated', request, 200, { request });
  } catch (err) {
    next(err);
  }
});

router.delete('/room-requests/:id', async (req, res, next) => {
  try {
    await RoomRequest.findByIdAndUpdate(req.params.id, { isDeleted: true, status: 'archived' });
    return ApiResponse.success(res, 'Room request removed successfully');
  } catch (err) {
    next(err);
  }
});

// Audit Logs & Security Metrics
router.get('/audit-logs/stats', async (req, res, next) => {
  try {
    const stats = await auditLogRepository.getAuditStats();
    return ApiResponse.success(res, 'Audit statistics retrieved successfully', stats, 200, { stats });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const action = req.query.action || null;
    const actorEmail = req.query.actorEmail || null;
    const entityType = req.query.entityType || null;
    const resultStatus = req.query.result || req.query.status || null;

    const result = await auditLogRepository.findRecent({
      limit,
      page,
      action,
      actorEmail,
      entityType,
      result: resultStatus
    });

    const logs = Array.isArray(result) ? result : (result.logs || []);
    const total = Array.isArray(result) ? result.length : (result.total || logs.length);

    return ApiResponse.success(res, 'Audit logs retrieved successfully', logs, 200, {
      logs,
      count: logs.length,
      total,
      page,
      limit
    });
  } catch (err) {
    next(err);
  }
});

// In-Platform Messages & Inquiries Management
router.get('/messages', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const messages = await listingService.getAllMessages(limit);
    return ApiResponse.success(res, 'Inquiries and messages retrieved successfully', messages, 200, {
      messages,
      count: messages.length
    });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/reply', async (req, res, next) => {
  try {
    let { listingId, tenantId, text, replyText, senderName, messageId } = req.body;
    text = (text || replyText || '').trim();

    if ((!listingId || !tenantId) && messageId) {
      const Message = require('../models/Message');
      const orig = await Message.findById(messageId);
      if (orig) {
        listingId = listingId || (orig.listingId ? (orig.listingId._id || orig.listingId) : null);
        tenantId = tenantId || orig.tenantId;
      }
    }

    if (!listingId || !tenantId || !text) {
      return ApiResponse.error(res, 'Listing ID, Tenant ID, and reply text are required.', 400);
    }
    const message = await listingService.sendListingMessage({
      listingId,
      tenantId,
      sender: 'landlord',
      senderName: senderName || 'Administrator / Landlord',
      text
    });
    return ApiResponse.success(res, 'Reply sent to tenant successfully', message, 201, { message });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


