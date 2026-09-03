const listingService = require('../services/ListingService');
const ListingValidator = require('../validators/listingValidator');
const ApiResponse = require('../utils/apiResponse');
const { toWhatsAppNumber, buildWhatsAppLinks } = require('../utils/phoneUtils');
const fallbackStore = require('../../../services/fallbackStore');


class ListingController {
  async getListings(req, res, next) {
    try {
      const result = await listingService.getListings(req.query);
      return ApiResponse.paginated(
        res,
        'Listings retrieved successfully',
        result.items,
        result.page,
        result.limit,
        result.total,
        { listings: result.items } // Legacy backward compatibility
      );
    } catch (err) {
      next(err);
    }
  }

  async getListingById(req, res, next) {
    try {
      const listing = await listingService.getListingById(req.params.id);
      return ApiResponse.success(res, 'Listing retrieved successfully', listing, 200, {
        listing
      });
    } catch (err) {
      return ApiResponse.error(res, err.message, 404);
    }
  }

  async createListing(req, res, next) {
    try {
      const validation = ListingValidator.validateCreate(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, 'Validation error', 400, validation.errors);
      }

      const landlordId = req.user ? (req.user.landlordId || req.user.userId) : null;
      const listing = await listingService.createListing(landlordId, req.body);

      return ApiResponse.success(res, 'Listing created successfully.', listing, 201, {
        listing
      });
    } catch (err) {
      next(err);
    }
  }

  async updateListing(req, res, next) {
    try {
      const validation = ListingValidator.validateUpdate(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, 'Validation error', 400, validation.errors);
      }

      const landlordId = req.user ? (req.user.landlordId || req.user.userId) : null;
      const isAdmin = req.user && (req.user.admin || req.user.role === 'ADMIN');
      const updated = await listingService.updateListing(req.params.id, landlordId, req.body, isAdmin);

      return ApiResponse.success(res, 'Listing updated successfully.', updated, 200, {
        listing: updated
      });
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  async deleteListing(req, res, next) {
    try {
      const landlordId = req.user ? (req.user.landlordId || req.user.userId) : null;
      const isAdmin = req.user && (req.user.admin || req.user.role === 'ADMIN');
      const result = await listingService.deleteListing(req.params.id, landlordId, isAdmin);

      return ApiResponse.success(res, result.message, result);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
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
