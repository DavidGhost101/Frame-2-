const mongoose = require('mongoose');
const listingRepository = require('../repositories/ListingRepository');
const roomRequestRepository = require('../repositories/RoomRequestRepository');
const userRepository = require('../repositories/UserRepository');
const auditLogRepository = require('../repositories/AuditLogRepository');
const fallbackStore = require('../../../services/fallbackStore');
const Landlord = require('../models/Landlord');
const Listing = require('../models/Listing');
const appEvents = require('../events/eventEmitter');

class AdminService {
  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardStats() {
    try {
      const [listingMetrics, requestMetrics, landlords] = await Promise.all([
        listingRepository.getMetrics(),
        roomRequestRepository.getMetrics(),
        Landlord.find({ isDeleted: { $ne: true } })
      ]);

      const verifiedLandlords = landlords.filter(l => l.isPhoneVerified).length;
      const activeLandlords = landlords.filter(l => !l.isBlocked).length;
      const blockedLandlords = landlords.filter(l => l.isBlocked).length;

      return {
        listings: listingMetrics,
        requests: {
          total: requestMetrics.total,
          active: requestMetrics.active
        },
        landlords: {
          total: landlords.length,
          verified: verifiedLandlords,
          active: activeLandlords,
          blocked: blockedLandlords
        }
      };
    } catch (err) {
      console.warn('Dashboard stats fallback:', err.message);
      const fbListings = fallbackStore.fallbackListings || [];
      const fbRequests = (fallbackStore.fallbackRequests || []).filter(r => !r.isDeleted && r.status !== 'archived');
      const fbLandlords = fallbackStore.fallbackLandlords || [];
      return {
        listings: {
          total: fbListings.length,
          active: fbListings.filter(l => ['active', 'published', 'approved', 'ACTIVE', 'PUBLISHED', 'APPROVED'].includes(l.status) || l.publicationStatus === 'PUBLISHED').length,
          pending: fbListings.filter(l => ['pending_review', 'pending', 'PENDING_REVIEW', 'PENDING'].includes(l.status) || l.publicationStatus === 'PENDING').length,
          suspended: fbListings.filter(l => ['suspended', 'SUSPENDED'].includes(l.status) || l.publicationStatus === 'SUSPENDED').length,
          flagged: fbListings.filter(l => l.flagged).length
        },
        requests: {
          total: fbRequests.length,
          active: fbRequests.filter(r => r.status === 'active').length
        },
        landlords: {
          total: fbLandlords.length,
          verified: fbLandlords.filter(l => l.isPhoneVerified).length,
          active: fbLandlords.filter(l => !l.isBlocked).length,
          blocked: fbLandlords.filter(l => l.isBlocked).length
        }
      };
    }
  }

  /**
   * List all landlords with listing counts
   */
  async getLandlords() {
    try {
      const landlords = await userRepository.findAllLandlords();
      if (!landlords || !landlords.length) {
        const fbListings = fallbackStore.fallbackListings || [];
        return (fallbackStore.fallbackLandlords || []).map(l => ({
          ...l,
          listingCount: fbListings.filter(item => {
            const lId = item.landlordId && (item.landlordId._id || item.landlordId);
            return String(lId) === String(l._id);
          }).length
        }));
      }
      const results = await Promise.all(
        landlords.map(async (l) => {
          const listingCount = await Listing.countDocuments({ landlordId: l._id, isDeleted: { $ne: true } }).catch(() => 0);
          return {
            ...(typeof l.toObject === 'function' ? l.toObject() : l),
            listingCount
          };
        })
      );
      return results;
    } catch (err) {
      console.warn('GetLandlords fallback:', err.message);
      const fbListings = fallbackStore.fallbackListings || [];
      return (fallbackStore.fallbackLandlords || []).map(l => ({
        ...l,
        listingCount: fbListings.filter(item => {
          const lId = item.landlordId && (item.landlordId._id || item.landlordId);
          return String(lId) === String(l._id);
        }).length
      }));
    }
  }

