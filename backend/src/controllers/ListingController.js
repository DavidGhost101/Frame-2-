const listingService = require('../services/ListingService');
const ListingValidator = require('../validators/listingValidator');
const ApiResponse = require('../utils/apiResponse');
const { toWhatsAppNumber, buildWhatsAppLinks } = require('../utils/phoneUtils');
const fallbackStore = require('../../../services/fallbackStore');
const { serializeListing } = require('../utils/securitySanitizer');
const auditLogRepository = require('../repositories/AuditLogRepository');

class ListingController {
  async getListings(req, res, next) {
    try {
      const isPrivileged = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));
      const query = { ...req.query };
      if (!isPrivileged) {
        delete query.status;
      }
      const result = await listingService.getListings(query, isPrivileged);
      const safeItems = (result.items || []).map(item => serializeListing(item, isPrivileged));
      return ApiResponse.paginated(
        res,
        'Listings retrieved successfully',
        safeItems,
        result.page,
        result.limit,
        result.total,
        { listings: safeItems } // Legacy backward compatibility
      );
    } catch (err) {
      next(err);
    }
  }

  async getListingById(req, res, next) {
    try {
      const isPrivileged = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));
      const listing = await listingService.getListingById(req.params.id, isPrivileged);
      const safeListing = serializeListing(listing, isPrivileged);
      return ApiResponse.success(res, 'Listing retrieved successfully', safeListing, 200, {
        listing: safeListing
      });
    } catch (err) {
      const statusCode = err.statusCode || 404;
      return ApiResponse.error(res, err.message, statusCode);
    }
  }

  async createListing(req, res, next) {
    try {
      if (req.user) {
        if (!req.body.fullName && !req.body.ownerName && !req.body.landlordFullName && !req.body.landlordName) {
          req.body.fullName = req.user.fullName || req.user.name || 'Landlord';
        }
        if (!req.body.phone && req.user.phone) {
          req.body.phone = req.user.phone;
        }
      }

      const validation = ListingValidator.validateCreate(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, 'Validation error', 400, validation.errors);
      }

      const isAdmin = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));
      if (!isAdmin) {
        delete req.body.status;
        delete req.body.publicationStatus;
        delete req.body.isApproved;
        delete req.body.approvedBy;
        delete req.body.approvedAt;
      }

      const landlordId = req.user ? (req.user.landlordId || req.user.userId) : null;
      const listing = await listingService.createListing(landlordId, req.body);
      const safeListing = serializeListing(listing, true);

      auditLogRepository.logAction({
        userId: landlordId,
        actorId: landlordId,
        actorEmail: req.user ? req.user.email : (req.body.phone || 'anonymous_landlord'),
        actorRole: req.user ? (req.user.role || 'LANDLORD') : 'LANDLORD',
        action: 'ROOM_CREATED',
        category: 'ROOM',
        resource: 'Listing',
        resourceId: String(safeListing._id),
        status: 'SUCCESS',
        result: 'SUCCESS',
        ipAddress: req.ip,
        requestId: req.id,
        details: {
          title: safeListing.title,
          suburb: safeListing.suburb,
          monthlyRent: safeListing.monthlyRent
        }
      }).catch(() => {});

      return ApiResponse.success(res, 'Listing created successfully.', safeListing, 201, {
        listing: safeListing
      });
    } catch (err) {
      if (err.statusCode === 403 || err.code === 'LANDLORD_BLOCKED') {
        return ApiResponse.error(res, err.message, 403, [], 'LANDLORD_BLOCKED');
      }
      if (err.statusCode === 409 || err.code === 'DUPLICATE_SUBMISSION') {
        return ApiResponse.error(res, err.message, 409, [err.message], 'DUPLICATE_SUBMISSION');
      }
      next(err);
    }
  }

  async updateListing(req, res, next) {
    try {
      const validation = ListingValidator.validateUpdate(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, 'Validation error', 400, validation.errors);
      }

      const landlordId = req.user ? (req.user.landlordId || req.user.userId || req.user._id) : null;
      const isAdmin = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));

      // Strict Privilege Separation: Non-admins cannot manipulate administrative moderation or ownership fields
      if (!isAdmin) {
        delete req.body.status;
        delete req.body.publicationStatus;
        delete req.body.isApproved;
        delete req.body.approvedBy;
        delete req.body.approvedAt;
        delete req.body.rejectionReason;
        delete req.body.flagged;
        delete req.body.flagReasons;
        delete req.body.reportCount;
        delete req.body.landlordId;
        delete req.body.isPaidSubscriber;
        delete req.body.trialEndsAt;
      }

      const updated = await listingService.updateListing(req.params.id, landlordId, req.body, isAdmin);
      const safeUpdated = serializeListing(updated, isAdmin);

      auditLogRepository.logAction({
        userId: landlordId,
        actorId: landlordId,
        actorEmail: req.user ? req.user.email : 'landlord',
        actorRole: req.user ? (req.user.role || (isAdmin ? 'ADMIN' : 'LANDLORD')) : 'LANDLORD',
        action: 'ROOM_UPDATED',
        category: 'ROOM',
        resource: 'Listing',
        resourceId: String(req.params.id),
        status: 'SUCCESS',
        result: 'SUCCESS',
        ipAddress: req.ip,
        requestId: req.id,
        details: {
          updatedFields: Object.keys(req.body)
        }
      }).catch(() => {});

      return ApiResponse.success(res, 'Listing updated successfully.', safeUpdated, 200, {
        listing: safeUpdated
      });
    } catch (err) {
      const status = err.statusCode || (err.message && err.message.toLowerCase().includes('not authorized') ? 403 : 400);
      return ApiResponse.error(res, err.message, status);
    }
  }

  async deleteListing(req, res, next) {
    try {
      const landlordId = req.user ? (req.user.landlordId || req.user.userId || req.user._id) : null;
      const isAdmin = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));
      const result = await listingService.deleteListing(req.params.id, landlordId, isAdmin);

      auditLogRepository.logAction({
        userId: landlordId,
        actorId: landlordId,
        actorEmail: req.user ? req.user.email : 'landlord',
        actorRole: req.user ? (req.user.role || (isAdmin ? 'ADMIN' : 'LANDLORD')) : 'LANDLORD',
        action: 'ROOM_DELETED',
        category: 'ROOM',
        resource: 'Listing',
        resourceId: String(req.params.id),
        status: 'SUCCESS',
        result: 'SUCCESS',
        ipAddress: req.ip,
        requestId: req.id
      }).catch(() => {});

      return ApiResponse.success(res, result.message, result);
    } catch (err) {
      const status = err.statusCode || (err.message && err.message.toLowerCase().includes('not authorized') ? 403 : 400);
      return ApiResponse.error(res, err.message, status);
    }
  }

  async trackContact(req, res, next) {
    try {
      await listingService.trackContact(req.params.id);
      let listing = null;
      try {
        listing = await listingService.getListingById(req.params.id);
      } catch (_) {}

      let phone = null;
      let landlordName = 'Landlord';
      let hasWhatsapp = true;

      if (listing) {
        if (listing.landlordId && typeof listing.landlordId === 'object' && listing.landlordId.phone) {
          phone = listing.landlordId.phone;
          landlordName = listing.landlordId.fullName || landlordName;
          if (listing.landlordId.hasWhatsapp !== undefined) hasWhatsapp = Boolean(listing.landlordId.hasWhatsapp);
        } else if (listing.landlordId && typeof listing.landlordId === 'string') {
          const fbLandlord = (fallbackStore.fallbackLandlords || []).find(l => String(l._id) === String(listing.landlordId));
          if (fbLandlord) {
            phone = fbLandlord.phone;
            landlordName = fbLandlord.fullName || landlordName;
            if (fbLandlord.hasWhatsapp !== undefined) hasWhatsapp = Boolean(fbLandlord.hasWhatsapp);
          }
        }
        if (!phone) {
          phone = listing.publicPhone || listing.landlordPhone || listing.phone;
        }
        if (listing.hasWhatsapp !== undefined) {
          hasWhatsapp = Boolean(listing.hasWhatsapp);
        }
      }

      if (!phone) {
        phone = '+27821234567';
      }

      const title = listing ? listing.title : 'room';
      const suburb = listing ? listing.suburb : 'Soweto';
      const rent = listing ? listing.monthlyRent : '1800';
      const messageText = `Hi ${landlordName}, I saw your room listing on Rent A Room: "${title}" in ${suburb} (R${rent}/month). Is it still available for viewing?`;
      
      const { cleanNumber, whatsappLink, whatsappWebLink, callLink } = buildWhatsAppLinks(phone, messageText);

      return ApiResponse.success(res, 'Contact tracked successfully', {
        whatsappLink,
        whatsappWebLink,
        callLink,
        phone,
        cleanPhone: cleanNumber,
        hasWhatsapp,
        landlordName,
        listingTitle: title
      }, 200, {
        whatsappLink,
        whatsappWebLink,
        callLink,
        phone,
        cleanPhone: cleanNumber,
        hasWhatsapp,
        landlordName,
        listingTitle: title
      });
    } catch (err) {
      next(err);
    }
  }


  async getMessages(req, res, next) {
    try {
      const listingId = req.params.id;
      const tenantId = req.query.tenantId || '';
      const messages = await listingService.getListingMessages(listingId, tenantId);
      return ApiResponse.success(res, 'Messages retrieved successfully', messages, 200, {
        messages,
        count: messages.length
      });
    } catch (err) {
      next(err);
    }
  }

  async sendMessage(req, res, next) {
    try {
      const listingId = req.params.id;
      const { text, tenantId, senderName, senderPhone, sender } = req.body;
      const message = await listingService.sendListingMessage({
        listingId,
        tenantId,
        sender: sender || 'tenant',
        senderName,
        senderPhone,
        text
      });
      return ApiResponse.success(res, 'Message sent successfully', message, 201, {
        message
      });
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  async getAllRecentMessages(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const messages = await listingService.getAllMessages(limit);
      return ApiResponse.success(res, 'All recent messages retrieved', messages, 200, {
        messages,
        count: messages.length
      });
    } catch (err) {
      next(err);
    }
  }

  async reportListing(req, res, next) {
    try {
      const { reason } = req.body;
      const updated = await listingService.reportListing(req.params.id, reason || 'Unspecified user report');
      return ApiResponse.success(res, 'Listing report submitted. Our team will review it.', updated);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ListingController();
