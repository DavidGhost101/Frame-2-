const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Listing = require('../models/Listing');
const Landlord = require('../models/Landlord');
const { evaluateListingForScamSignals } = require('../services/scamDetection');

// Public-safe view of a listing: adds the landlord's number only if they
// opted in and consented, and never leaks internal moderation fields
// (flagReasons, reportCount) to the public feed.
function toPublicListing(listing, landlord) {
  const obj = listing.toObject ? listing.toObject() : listing;
  const publicListing = {
    _id: obj._id,
    title: obj.title,
    suburb: obj.suburb,
    monthlyRent: obj.monthlyRent,
    propertyType: obj.propertyType,
    nearbyInstitution: obj.nearbyInstitution,
    amenities: obj.amenities,
    image: obj.image,
    contactCount: obj.contactCount,
    source: obj.source,
    createdAt: obj.createdAt
  };

  if (landlord && landlord.showPhonePublicly && landlord.consentPhonePublic) {
    publicListing.publicPhone = landlord.phone;
    publicListing.hasWhatsapp = landlord.hasWhatsapp;
  }

  return publicListing;
}

// CREATE a listing (landlord must have a verified session, not be blocked,
// and still be within their free trial or already a paid subscriber)
router.post('/create', requireAuth, async (req, res) => {
  try {
    const landlord = await Landlord.findById(req.user.landlordId);
    if (!landlord) return res.status(404).json({ error: 'Landlord account not found.' });
    if (landlord.isBlocked) return res.status(403).json({ error: 'This account has been blocked from posting listings.' });
    if (!landlord.isWithinFreeAccess()) {
      return res.status(402).json({
        error: 'Your free 3-month trial has ended. Contact the site admin to upgrade and keep posting.'
      });
    }

    const { title, suburb, address, monthlyRent, propertyType, amenities, image, nearbyInstitution } = req.body;

    if (!title || !suburb || !address || monthlyRent === undefined) {
      return res.status(400).json({ error: 'title, suburb, address and monthlyRent are required.' });
    }
    if (Number(monthlyRent) <= 0) {
      return res.status(400).json({ error: 'monthlyRent must be a positive number.' });
    }

    const scamCheck = await evaluateListingForScamSignals(Listing, {
      title, address, amenities, image, monthlyRent, landlordId: landlord._id
    });

    const listing = await Listing.create({
      landlordId: landlord._id,
      title: String(title).slice(0, 120),
      suburb: String(suburb).slice(0, 60),
      address: String(address).slice(0, 200),
      monthlyRent: Number(monthlyRent),
      propertyType: propertyType || 'Backroom',
      amenities: Array.isArray(amenities) ? amenities.slice(0, 15) : [],
      image: image || '',
      nearbyInstitution: nearbyInstitution ? String(nearbyInstitution).slice(0, 100) : '',
      status: 'pending_review',
      source: 'landlord',
      flagged: scamCheck.flagged,
      flagReasons: scamCheck.reasons
    });

    res.status(201).json({ success: true, listingId: listing._id, listing });
  } catch (err) {
    console.error('create listing error:', err.message);
    res.status(500).json({ error: 'Failed to create listing.' });
  }
});

// BROWSE active listings (public), with filters
router.get('/', async (req, res) => {
  try {
    const { suburb, maxRent, propertyType, page = 1, limit = 20 } = req.query;
    const query = { status: 'active' };

    if (suburb && suburb !== 'All') query.suburb = new RegExp(suburb, 'i');
    if (propertyType && propertyType !== 'All') query.propertyType = propertyType;
    if (maxRent) query.monthlyRent = { $lte: Number(maxRent) };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('landlordId', 'phone hasWhatsapp showPhonePublicly consentPhonePublic'),
      Listing.countDocuments(query)
    ]);

    const publicListings = listings.map(l => toPublicListing(l, l.landlordId));

    res.json({ success: true, count: publicListings.length, total, page: pageNum, listings: publicListings });
  } catch (err) {
    console.error('browse listings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch listings.' });
  }
});

// GET a landlord's own listings (any status)
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const listings = await Listing.find({ landlordId: req.user.landlordId }).sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your listings.' });
  }
});

// GET a single listing (public only if active)
router.get('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).populate('landlordId', 'phone hasWhatsapp showPhonePublicly consentPhonePublic');
    if (!listing || listing.status !== 'active') {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    res.json({ success: true, listing: toPublicListing(listing, listing.landlordId) });
  } catch (err) {
    res.status(404).json({ error: 'Listing not found.' });
  }
});

// CONTACT landlord: logs interest and returns a WhatsApp or phone-call link
// depending on whether they have WhatsApp on that number
router.post('/:id/contact', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing || listing.status !== 'active') {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const landlord = await Landlord.findById(listing.landlordId);
    if (!landlord) return res.status(404).json({ error: 'Landlord not found.' });

    listing.contactCount += 1;
    await listing.save();

    if (!landlord.hasWhatsapp) {
      res.json({ success: true, callLink: `tel:${landlord.phone}`, hasWhatsapp: false });
      return;
    }

    const waNumber = landlord.phone.replace('+', '');
    const message = encodeURIComponent(
      `Hi, I'm interested in "${listing.title}" (${listing.suburb}, R${listing.monthlyRent}/month) on Rent A Room.`
    );

    res.json({
      success: true,
      whatsappLink: `https://wa.me/${waNumber}?text=${message}`,
      hasWhatsapp: true
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register contact request.' });
  }
});

// REPORT a listing as suspicious (public, no auth needed so tenants can flag freely)
router.post('/:id/report', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    listing.reportCount += 1;
    listing.flagged = true;
    if (!listing.flagReasons.includes('Reported by a user')) {
      listing.flagReasons.push('Reported by a user');
    }
    await listing.save();

    res.json({ success: true, message: 'Thanks — this listing has been flagged for admin review.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

module.exports = router;