  /**
   * Toggle landlord paid status (retained for backward compatibility)
   */
  async setLandlordPaid(landlordId, isPaidSubscriber, adminUser = null) {
    let landlord = null;
    try {
      if (mongoose.Types.ObjectId.isValid(landlordId)) {
        landlord = await Landlord.findByIdAndUpdate(landlordId, { isPaidSubscriber: Boolean(isPaidSubscriber) }, { new: true });
      }
    } catch (_) {}
    if (!landlord && fallbackStore && fallbackStore.fallbackLandlords) {
      landlord = fallbackStore.fallbackLandlords.find(l => String(l._id) === String(landlordId));
      if (landlord) landlord.isPaidSubscriber = Boolean(isPaidSubscriber);
    }
    return landlord;
  }

  /**
   * Toggle landlord block status
   */
  async setLandlordBlocked(landlordId, isBlocked, adminUser = null) {
    const isBlockedBool = Boolean(isBlocked);
    let landlord = null;

    if (mongoose.Types.ObjectId.isValid(landlordId)) {
      try {
        landlord = await Landlord.findByIdAndUpdate(
          landlordId,
          { isBlocked: isBlockedBool },
          { new: true }
        );
      } catch (err) {
        console.warn('DB setLandlordBlocked warning:', err.message);
      }
    }

    // Always ensure in-memory fallbackStore is kept in sync
    if (fallbackStore && fallbackStore.fallbackLandlords) {
      const fbL = fallbackStore.fallbackLandlords.find(
        l => String(l._id) === String(landlordId)
      );
      if (fbL) {
        fbL.isBlocked = isBlockedBool;
        if (!landlord) landlord = fbL;
      }
    }

    // If landlord has an associated User, sync status
    if (landlord) {
      try {
        if (landlord.userId) {
          await User.findByIdAndUpdate(landlord.userId, {
            status: isBlockedBool ? 'suspended' : 'active'
          });
        } else if (landlord.phone) {
          await User.findOneAndUpdate(
            { phone: landlord.phone },
            { status: isBlockedBool ? 'suspended' : 'active' }
          );
        }
      } catch (_) {}

      if (fallbackStore && fallbackStore.fallbackUsers) {
        const fbU = fallbackStore.fallbackUsers.find(
          u => (landlord.phone && u.phone === landlord.phone) || (landlord.userId && String(u._id) === String(landlord.userId))
        );
        if (fbU) {
          fbU.status = isBlockedBool ? 'suspended' : 'active';
        }
      }
    }

    if (!landlord) {
      throw new Error(`Landlord with ID ${landlordId} not found.`);
    }

    if (adminUser) {
      await auditLogRepository.logAction({
        userId: adminUser.userId || adminUser._id,
        userRole: adminUser.role || 'ADMIN',
        action: isBlockedBool ? 'BLOCK_LANDLORD' : 'UNBLOCK_LANDLORD',
        resource: 'Landlord',
        resourceId: landlordId,
        newValue: { isBlocked: isBlockedBool }
      });
    }

    // Emit real-time event
    try {
      appEvents.emit('landlord:updated', {
        landlord,
        landlordId: String(landlordId),
        isBlocked: isBlockedBool
      });
    } catch (_) {}

    return landlord;
  }

