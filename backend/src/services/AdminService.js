const mongoose = require('mongoose');
const listingRepository = require('../repositories/ListingRepository');
const roomRequestRepository = require('../repositories/RoomRequestRepository');
const userRepository = require('../repositories/UserRepository');
const auditLogRepository = require('../repositories/AuditLogRepository');
const fallbackStore = require('../../../services/fallbackStore');
const Landlord = require('../models/Landlord');
const Listing = require('../models/Listing');

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
      const paidLandlords = landlords.filter(l => l.isPaidSubscriber).length;
      const blockedLandlords = landlords.filter(l => l.isBlocked).length;

      return {
        listings: listingMetrics,
        requests: requestMetrics,
        landlords: {
          total: landlords.length,
          verified: verifiedLandlords,
          paid: paidLandlords,
          blocked: blockedLandlords
        }
      };
    } catch (err) {
      console.warn('Dashboard stats fallback:', err.message);
      const fbListings = fallbackStore.fallbackListings || [];
      const fbRequests = fallbackStore.fallbackRequests || [];
      const fbLandlords = fallbackStore.fallbackLandlords || [];
      return {
        listings: {
          total: fbListings.length,
          active: fbListings.filter(l => l.status === 'active').length,
          pending: fbListings.filter(l => l.status === 'pending_review').length,
          flagged: fbListings.filter(l => l.flagged).length
        },
        requests: {
          total: fbRequests.length,
          active: fbRequests.filter(r => r.status === 'active').length,
          found: fbRequests.filter(r => r.status === 'found').length
        },
        landlords: {
          total: fbLandlords.length,
          verified: fbLandlords.filter(l => l.isPhoneVerified).length,
          paid: fbLandlords.filter(l => l.isPaidSubscriber).length,
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
        return fallbackStore.fallbackLandlords || [];
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
      return fallbackStore.fallbackLandlords || [];
    }
  }


  /**
   * Toggle landlord paid status
   */
  async setLandlordPaid(landlordId, isPaidSubscriber, adminUser = null) {
    const landlord = await Landlord.findByIdAndUpdate(landlordId, { isPaidSubscriber: Boolean(isPaidSubscriber) }, { new: true });
    if (adminUser) {
      await auditLogRepository.logAction({
        userId: adminUser.userId,
        userRole: adminUser.role || 'ADMIN',
        action: 'UPDATE_LANDLORD_PAID_STATUS',
        resource: 'Landlord',
        resourceId: landlordId,
        newValue: { isPaidSubscriber }
      });
    }
    return landlord;
  }

  /**
   * Toggle landlord block status
   */
  async setLandlordBlocked(landlordId, isBlocked, adminUser = null) {
    const landlord = await Landlord.findByIdAndUpdate(landlordId, { isBlocked: Boolean(isBlocked) }, { new: true });
    if (adminUser) {
      await auditLogRepository.logAction({
        userId: adminUser.userId,
        userRole: adminUser.role || 'ADMIN',
        action: 'UPDATE_LANDLORD_BLOCK_STATUS',
        resource: 'Landlord',
        resourceId: landlordId,
        newValue: { isBlocked }
      });
    }
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
        status: 'PUBLISHED',
        publicationStatus: 'PUBLISHED',
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
        status: 'REJECTED',
        publicationStatus: 'REJECTED',
        rejectedBy: adminEmail,
        rejectedAt: now,
        rejectionReason: reason,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
      auditAction = 'LISTING_REJECTED';
    } else if (action === 'suspend') {
      update = {
        status: 'SUSPENDED',
        publicationStatus: 'SUSPENDED',
        suspendedBy: adminEmail,
        suspendedAt: now,
        lastModifiedBy: adminEmail,
        lastModifiedAt: now
      };
      auditAction = 'LISTING_SUSPENDED';
    } else if (action === 'archive' || action === 'delete') {
      update = {
        status: 'archived',
        isDeleted: true,
        publicationStatus: 'UNPUBLISHED',
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
    if (mongoose.Types.ObjectId.isValid(listingId)) {
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

    // Also update fallbackStore
    if (fallbackStore.fallbackListings) {
      const idx = fallbackStore.fallbackListings.findIndex(l => String(l._id) === String(listingId));
      if (idx !== -1) {
        fallbackStore.fallbackListings[idx] = { ...fallbackStore.fallbackListings[idx], ...update };
        listing = fallbackStore.fallbackListings[idx];
      }
    }
    if (action === 'delete' && typeof fallbackStore.deleteListing === 'function') {
      const deletedItem = fallbackStore.deleteListing(listingId);
      if (deletedItem) {
        listing = deletedItem;
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
      payload.status = 'PUBLISHED';
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
            consentTimestamp: new Date(),
            isPaidSubscriber: true
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
