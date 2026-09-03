const listingRepository = require('../repositories/ListingRepository');
const userRepository = require('../repositories/UserRepository');
const ScamDetectionService = require('./ScamDetectionService');
const Message = require('../models/Message');
const fallbackStore = require('../../../services/fallbackStore');

class ListingService {
  /**
   * Search and filter listings with pagination
   */
  async getListings(queryParams = {}) {
    try {
      const {
        suburb,
        propertyType,
        maxPrice,
        minPrice,
        amenities,
        keyword,
        status = 'active',
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        order = 'desc'
      } = queryParams;

      const filter = { isDeleted: { $ne: true } };

      const isPublicQuery = !status || status === 'active' || status === 'published' || status === 'approved';

      if (isPublicQuery) {
        filter.$and = [
          {
            $or: [
              { publicationStatus: 'PUBLISHED' },
              { status: { $in: ['active', 'approved', 'published', 'APPROVED', 'PUBLISHED', 'ACTIVE'] } }
            ]
          },
          {
            status: { $nin: ['draft', 'pending_review', 'rejected', 'suspended', 'archived', 'DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED', 'ARCHIVED'] }
          },
          {
            publicationStatus: { $nin: ['DRAFT', 'PENDING', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED', 'UNPUBLISHED'] }
          }
        ];
      } else if (status && status !== 'all') {
        const upper = status.toUpperCase();
        const lower = status.toLowerCase();
        filter.$or = [
          { status: { $in: [lower, upper] } },
          { publicationStatus: { $in: [lower, upper] } }
        ];
      }

      if (suburb && suburb !== 'all') {
        filter.suburb = new RegExp(`^${suburb}$`, 'i');
      }

      if (propertyType && propertyType !== 'all') {
        filter.propertyType = propertyType;
      }

      if (minPrice || maxPrice) {
        filter.monthlyRent = {};
        if (minPrice) filter.monthlyRent.$gte = Number(minPrice);
        if (maxPrice) filter.monthlyRent.$lte = Number(maxPrice);
      }

      if (amenities) {
        const list = Array.isArray(amenities) ? amenities : amenities.split(',').map(a => a.trim());
        if (list.length) {
          filter.amenities = { $all: list };
        }
      }

      if (keyword) {
        filter.$or = [
          { title: new RegExp(keyword, 'i') },
          { suburb: new RegExp(keyword, 'i') },
          { address: new RegExp(keyword, 'i') },
          { nearbyInstitution: new RegExp(keyword, 'i') },
          { landlordFullName: new RegExp(keyword, 'i') }
        ];
      }

      const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
      const sortOrder = order === 'asc' ? 1 : -1;
      const pagination = {
        skip,
        limit: Math.min(100, Number(limit)),
        sort: { [sortBy]: sortOrder }
      };

      const { items, total } = await listingRepository.findWithPopulatedLandlord(filter, pagination);

      // Helper function to filter fallback listings by keyword, suburb, status
      const filterFallback = (list) => {
        return list.filter(l => {
          if (l.isDeleted) return false;
          if (isPublicQuery) {
            const isPending = ['pending_review', 'PENDING_REVIEW', 'pending'].includes(l.status) || ['PENDING', 'PENDING_REVIEW'].includes(l.publicationStatus);
            const isRejected = ['rejected', 'REJECTED'].includes(l.status) || l.publicationStatus === 'REJECTED';
            const isSuspended = ['suspended', 'SUSPENDED'].includes(l.status) || l.publicationStatus === 'SUSPENDED';
            const isDraft = ['draft', 'DRAFT'].includes(l.status) || l.publicationStatus === 'DRAFT';
            if (isPending || isRejected || isSuspended || isDraft) return false;
            const isPublished = l.publicationStatus === 'PUBLISHED' || ['active', 'approved', 'published', 'APPROVED', 'PUBLISHED', 'ACTIVE'].includes(l.status);
            if (!isPublished) return false;
          } else if (status && status !== 'all') {
            const lower = status.toLowerCase();
            const lStatus = (l.status || '').toLowerCase();
            const lPub = (l.publicationStatus || '').toLowerCase();
            if (lStatus !== lower && lPub !== lower) return false;
          }

          if (suburb && suburb !== 'all' && l.suburb && l.suburb.toLowerCase() !== suburb.toLowerCase()) return false;
          if (keyword) {
            const kw = keyword.toLowerCase();
            const title = (l.title || '').toLowerCase();
            const sub = (l.suburb || '').toLowerCase();
            const addr = (l.address || '').toLowerCase();
            const landlord = ((l.landlordId && l.landlordId.fullName) || l.landlordFullName || '').toLowerCase();
            const propType = (l.propertyType || '').toLowerCase();
            const match = title.includes(kw) || sub.includes(kw) || addr.includes(kw) || landlord.includes(kw) || propType.includes(kw);
            if (!match) return false;
          }
          return true;
        });
      };

      // If DB returns empty but fallback listings exist in initial state, merge seamlessly
      if (total === 0 && fallbackStore && fallbackStore.fallbackListings) {
        const filtered = filterFallback(fallbackStore.fallbackListings).map(l => this.populateListingLandlord(l));
        return {
          items: filtered,
          total: filtered.length,
          page: 1,
          limit: 20
        };
      }

      return { items, total, page: Number(page), limit: Number(limit) };
    } catch (err) {
      console.warn('ListingService query fallback:', err.message);
      const isPublic = !queryParams.status || queryParams.status === 'active' || queryParams.status === 'published' || queryParams.status === 'approved';
      const filtered = fallbackStore && fallbackStore.fallbackListings
        ? fallbackStore.fallbackListings.filter(l => {
            if (l.isDeleted) return false;
            if (isPublic) {
              const isPending = ['pending_review', 'PENDING_REVIEW'].includes(l.status) || l.publicationStatus === 'PENDING';
              const isRejected = ['rejected', 'REJECTED'].includes(l.status) || l.publicationStatus === 'REJECTED';
              const isSuspended = ['suspended', 'SUSPENDED'].includes(l.status) || l.publicationStatus === 'SUSPENDED';
              const isDraft = ['draft', 'DRAFT'].includes(l.status) || l.publicationStatus === 'DRAFT';
              if (isPending || isRejected || isSuspended || isDraft) return false;
              const isPublished = l.publicationStatus === 'PUBLISHED' || ['active', 'approved', 'APPROVED', 'ACTIVE'].includes(l.status);
              if (!isPublished) return false;
            } else if (queryParams.status && queryParams.status !== 'all') {
              const lower = queryParams.status.toLowerCase();
              const lStatus = (l.status || '').toLowerCase();
              const lPub = (l.publicationStatus || '').toLowerCase();
              if (lStatus !== lower && lPub !== lower) return false;
            }

            const kw = (queryParams.keyword || '').toLowerCase();
            if (kw) {
              const title = (l.title || '').toLowerCase();
              const sub = (l.suburb || '').toLowerCase();
              const addr = (l.address || '').toLowerCase();
              const landlord = ((l.landlordId && l.landlordId.fullName) || l.landlordFullName || '').toLowerCase();
              return title.includes(kw) || sub.includes(kw) || addr.includes(kw) || landlord.includes(kw);
            }
            return true;
          }).map(l => this.populateListingLandlord(l))
        : [];
      return {
        items: filtered,

        total: filtered.length,
        page: 1,
        limit: 20
      };
    }
  }

  /**
   * Helper to populate landlord details onto fallback listings
   */
  populateListingLandlord(listing) {
    if (!listing) return listing;
    const copy = { ...listing };
    let landlord = null;
    if (copy.landlordId && typeof copy.landlordId === 'object') {
      landlord = copy.landlordId;
    } else if (copy.landlordId && typeof copy.landlordId === 'string') {
      landlord = (fallbackStore.fallbackLandlords || []).find(l => String(l._id) === String(copy.landlordId));
    }
    if (landlord) {
      copy.landlordFullName = copy.landlordFullName || landlord.fullName;
      copy.publicPhone = copy.publicPhone || (landlord.showPhonePublicly ? landlord.phone : null);
      copy.landlordPhone = copy.landlordPhone || landlord.phone;
      copy.hasWhatsapp = copy.hasWhatsapp !== undefined ? copy.hasWhatsapp : (landlord.hasWhatsapp !== false);
      if (!copy.landlordId || typeof copy.landlordId === 'string') {
        copy.landlordId = {
          _id: landlord._id,
          fullName: landlord.fullName,
          phone: landlord.phone,
          hasWhatsapp: landlord.hasWhatsapp,
          showPhonePublicly: landlord.showPhonePublicly,
          isPhoneVerified: landlord.isPhoneVerified
        };
      }
    }
    return copy;
  }

  /**
   * Get single listing by ID
   */
  async getListingById(id) {
    let listing = null;
    try {
      listing = await listingRepository.findByIdWithLandlord(id);
    } catch (_) {}
    if (!listing) {
      // Check fallback store
      const fallback = (fallbackStore.fallbackListings || []).find(l => String(l._id) === String(id));
      if (fallback) return this.populateListingLandlord(fallback);
      throw new Error('Listing not found.');
    }
    return listing;
  }


  /**
   * Create a new room listing (direct posting supported)
   */
  async createListing(landlordId, listingData) {
    const phone = listingData.phone ? listingData.phone.trim() : null;
    const scamCheck = ScamDetectionService.evaluate(listingData);
    const initialStatus = scamCheck.flagged 
      ? 'pending_review' 
      : (listingData.status || 'pending_review');

    try {
      let landlord = null;
      if (phone) {
        try {
          landlord = await userRepository.findLandlordByPhone(phone);
        } catch (_) {}
      }
      if (!landlord && landlordId) {
        try {
          landlord = await userRepository.findById(landlordId);
        } catch (_) {}
      }

      // Auto-create Landlord profile if posting directly with a phone number
      if (!landlord && phone) {
        try {
          landlord = await userRepository.createLandlord({
            fullName: (listingData.fullName || listingData.ownerName || 'Landlord').trim(),
            phone: phone,
            hasWhatsapp: listingData.hasWhatsapp !== undefined ? !!listingData.hasWhatsapp : true,
            showPhonePublicly: !!listingData.showPhonePublicly,
            consentPhonePublic: !!listingData.consentPhonePublic,
            consentTimestamp: listingData.consentPhonePublic ? new Date() : null,
            isPhoneVerified: false
          });
        } catch (e) {
          try { landlord = await userRepository.findLandlordByPhone(phone); } catch (_) {}
        }
      }

      const listing = await listingRepository.create({
        landlordId: landlord ? landlord._id : (landlordId || new (require('mongoose').Types.ObjectId)()),
        title: listingData.title.trim(),
        suburb: listingData.suburb.trim(),
        address: listingData.address.trim(),
        monthlyRent: Number(listingData.monthlyRent),
        propertyType: listingData.propertyType || 'Backroom',
        nearbyInstitution: (listingData.nearbyInstitution || '').trim(),
        amenities: Array.isArray(listingData.amenities) ? listingData.amenities : [],
        image: listingData.image || '',
        status: initialStatus,
        source: listingData.source || 'landlord',
        flagged: scamCheck.flagged,
        flagReasons: scamCheck.reasons
      });

      return listing;
    } catch (dbErr) {
      console.warn('DB listing create fallback:', dbErr.message);
      if (fallbackStore) {
        const fbLandlord = (phone && fallbackStore.getLandlordByPhone ? fallbackStore.getLandlordByPhone(phone) : null) || fallbackStore.addLandlord({
          fullName: (listingData.fullName || listingData.ownerName || 'Landlord').trim(),
          phone: phone || '+27820000000',
          hasWhatsapp: listingData.hasWhatsapp !== undefined ? !!listingData.hasWhatsapp : true
        });
        const fbListing = fallbackStore.addListing({
          landlordId: fbLandlord,
          landlordFullName: fbLandlord.fullName,
          phone: fbLandlord.phone,
          title: listingData.title.trim(),
          suburb: listingData.suburb.trim(),
          address: listingData.address.trim(),
          monthlyRent: Number(listingData.monthlyRent),
          propertyType: listingData.propertyType || 'Backroom',
          nearbyInstitution: (listingData.nearbyInstitution || '').trim(),
          amenities: Array.isArray(listingData.amenities) ? listingData.amenities : [],
          image: listingData.image || '',
          status: initialStatus,
          flagged: scamCheck.flagged,
          flagReasons: scamCheck.reasons
        });
        return fbListing;
      }
      throw dbErr;
    }
  }

  /**
   * Update existing listing
   */
  async updateListing(id, landlordId, updateData, isAdmin = false) {
    const listing = await listingRepository.findById(id);
    if (!listing) {
      throw new Error('Listing not found.');
    }

    if (!isAdmin && listing.landlordId.toString() !== landlordId.toString()) {
      throw new Error('You are not authorized to update this listing.');
    }

    const updated = await listingRepository.updateById(id, updateData);
    return updated;
  }

  /**
   * Delete or archive listing
   */
  async deleteListing(id, landlordId, isAdmin = false) {
    const listing = await listingRepository.findById(id);
    if (!listing) {
      throw new Error('Listing not found.');
    }

    if (!isAdmin && listing.landlordId.toString() !== landlordId.toString()) {
      throw new Error('You are not authorized to delete this listing.');
    }

    await listingRepository.softDelete(id);
    return { success: true, message: 'Listing removed successfully.' };
  }

  /**
   * Increment contact count (telemetry / landlord notification)
   */
  async trackContact(id) {
    try {
      const updated = await listingRepository.incrementContactCount(id);
      if (updated) return updated;
    } catch (_) {}

    if (fallbackStore && fallbackStore.fallbackListings) {
      const item = fallbackStore.fallbackListings.find(l => String(l._id) === String(id));
      if (item) {
        item.contactCount = (item.contactCount || 0) + 1;
        return item;
      }
    }
    return null;
  }


  /**
   * Report listing for scam/abuse
   */
  async reportListing(id, reason) {
    try {
      const result = await listingRepository.reportListing(id, reason);
      return result;
    } catch (err) {
      console.warn('DB reportListing notice:', err.message);
      if (fallbackStore && typeof fallbackStore.reportListing === 'function') {
        return fallbackStore.reportListing(id, reason);
      }
      throw err;
    }
  }

  /**
   * Get conversation messages for a listing and tenant
   */
  async getListingMessages(listingId, tenantId) {
    try {
      const query = { listingId };
      if (tenantId) {
        query.tenantId = tenantId;
      }
      const messages = await Message.find(query).sort({ createdAt: 1 }).lean();
      if (messages && messages.length > 0) {
        return messages;
      }
      if (fallbackStore && typeof fallbackStore.getMessagesByListingAndTenant === 'function') {
        return fallbackStore.getMessagesByListingAndTenant(listingId, tenantId);
      }
      return [];
    } catch (err) {
      console.warn('Message DB fetch fallback:', err.message);
      if (fallbackStore && typeof fallbackStore.getMessagesByListingAndTenant === 'function') {
        return fallbackStore.getMessagesByListingAndTenant(listingId, tenantId);
      }
      return [];
    }
  }

  /**
   * Send a message between tenant and landlord
   */
  async sendListingMessage({ listingId, tenantId, sender = 'tenant', senderName, senderPhone, text }) {
    if (!listingId || !tenantId || !text || !text.trim()) {
      throw new Error('Listing ID, Tenant ID, and message text are required.');
    }

    let landlordId = '';
    let listingTitle = 'room';
    let suburb = 'Soweto';
    let monthlyRent = '2000';
    try {
      const listing = await this.getListingById(listingId);
      if (listing) {
        landlordId = (listing.landlordId && (listing.landlordId._id || listing.landlordId)) || '';
        listingTitle = listing.title || 'room';
        suburb = listing.suburb || 'Soweto';
        monthlyRent = listing.monthlyRent || '2000';
      }
    } catch (_) {}

    const messageData = {
      listingId: String(listingId),
      landlordId: String(landlordId),
      tenantId: String(tenantId),
      sender,
      senderName: senderName || (sender === 'tenant' ? 'Tenant' : 'Landlord'),
      senderPhone: senderPhone || '',
      text: text.trim(),
      read: false,
      createdAt: new Date()
    };

    let savedMessage = null;
    try {
      const doc = await Message.create(messageData);
      savedMessage = doc.toObject();
    } catch (err) {
      console.warn('Message DB save fallback:', err.message);
      if (fallbackStore && typeof fallbackStore.addMessage === 'function') {
        savedMessage = fallbackStore.addMessage(messageData);
      } else {
        savedMessage = { _id: 'msg_' + Date.now(), ...messageData };
      }
    }

    // If tenant sent message, generate a helpful landlord reply if this is their first inquiry
    // or if they asked a specific viewing/pricing question
    if (sender === 'tenant') {
      const lower = text.toLowerCase();
      let autoReplyText = null;

      if (lower.includes('available') || lower.includes('still there') || lower.includes('is it open')) {
        autoReplyText = `Sawubona! Yes, this ${listingTitle} in ${suburb} is currently available. In-person viewings are welcome. When would you like to come see the place?`;
      } else if (lower.includes('view') || lower.includes('see') || lower.includes('visit') || lower.includes('weekend') || lower.includes('today') || lower.includes('tomorrow')) {
        autoReplyText = `Hi ${senderName || 'there'}! You are welcome to view the room. Weekdays 16:00 - 18:00 and Saturdays 10:00 - 15:00 work well. As a safety reminder, please bring a companion with you for the viewing!`;
      } else if (lower.includes('deposit') || lower.includes('rent') || lower.includes('price') || lower.includes('electricity') || lower.includes('water') || lower.includes('power')) {
        autoReplyText = `Rent is R${monthlyRent}/month. A refundable deposit of R${monthlyRent} applies. Water is included and electricity is via prepaid meter. Never send any deposit money before viewing the room in person!`;
      } else if (lower.includes('parking') || lower.includes('car') || lower.includes('vehicle')) {
        autoReplyText = `Hi! There is secure yard space behind locked gates. Let me know if you would like to arrange a time to inspect the property.`;
      }

      if (autoReplyText) {
        setTimeout(async () => {
          try {
            const replyData = {
              listingId: String(listingId),
              landlordId: String(landlordId),
              tenantId: String(tenantId),
              sender: 'landlord',
              senderName: 'Landlord (Verified)',
              senderPhone: '',
              text: autoReplyText,
              read: false,
              createdAt: new Date()
            };
            if (fallbackStore && typeof fallbackStore.addMessage === 'function') {
              fallbackStore.addMessage(replyData);
            }
            try {
              await Message.create(replyData);
            } catch (_) {}
          } catch (_) {}
        }, 1200);
      }
    }

    return savedMessage;
  }

  /**
   * Get all messages for admin overview
   */
  async getAllMessages(limit = 100) {
    try {
      const messages = await Message.find().sort({ createdAt: -1 }).limit(limit).lean();
      if (messages && messages.length > 0) return messages;
      if (fallbackStore && typeof fallbackStore.getAllMessages === 'function') {
        return fallbackStore.getAllMessages(limit);
      }
      return [];
    } catch (err) {
      if (fallbackStore && typeof fallbackStore.getAllMessages === 'function') {
        return fallbackStore.getAllMessages(limit);
      }
      return [];
    }
  }
}

module.exports = new ListingService();