  /**
   * Moderate listing (Approve, Reject, Suspend, or Archive)
   */
  async moderateListing(listingId, action, adminUser = null, options = {}) {
    const adminEmail = (adminUser && (adminUser.email || adminUser.username)) || '12rakosadavid@gmail.com';
    const actorEmail = adminEmail;
    const now = new Date();

    // Fetch existing listing to determine previous status
    let previousListing = null;
    if (mongoose.Types.ObjectId.isValid(listingId)) {
      try {
        previousListing = await Listing.findById(listingId);
      } catch (_) {}
    }
    if (!previousListing && fallbackStore.fallbackListings) {
      previousListing = fallbackStore.fallbackListings.find(l => String(l._id) === String(listingId));
    }

    const prevStatus = previousListing ? (previousListing.status || 'pending_review') : 'pending_review';
    let update = {};
    let auditAction = `MODERATE_LISTING_${action.toUpperCase()}`;

    if (action === 'approve') {
      update = {
        status: 'active',
        publicationStatus: 'PUBLISHED',
        isApproved: true,
        approvedBy: adminEmail,
        approvedAt: now,
        publishedAt: now,
        flagged: false,
        flagReasons: [],
        reportCount: 0,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
      auditAction = 'LISTING_APPROVED';
    } else if (action === 'reject') {
      const reason = options.reason || options.rejectionReason || 'Listing does not satisfy publication standards';
      update = {
        status: 'rejected',
        publicationStatus: 'REJECTED',
        isApproved: false,
        rejectedBy: adminEmail,
        rejectedAt: now,
        rejectionReason: reason,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
      auditAction = 'LISTING_REJECTED';
    } else if (action === 'suspend') {
      const reason = options.reason || options.suspensionReason || 'Suspended by admin';
      update = {
        status: 'suspended',
        publicationStatus: 'SUSPENDED',
        isApproved: false,
        suspendedBy: adminEmail,
        suspendedAt: now,
        rejectionReason: reason,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
      auditAction = 'LISTING_SUSPENDED';
    } else if (action === 'archive' || action === 'delete') {
      update = {
        status: 'archived',
        isDeleted: true,
        publicationStatus: 'UNPUBLISHED',
        deletedBy: adminEmail,
        deletedAt: now,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
      auditAction = 'LISTING_DELETED';
    } else {
      update = {
        status: action,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
    }

    let listing = null;
    if (action === 'delete') {
      try {
        await Listing.deleteOne({ _id: listingId });
      } catch (_) {}
      if (fallbackStore && fallbackStore.fallbackListings) {
        fallbackStore.fallbackListings = fallbackStore.fallbackListings.filter(l => String(l._id) !== String(listingId));
      }
      if (fallbackStore && typeof fallbackStore.deleteListing === 'function') {
        fallbackStore.deleteListing(listingId);
      }
      listing = previousListing ? { ...previousListing, ...update, status: 'deleted', isDeleted: true } : { _id: listingId, status: 'deleted', isDeleted: true };
    } else if (mongoose.Types.ObjectId.isValid(listingId)) {
      try {
        listing = await Listing.findByIdAndUpdate(listingId, update, { new: true });
      } catch (err) {
        console.warn('Listing DB moderate update notice:', err.message);
      }
    } else {
      try {
        listing = await Listing.findOneAndUpdate({ _id: listingId }, update, { new: true });
      } catch (_) {}
    }

    // Also update fallbackStore for non-delete actions
    if (action !== 'delete' && fallbackStore.fallbackListings) {
      const idx = fallbackStore.fallbackListings.findIndex(l => String(l._id) === String(listingId));
      if (idx !== -1) {
        fallbackStore.fallbackListings[idx] = { ...fallbackStore.fallbackListings[idx], ...update };
        listing = fallbackStore.fallbackListings[idx];
      }
    }

    if (!listing && previousListing) {
      listing = { ...previousListing, ...update };
    }

    // Log the audit record
    await auditLogRepository.logAction({
      userId: adminUser ? adminUser.userId : null,
      actorEmail,
      actorRole: (adminUser && adminUser.role) || 'ADMIN',
      action: auditAction,
      resource: 'Listing',
      entityType: 'Listing',
      resourceId: listingId,
      entityId: String(listingId),
      previousStatus: prevStatus,
      newStatus: update.status,
      details: {
        listingId,
        action,
        title: previousListing ? previousListing.title : undefined,
        suburb: previousListing ? previousListing.suburb : undefined,
        publicationStatus: update.publicationStatus
      },
      previousValue: { status: prevStatus },
      newValue: update,
      status: 'SUCCESS',
      result: 'SUCCESS'
    }).catch(() => {});

    // Emit real-time events for admin live subscription
    try {
      const payloadListing = listing && (listing.toObject ? listing.toObject() : listing);
      const finalListing = payloadListing || {
        _id: String(listingId),
        ...update,
        status: update.status || action,
        title: previousListing ? previousListing.title : 'Listing'
      };

      if (action === 'approve') {
        appEvents.emit('listing:approved', finalListing);
      } else if (action === 'reject') {
        appEvents.emit('listing:rejected', finalListing);
      } else if (action === 'suspend') {
        appEvents.emit('listing:suspended', finalListing);
      } else if (action === 'delete') {
        appEvents.emit('listing:deleted', { listingId: String(listingId) });
      }

      appEvents.emit('listing:status_changed', {
        listing: finalListing,
        listingId: String(listingId),
        action,
        previousStatus: prevStatus,
        newStatus: update.status
      });
    } catch (evtErr) {
      console.warn('Error emitting moderateListing event:', evtErr.message);
    }

    return listing || update;
  }

  /**
   * Update listing fields with edit protection and audit trail
   */
  async updateListingWithAudit(listingId, updateData, adminUser = null) {
    const adminEmail = (adminUser && (adminUser.email || adminUser.username)) || '12rakosadavid@gmail.com';
    const actorEmail = adminEmail;
    const now = new Date();

    let previousListing = null;
    if (mongoose.Types.ObjectId.isValid(listingId)) {
      try {
        previousListing = await Listing.findById(listingId);
      } catch (_) {}
    }
    if (!previousListing && fallbackStore.fallbackListings) {
      previousListing = fallbackStore.fallbackListings.find(l => String(l._id) === String(listingId));
    }

    const payload = {
      ...updateData,
      lastModifiedBy: adminEmail,
      lastModifiedAt: now
    };

    // If status is being set to approved, published, or active, ensure publicationStatus is PUBLISHED
    if (payload.status === 'APPROVED' || payload.status === 'approved' || payload.status === 'PUBLISHED' || payload.status === 'published' || payload.status === 'active') {
      payload.status = (payload.status === 'PUBLISHED' || payload.status === 'published') ? 'PUBLISHED' : 'active';
      payload.publicationStatus = 'PUBLISHED';
      payload.approvedBy = payload.approvedBy || adminEmail;
      payload.approvedAt = payload.approvedAt || now;
      payload.publishedAt = payload.publishedAt || now;
      payload.flagged = false;
      payload.flagReasons = [];
      payload.reportCount = 0;
    } else if (payload.status === 'DRAFT' || payload.status === 'draft') {
      payload.status = 'DRAFT';
      payload.publicationStatus = 'DRAFT';
    } else if (payload.status === 'PENDING_REVIEW' || payload.status === 'pending_review') {
      payload.status = 'pending_review';
      payload.publicationStatus = 'PENDING';
    } else if (payload.status === 'REJECTED' || payload.status === 'rejected') {
      payload.publicationStatus = 'REJECTED';
      payload.rejectedBy = adminEmail;
      payload.rejectedAt = now;
    } else if (payload.status === 'SUSPENDED' || payload.status === 'suspended') {
      payload.publicationStatus = 'SUSPENDED';
      payload.suspendedBy = adminEmail;
      payload.suspendedAt = now;
    }

    let listing = null;
    if (mongoose.Types.ObjectId.isValid(listingId)) {
      try {
        listing = await Listing.findByIdAndUpdate(listingId, payload, { new: true });
      } catch (err) {
        console.warn('Listing DB update notice:', err.message);
      }
    }
    if (fallbackStore.fallbackListings) {
      const idx = fallbackStore.fallbackListings.findIndex(l => String(l._id) === String(listingId));
      if (idx !== -1) {
        fallbackStore.fallbackListings[idx] = { ...fallbackStore.fallbackListings[idx], ...payload };
        listing = fallbackStore.fallbackListings[idx];
      }
    }

    // Compute changed fields
    const changes = {};
    if (previousListing) {
      for (const [key, val] of Object.entries(updateData)) {
        const prevVal = previousListing[key];
        if (prevVal !== undefined && prevVal !== val) {
          changes[key] = { from: prevVal, to: val };
        }
      }
    }

    await auditLogRepository.logAction({
      userId: adminUser ? adminUser.userId : null,
      actorEmail,
      actorRole: (adminUser && adminUser.role) || 'ADMIN',
      action: 'LISTING_EDITED',
      resource: 'Listing',
      entityType: 'Listing',
      resourceId: listingId,
      entityId: String(listingId),
      previousStatus: previousListing ? previousListing.status : null,
      newStatus: payload.status || (previousListing ? previousListing.status : null),
      changes: Object.keys(changes).length ? changes : updateData,
      details: {
        title: listing ? listing.title : (previousListing ? previousListing.title : null),
        modifiedFields: Object.keys(updateData)
      },
      status: 'SUCCESS',
      result: 'SUCCESS'
    }).catch(() => {});

    try {
      const payloadListing = listing && (listing.toObject ? listing.toObject() : listing);
      appEvents.emit('listing:updated', payloadListing || { _id: String(listingId), ...payload });
    } catch (evtErr) {
      console.warn('Error emitting updateListingWithAudit event:', evtErr.message);
    }

    return listing || payload;
  }

  /**
   * Bulk import listings
   */
  async bulkImportListings(items, adminUser = null) {
    const results = [];
    try {
      for (const item of items) {
        // Find or create landlord
        let landlord = await Landlord.findOne({ phone: item.phone });
        if (!landlord) {
          landlord = await Landlord.create({
            fullName: item.landlordName || 'Curated Landlord',
            phone: item.phone,
            isPhoneVerified: true,
            hasWhatsapp: true,
            showPhonePublicly: true,
            consentPhonePublic: true,
            consentTimestamp: new Date()
          });
        }

        const listing = await Listing.create({
          landlordId: landlord._id,
          title: item.title,
          suburb: item.suburb,
          address: item.address || item.suburb,
          monthlyRent: Number(item.monthlyRent),
          propertyType: item.propertyType || 'Backroom',
          amenities: item.amenities || [],
          image: item.image || '',
          status: 'active',
          publicationStatus: 'PUBLISHED',
          isApproved: true,
          source: 'admin_import'
        });
        results.push(listing);
      }

      if (adminUser) {
        await auditLogRepository.logAction({
          userId: adminUser.userId,
          userRole: adminUser.role || 'ADMIN',
          action: 'BULK_IMPORT_LISTINGS',
          resource: 'Listing',
          details: { count: results.length }
        }).catch(() => {});
      }

      return { importedCount: results.length, listings: results };
    } catch (err) {
      console.warn('Bulk import fallback store mode:', err.message);
      const imported = items.map((item, idx) => {
        const fakeId = `import_${Date.now()}_${idx}`;
        const newListing = {
          _id: fakeId,
          title: item.title,
          suburb: item.suburb,
          address: item.address || item.suburb,
          monthlyRent: Number(item.monthlyRent),
          propertyType: item.propertyType || 'Backroom',
          amenities: item.amenities || [],
          image: item.image || '',
          status: 'active',
          publicationStatus: 'PUBLISHED',
          isApproved: true,
          source: 'admin_import',
          createdAt: new Date()
        };
        if (fallbackStore.fallbackListings) {
          fallbackStore.fallbackListings.unshift(newListing);
        }
        return newListing;
      });
      return { importedCount: imported.length, listings: imported };
    }
  }

}

module.exports = new AdminService();
