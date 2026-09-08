const listingRepository = require('../repositories/ListingRepository');
const userRepository = require('../repositories/UserRepository');
const ScamDetectionService = require('./ScamDetectionService');
const Message = require('../models/Message');
const fallbackStore = require('../../../services/fallbackStore');
const mongoose = require('mongoose');
const appEvents = require('../events/eventEmitter');
const storageService = require('./StorageService');

// Duplicate submission window cache (prevents duplicate room postings within 30 seconds)
const recentListingSubmissions = new Map();

// Periodic cleanup of deduplication window
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [key, val] of recentListingSubmissions.entries()) {
    if (val.timestamp < cutoff) recentListingSubmissions.delete(key);
  }
}, 60000);

class ListingService {
  /**
   * Search and filter listings with pagination
   */
  async getListings(queryParams = {}) {
    const {
      suburb,
      propertyType,
      maxPrice,
      maxRent,
      minPrice,
      amenities,
      keyword,
      status = 'active',
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      sort,
      wifi
    } = queryParams;

    // Normalize sorting parameters for price low-to-high, price high-to-low, or newest
    let effectiveSortBy = sortBy;
    let effectiveOrder = (order || 'desc').toLowerCase();

    if (sort === 'price_asc' || queryParams.sortBy === 'price_asc' || (['price', 'monthlyRent'].includes(sortBy) && effectiveOrder === 'asc')) {
      effectiveSortBy = 'monthlyRent';
      effectiveOrder = 'asc';
    } else if (sort === 'price_desc' || queryParams.sortBy === 'price_desc' || (['price', 'monthlyRent'].includes(sortBy) && effectiveOrder === 'desc')) {
      effectiveSortBy = 'monthlyRent';
      effectiveOrder = 'desc';
    } else if (sort === 'newest') {
      effectiveSortBy = 'createdAt';
      effectiveOrder = 'desc';
    }

    try {
      const effectiveMaxPrice = maxPrice || maxRent;
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
            publicationStatus: { $nin: ['DRAFT', 'PENDING', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED', 'UNPUBLISHED', 'suspended', 'rejected', 'draft', 'pending'] }
          }
        ];
      } else if (status && status !== 'all') {
        const lower = status.toLowerCase();
        filter.$and = filter.$and || [];
        if (lower === 'active') {
          filter.$and.push({
            $or: [
              { status: { $in: ['active', 'approved', 'ACTIVE', 'APPROVED'] } },
              { publicationStatus: 'PUBLISHED' }
            ]
          });
          filter.$and.push({
            status: { $nin: ['pending_review', 'rejected', 'suspended', 'archived', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED', 'ARCHIVED'] }
          });
        } else if (lower === 'pending_review' || lower === 'pending') {
          filter.$and.push({
            $or: [
              { status: { $in: ['pending_review', 'pending', 'PENDING_REVIEW', 'PENDING'] } },
              { publicationStatus: { $in: ['PENDING', 'PENDING_REVIEW'] } }
            ]
          });
        } else if (lower === 'flagged') {
          filter.$and.push({
            $or: [
              { flagged: true },
              { reportCount: { $gt: 0 } }
            ]
          });
        } else {
          filter.$and.push({
            $or: [
              { status: lower },
              { status: lower.toUpperCase() },
              { publicationStatus: lower.toUpperCase() }
            ]
          });
        }
      }

      if (suburb && suburb !== 'all') {
        filter.suburb = new RegExp(`^${suburb}$`, 'i');
      }

      if (propertyType && propertyType !== 'all' && propertyType !== 'All') {
        filter.propertyType = new RegExp(`^${propertyType}$`, 'i');
      }

      if (minPrice || effectiveMaxPrice) {
        filter.monthlyRent = {};
        if (minPrice) filter.monthlyRent.$gte = Number(minPrice);
        if (effectiveMaxPrice) filter.monthlyRent.$lte = Number(effectiveMaxPrice);
      }

      if (wifi === 'true' || wifi === '1' || wifi === true) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { amenities: { $elemMatch: { $regex: /wifi|wi-fi|internet/i } } },
            { title: { $regex: /wifi|wi-fi|internet/i } },
            { description: { $regex: /wifi|wi-fi|internet/i } }
          ]
        });
      }

      if (amenities) {
        const list = Array.isArray(amenities) ? amenities : amenities.split(',').map(a => a.trim());
        if (list.length) {
          filter.amenities = { $all: list };
        }
      }

      if (keyword) {
        const kwRegex = new RegExp(keyword, 'i');
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { title: kwRegex },
            { suburb: kwRegex },
            { address: kwRegex },
            { nearbyInstitution: kwRegex },
            { propertyType: kwRegex },
            { amenities: { $elemMatch: { $regex: kwRegex } } },
            { description: kwRegex },
            { landlordFullName: kwRegex }
          ]
        });
      }

      const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
      const sortOrder = effectiveOrder === 'asc' ? 1 : -1;
      const pagination = {
        skip,
        limit: Math.min(100, Number(limit)),
        sort: { [effectiveSortBy]: sortOrder }
      };

      const { items, total } = await listingRepository.findWithPopulatedLandlord(filter, pagination);

      // Helper function to filter fallback listings by all criteria
      const filterFallback = (list) => {
        return list.filter(l => {
          if (l.isDeleted) return false;
          if (isPublicQuery) {
            const isSuspended = ['suspended', 'SUSPENDED'].includes(l.status) || ['suspended', 'SUSPENDED'].includes(l.publicationStatus);
            if (isSuspended) return false;
            const isPending = ['pending_review', 'PENDING_REVIEW', 'pending', 'PENDING'].includes(l.status) || ['PENDING', 'PENDING_REVIEW', 'pending'].includes(l.publicationStatus);
            if (isPending) return false;
            const isRejected = ['rejected', 'REJECTED'].includes(l.status) || ['rejected', 'REJECTED'].includes(l.publicationStatus);
            if (isRejected) return false;
            const isDraft = ['draft', 'DRAFT'].includes(l.status) || ['draft', 'DRAFT'].includes(l.publicationStatus);
            if (isDraft) return false;
            const isArchived = ['archived', 'ARCHIVED'].includes(l.status) || ['archived', 'ARCHIVED', 'UNPUBLISHED'].includes(l.publicationStatus);
            if (isArchived) return false;

            const isPublished = ['published', 'PUBLISHED'].includes(l.publicationStatus) || ['active', 'approved', 'published', 'APPROVED', 'PUBLISHED', 'ACTIVE'].includes(l.status);
            if (!isPublished) return false;
          } else if (status && status !== 'all') {
            const lower = status.toLowerCase();
            const lStatus = (l.status || '').toLowerCase();
            const lPub = (l.publicationStatus || '').toLowerCase();
            if (lower === 'active') {
              const isActive = lStatus === 'active' || lStatus === 'approved' || lPub === 'published';
              const isExcluded = ['pending_review', 'pending', 'rejected', 'suspended', 'archived', 'draft'].includes(lStatus);
              if (!isActive || isExcluded) return false;
            } else if (lower === 'pending_review' || lower === 'pending') {
              const isPending = lStatus === 'pending_review' || lStatus === 'pending' || lPub === 'pending' || lPub === 'pending_review';
              if (!isPending) return false;
            } else if (lower === 'flagged') {
              const isFlagged = l.flagged || (l.reportCount && l.reportCount > 0);
              if (!isFlagged) return false;
            } else if (lower === 'suspended') {
              if (lStatus !== 'suspended' && lPub !== 'suspended') return false;
            } else if (lower === 'rejected') {
              if (lStatus !== 'rejected' && lPub !== 'rejected') return false;
            } else if (lower === 'archived') {
              if (lStatus !== 'archived' && lPub !== 'unpublished') return false;
            } else {
              if (lStatus !== lower && lPub !== lower) return false;
            }
          }

          if (suburb && suburb !== 'all' && l.suburb && l.suburb.toLowerCase() !== suburb.toLowerCase()) return false;
          if (propertyType && propertyType !== 'all' && propertyType !== 'All') {
            if (!l.propertyType || l.propertyType.toLowerCase() !== propertyType.toLowerCase()) return false;
          }
          const max = Number(effectiveMaxPrice);
          if (max && l.monthlyRent > max) return false;
          const min = Number(minPrice);
          if (min && l.monthlyRent < min) return false;

          if (wifi === 'true' || wifi === '1' || wifi === true) {
            const hasWifi = (l.amenities || []).some(a => /wifi|wi-fi|internet/i.test(a)) ||
                            /wifi|wi-fi|internet/i.test(l.title || '');
            if (!hasWifi) return false;
          }

          if (amenities) {
            const list = Array.isArray(amenities) ? amenities : amenities.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
            if (list.length) {
              const lAmenities = (l.amenities || []).map(a => a.toLowerCase());
              const matchesAll = list.every(item => lAmenities.some(a => a.includes(item)));
              if (!matchesAll) return false;
            }
          }

          if (keyword) {
            const kw = keyword.toLowerCase();
            const title = (l.title || '').toLowerCase();
            const sub = (l.suburb || '').toLowerCase();
            const addr = (l.address || '').toLowerCase();
            const institution = (l.nearbyInstitution || '').toLowerCase();
            const landlord = ((l.landlordId && l.landlordId.fullName) || l.landlordFullName || '').toLowerCase();
            const propType = (l.propertyType || '').toLowerCase();
            const desc = (l.description || '').toLowerCase();
            const amenitiesStr = (l.amenities || []).join(' ').toLowerCase();
            const match = title.includes(kw) ||
                          sub.includes(kw) ||
                          addr.includes(kw) ||
                          institution.includes(kw) ||
                          landlord.includes(kw) ||
                          propType.includes(kw) ||
                          desc.includes(kw) ||
                          amenitiesStr.includes(kw);
            if (!match) return false;
          }
          return true;
        });
      };

      // Combine MongoDB items and fallbackStore items seamlessly
      let combinedItems = [...items];
      if (fallbackStore && fallbackStore.fallbackListings) {
        const filteredFallback = filterFallback(fallbackStore.fallbackListings);
        for (const fbItem of filteredFallback) {
          const exists = combinedItems.some(it => String(it._id) === String(fbItem._id));
          if (!exists) {
            combinedItems.push(this.populateListingLandlord(fbItem));
          }
        }
      }

      // Enforce requested sorting (price low-to-high, price high-to-low, or newest)
      if (effectiveSortBy === 'monthlyRent' || effectiveSortBy === 'price') {
        combinedItems.sort((a, b) => {
          const priceA = Number(a.monthlyRent) || 0;
          const priceB = Number(b.monthlyRent) || 0;
          return sortOrder === 1 ? priceA - priceB : priceB - priceA;
        });
      } else {
        combinedItems.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return sortOrder === 1 ? dateA - dateB : dateB - dateA;
        });
      }

      return { items: combinedItems, total: combinedItems.length, page: Number(page), limit: Number(limit) };
    } catch (err) {
      console.warn('ListingService query fallback:', err.message);
      const isPublic = !queryParams.status || queryParams.status === 'active' || queryParams.status === 'published' || queryParams.status === 'approved';
      const effectiveMax = queryParams.maxPrice || queryParams.maxRent;
      const filtered = fallbackStore && fallbackStore.fallbackListings
        ? fallbackStore.fallbackListings.filter(l => {
            if (l.isDeleted) return false;
            if (isPublic) {
              const isSuspended = ['suspended', 'SUSPENDED'].includes(l.status) || ['suspended', 'SUSPENDED'].includes(l.publicationStatus);
              if (isSuspended) return false;
              const isPending = ['pending_review', 'PENDING_REVIEW', 'pending', 'PENDING'].includes(l.status) || ['PENDING', 'PENDING_REVIEW', 'pending'].includes(l.publicationStatus);
              if (isPending) return false;
              const isRejected = ['rejected', 'REJECTED'].includes(l.status) || ['rejected', 'REJECTED'].includes(l.publicationStatus);
              if (isRejected) return false;
              const isDraft = ['draft', 'DRAFT'].includes(l.status) || ['draft', 'DRAFT'].includes(l.publicationStatus);
              if (isDraft) return false;
              const isArchived = ['archived', 'ARCHIVED'].includes(l.status) || ['archived', 'ARCHIVED', 'UNPUBLISHED'].includes(l.publicationStatus);
              if (isArchived) return false;

              const isPublished = ['published', 'PUBLISHED'].includes(l.publicationStatus) || ['active', 'approved', 'published', 'APPROVED', 'PUBLISHED', 'ACTIVE'].includes(l.status);
              if (!isPublished) return false;
            } else if (queryParams.status && queryParams.status !== 'all') {
              const lower = queryParams.status.toLowerCase();
              const lStatus = (l.status || '').toLowerCase();
              const lPub = (l.publicationStatus || '').toLowerCase();
              if (lower === 'pending_review' || lower === 'pending') {
                const isPending = ['pending_review', 'pending'].includes(lStatus) || ['pending', 'pending_review'].includes(lPub);
                if (!isPending) return false;
              } else if (lower === 'active') {
                const isActive = ['active', 'approved'].includes(lStatus) || ['published'].includes(lPub);
                const isDisqualified = ['pending_review', 'rejected', 'suspended', 'archived', 'pending'].includes(lStatus);
                if (!isActive || isDisqualified) return false;
              } else if (lower === 'rejected') {
                const isRejected = ['rejected'].includes(lStatus) || ['rejected'].includes(lPub);
                if (!isRejected) return false;
              } else if (lower === 'suspended') {
                const isSuspended = ['suspended'].includes(lStatus) || ['suspended'].includes(lPub);
                if (!isSuspended) return false;
              } else if (lower === 'flagged') {
                if (!l.flagged && (!l.reportCount || l.reportCount <= 0)) return false;
              } else if (lStatus !== lower && lPub !== lower) return false;
            }

            if (queryParams.suburb && queryParams.suburb !== 'all' && l.suburb && l.suburb.toLowerCase() !== queryParams.suburb.toLowerCase()) return false;
            if (queryParams.propertyType && queryParams.propertyType !== 'all' && queryParams.propertyType !== 'All') {
              if (!l.propertyType || l.propertyType.toLowerCase() !== queryParams.propertyType.toLowerCase()) return false;
            }
            if (effectiveMax && l.monthlyRent > Number(effectiveMax)) return false;
            if (queryParams.minPrice && l.monthlyRent < Number(queryParams.minPrice)) return false;

            if (queryParams.wifi === 'true' || queryParams.wifi === '1' || queryParams.wifi === true) {
              const hasWifi = (l.amenities || []).some(a => /wifi|wi-fi|internet/i.test(a)) ||
                              /wifi|wi-fi|internet/i.test(l.title || '');
              if (!hasWifi) return false;
            }

            const kw = (queryParams.keyword || '').toLowerCase();
            if (kw) {
              const title = (l.title || '').toLowerCase();
              const sub = (l.suburb || '').toLowerCase();
              const addr = (l.address || '').toLowerCase();
              const institution = (l.nearbyInstitution || '').toLowerCase();
              const landlord = ((l.landlordId && l.landlordId.fullName) || l.landlordFullName || '').toLowerCase();
              const propType = (l.propertyType || '').toLowerCase();
              const desc = (l.description || '').toLowerCase();
              const amenitiesStr = (l.amenities || []).join(' ').toLowerCase();
              return title.includes(kw) ||
                     sub.includes(kw) ||
                     addr.includes(kw) ||
                     institution.includes(kw) ||
                     landlord.includes(kw) ||
                     propType.includes(kw) ||
                     desc.includes(kw) ||
                     amenitiesStr.includes(kw);
            }
            return true;
          }).map(l => this.populateListingLandlord(l))
        : [];

      // Enforce requested sorting on fallback listings
      const isPriceSort = effectiveSortBy === 'monthlyRent' || effectiveSortBy === 'price';
      filtered.sort((a, b) => {
        if (isPriceSort) {
          const priceA = Number(a.monthlyRent) || 0;
          const priceB = Number(b.monthlyRent) || 0;
          return effectiveOrder === 'asc' ? priceA - priceB : priceB - priceA;
        }
        const sortField = effectiveSortBy || 'createdAt';
        const dateA = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const dateB = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return effectiveOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });

      return {
        items: filtered,
        total: filtered.length,
        page: Number(page || 1),
        limit: Number(limit || 20)
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
  async getListingById(id, isAdmin = false) {
    let listing = null;
    try {
      listing = await listingRepository.findByIdWithLandlord(id);
    } catch (_) {}
    if (!listing) {
      // Check fallback store
      const fallback = (fallbackStore.fallbackListings || []).find(l => String(l._id) === String(id));
      if (fallback) listing = this.populateListingLandlord(fallback);
    }
    if (!listing || listing.isDeleted) {
      throw new Error('Listing not found.');
    }
    if (!isAdmin) {
      const isSuspended = ['suspended', 'SUSPENDED'].includes(listing.status) || ['suspended', 'SUSPENDED'].includes(listing.publicationStatus);
      if (isSuspended) {
        throw new Error('This listing has been suspended and is no longer publicly available.');
      }
    }
    return listing;
  }


  /**
   * Create a new room listing (direct posting supported)
   */
  async createListing(landlordId, listingData) {
    const phone = listingData.phone ? listingData.phone.trim() : null;
    const scamCheck = ScamDetectionService.evaluate(listingData);

    // Sanitize listing image: automatically upload base64 image to Firebase Storage
    if (listingData.image) {
      try {
        listingData.image = await storageService.sanitizeListingImage(listingData.image);
      } catch (imgErr) {
        console.warn('Image Firebase Storage sanitize warning:', imgErr.message);
      }
    }

    // When a landlord posts a room, it enters pending_review. Once admin approves it, it is published to the public portal.
    const initialStatus = listingData.status === 'active' ? 'active' : 'pending_review';
    const initialPubStatus = initialStatus === 'active' ? 'PUBLISHED' : 'PENDING';

    // 1. Guard against duplicate rapid submissions
    const naturalKey = `${(phone || '').replace(/\D/g, '')}:${(listingData.suburb || '').toLowerCase().trim()}:${(listingData.address || '').toLowerCase().trim()}:${Number(listingData.monthlyRent)}`;
    const now = Date.now();
    const lastSub = recentListingSubmissions.get(naturalKey);
    if (lastSub && (now - lastSub.timestamp < 30000)) {
      const err = new Error('A room listing with these details was recently submitted. Please avoid submitting duplicates.');
      err.statusCode = 409;
      err.code = 'DUPLICATE_SUBMISSION';
      throw err;
    }
    recentListingSubmissions.set(naturalKey, { timestamp: now });

    // 2. If DB is not connected, use resilient in-memory store immediately without buffering stalls
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (!isDbConnected && fallbackStore) {
      const existingFbLandlord = (phone && fallbackStore.getLandlordByPhone ? fallbackStore.getLandlordByPhone(phone) : null) || (landlordId && fallbackStore.getLandlordById ? fallbackStore.getLandlordById(landlordId) : null);
      if (existingFbLandlord && existingFbLandlord.isBlocked) {
        const err = new Error('Your landlord account has been blocked by administration. You cannot post or manage rooms.');
        err.statusCode = 403;
        err.code = 'LANDLORD_BLOCKED';
        throw err;
      }
      const fbLandlord = existingFbLandlord || fallbackStore.addLandlord({
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
        publicationStatus: initialPubStatus,
        flagged: scamCheck.flagged,
        flagReasons: scamCheck.reasons
      });
      const populated = this.populateListingLandlord(fbListing);
      try {
        appEvents.emit('listing:created', populated);
      } catch (_) {}
      return populated;
    }

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

      // Check if landlord is blocked
      if (landlord && landlord.isBlocked) {
        const err = new Error('Your landlord account has been blocked by administration. You cannot post or manage rooms.');
        err.statusCode = 403;
        err.code = 'LANDLORD_BLOCKED';
        throw err;
      }

      // Also check fallback store for blocked status by phone or id
      if (fallbackStore) {
        const fbCheck = (phone && fallbackStore.getLandlordByPhone ? fallbackStore.getLandlordByPhone(phone) : null) || (landlordId && fallbackStore.getLandlordById ? fallbackStore.getLandlordById(landlordId) : null);
        if (fbCheck && fbCheck.isBlocked) {
          const err = new Error('Your landlord account has been blocked by administration. You cannot post or manage rooms.');
          err.statusCode = 403;
          err.code = 'LANDLORD_BLOCKED';
          throw err;
        }
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

      const serverCreatedAt = new Date();
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
        publicationStatus: initialStatus === 'active' ? 'PUBLISHED' : 'PENDING',
        source: listingData.source || 'landlord',
        flagged: scamCheck.flagged,
        flagReasons: scamCheck.reasons,
        createdAt: serverCreatedAt
      });

      const populatedListing = this.populateListingLandlord(listing.toObject ? listing.toObject() : listing);

      // Keep in-memory store in sync
      if (listing && fallbackStore && typeof fallbackStore.addListing === 'function') {
        const fbLandlord = (phone && fallbackStore.getLandlordByPhone ? fallbackStore.getLandlordByPhone(phone) : null) || fallbackStore.addLandlord({
          fullName: (listingData.fullName || listingData.ownerName || 'Landlord').trim(),
          phone: phone || '+27820000000',
          hasWhatsapp: listingData.hasWhatsapp !== undefined ? !!listingData.hasWhatsapp : true
        });
        fallbackStore.addListing({
          _id: String(listing._id),
          landlordId: fbLandlord,
          landlordFullName: fbLandlord.fullName,
          phone: fbLandlord.phone,
          title: listing.title,
          suburb: listing.suburb,
          address: listing.address,
          monthlyRent: listing.monthlyRent,
          propertyType: listing.propertyType,
          nearbyInstitution: listing.nearbyInstitution,
          amenities: listing.amenities,
          image: listing.image,
          status: initialStatus,
          publicationStatus: initialStatus === 'active' ? 'PUBLISHED' : 'PENDING',
          flagged: scamCheck.flagged,
          flagReasons: scamCheck.reasons,
          createdAt: serverCreatedAt
        });
      }

      // Emit real-time event
      try {
        appEvents.emit('listing:created', populatedListing);
      } catch (evtErr) {
        console.warn('Error emitting listing:created event:', evtErr.message);
      }

      return populatedListing;
    } catch (dbErr) {
      console.warn('DB listing create fallback:', dbErr.message);
      if (fallbackStore) {
        const fbLandlord = (phone && fallbackStore.getLandlordByPhone ? fallbackStore.getLandlordByPhone(phone) : null) || fallbackStore.addLandlord({
          fullName: (listingData.fullName || listingData.ownerName || 'Landlord').trim(),
          phone: phone || '+27820000000',
          hasWhatsapp: listingData.hasWhatsapp !== undefined ? !!listingData.hasWhatsapp : true
        });
        const fbCreatedAt = new Date();
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
          publicationStatus: initialStatus === 'active' ? 'PUBLISHED' : 'PENDING',
          flagged: scamCheck.flagged,
          flagReasons: scamCheck.reasons,
          createdAt: fbCreatedAt
        });
        const populatedFb = this.populateListingLandlord(fbListing);
        try {
          appEvents.emit('listing:created', populatedFb);
        } catch (evtErr) {
          console.warn('Error emitting fallback listing:created event:', evtErr.message);
        }
        return populatedFb;
      }
      throw dbErr;
    }
  }

  /**
   * Update existing listing
   */
  async updateListing(id, landlordId, updateData, isAdmin = false) {
    if (updateData && updateData.image) {
      try {
        updateData.image = await storageService.sanitizeListingImage(updateData.image);
      } catch (imgErr) {
        console.warn('Update image Firebase Storage sanitize warning:', imgErr.message);
      }
    }

    if (!isAdmin && landlordId) {
      let isLandlordBlocked = false;
      try {
        const lRecord = await userRepository.findById(landlordId);
        if (lRecord && lRecord.isBlocked) isLandlordBlocked = true;
      } catch (_) {}
      if (!isLandlordBlocked && fallbackStore) {
        const fbL = (fallbackStore.fallbackLandlords || []).find(l => String(l._id) === String(landlordId));
        if (fbL && fbL.isBlocked) isLandlordBlocked = true;
      }
      if (isLandlordBlocked) {
        const err = new Error('Your landlord account has been blocked by administration. You cannot update listings.');
        err.statusCode = 403;
        err.code = 'LANDLORD_BLOCKED';
        throw err;
      }
    }

    let listing = null;
    try {
      listing = await listingRepository.findById(id);
    } catch (_) {}

    if (!listing && fallbackStore && fallbackStore.fallbackListings) {
      const fbItem = fallbackStore.fallbackListings.find(l => String(l._id) === String(id));
      if (fbItem) {
        const itemLandlordId = fbItem.landlordId && (fbItem.landlordId._id || fbItem.landlordId);
        if (!isAdmin && landlordId && String(itemLandlordId) !== String(landlordId)) {
          throw new Error('You are not authorized to update this listing.');
        }
        Object.assign(fbItem, updateData);
        return fbItem;
      }
    }

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
    if (!isAdmin && landlordId) {
      let isLandlordBlocked = false;
      try {
        const lRecord = await userRepository.findById(landlordId);
        if (lRecord && lRecord.isBlocked) isLandlordBlocked = true;
      } catch (_) {}
      if (!isLandlordBlocked && fallbackStore) {
        const fbL = (fallbackStore.fallbackLandlords || []).find(l => String(l._id) === String(landlordId));
        if (fbL && fbL.isBlocked) isLandlordBlocked = true;
      }
      if (isLandlordBlocked) {
        const err = new Error('Your landlord account has been blocked by administration. You cannot delete listings.');
        err.statusCode = 403;
        err.code = 'LANDLORD_BLOCKED';
        throw err;
      }
    }

    let listing = null;
    try {
      listing = await listingRepository.findById(id);
    } catch (_) {}

    if (!listing && fallbackStore && typeof fallbackStore.deleteListing === 'function') {
      const fbDeleted = fallbackStore.deleteListing(id);
      if (fbDeleted) {
        try {
          appEvents.emit('listing:deleted', { listingId: id });
        } catch (_) {}
        return { success: true, message: 'Listing removed successfully.' };
      }
    }

    if (!listing) {
      throw new Error('Listing not found.');
    }

    if (!isAdmin && listing.landlordId.toString() !== landlordId.toString()) {
      throw new Error('You are not authorized to delete this listing.');
    }

    await listingRepository.softDelete(id);
    if (fallbackStore && typeof fallbackStore.deleteListing === 'function') {
      fallbackStore.deleteListing(id);
    }
    try {
      appEvents.emit('listing:deleted', { listingId: id });
    } catch (_) {}
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
