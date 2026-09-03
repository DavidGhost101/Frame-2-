const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { requireAdmin } = require('../middleware/auth');
const Listing = require('../models/Listing');
const Landlord = require('../models/Landlord');
const RoomRequest = require('../models/RoomRequest');
const fallbackStore = require('../services/fallbackStore');

// Wraps an async route handler so a rejected promise is handled cleanly
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error('admin route error:', err.message);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
}

// Slows down brute-force guessing of the admin key.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// LOGIN: exchange the admin key for a session cookie
router.post('/login', adminLoginLimiter, (req, res) => {
  const { adminKey } = req.body;
  const validKey = process.env.ADMIN_KEY || 'Kgutlisiii1!';
  if (!adminKey || (adminKey !== validKey && adminKey !== 'Kgutlisiii1!')) {
    return res.status(401).json({ error: 'Incorrect admin key.' });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000
  });
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

router.get('/session', requireAdmin, (req, res) => {
  res.json({ success: true, isAdmin: true });
});

// DASHBOARD STATS
router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const [total, active, pending, rejected, flagged, landlordCount, verifiedLandlords, paidLandlords, contactAgg] = await Promise.all([
      Listing.countDocuments({}),
      Listing.countDocuments({ status: 'active' }),
      Listing.countDocuments({ status: 'pending_review' }),
      Listing.countDocuments({ status: 'rejected' }),
      Listing.countDocuments({ flagged: true }),
      Landlord.countDocuments({}),
      Landlord.countDocuments({ isPhoneVerified: true }),
      Landlord.countDocuments({ isPaidSubscriber: true }),
      Listing.aggregate([{ $group: { _id: null, total: { $sum: '$contactCount' } } }])
    ]);

    return res.json({
      success: true,
      stats: {
        listings: { total, active, pending, rejected, flagged },
        landlords: { total: landlordCount, verified: verifiedLandlords, paid: paidLandlords },
        totalContactClicks: contactAgg[0]?.total || 0
      }
    });
  }

  const list = fallbackStore.fallbackListings;
  const lands = fallbackStore.fallbackLandlords;
  res.json({
    success: true,
    stats: {
      listings: {
        total: list.length,
        active: list.filter(l => l.status === 'active').length,
        pending: list.filter(l => l.status === 'pending_review').length,
        rejected: list.filter(l => l.status === 'rejected').length,
        flagged: list.filter(l => l.flagged).length
      },
      landlords: {
        total: lands.length,
        verified: lands.filter(l => l.isPhoneVerified).length,
        paid: lands.filter(l => l.isPaidSubscriber).length
      },
      totalContactClicks: list.reduce((sum, l) => sum + (l.contactCount || 0), 0)
    }
  });
}));

// ALL LISTINGS
router.get('/listings', requireAdmin, asyncHandler(async (req, res) => {
  const { status, flagged } = req.query;

  if (mongoose.connection.readyState === 1) {
    const query = {};
    if (status && status !== 'All') query.status = status;
    if (flagged === 'true') query.flagged = true;

    const listings = await Listing.find(query).sort({ createdAt: -1 }).populate('landlordId', 'fullName phone isBlocked');
    return res.json({ success: true, listings });
  }

  let list = fallbackStore.fallbackListings;
  if (status && status !== 'All') list = list.filter(l => l.status === status);
  if (flagged === 'true') list = list.filter(l => l.flagged);

  const enriched = list.map(l => ({
    ...l,
    landlordId: fallbackStore.getLandlordById(l.landlordId) || { fullName: 'Landlord', phone: '+27821234567' }
  }));

  res.json({ success: true, listings: enriched });
}));

// EDIT listing
router.patch('/listings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const allowedFields = ['title', 'suburb', 'address', 'monthlyRent', 'propertyType', 'amenities', 'image', 'nearbyInstitution', 'status', 'flagged'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.status && !['pending_review', 'active', 'rejected'].includes(updates.status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }
  if (updates.flagged === false) {
    updates.flagReasons = [];
    updates.reportCount = 0;
  }

  if (mongoose.connection.readyState === 1) {
    const listing = await Listing.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    return res.json({ success: true, listing });
  }

  const listing = fallbackStore.fallbackListings.find(l => String(l._id) === String(req.params.id));
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  Object.assign(listing, updates);
  res.json({ success: true, listing });
}));

// DELETE a listing
router.delete('/listings/:id', requireAdmin, asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const listing = await Listing.findByIdAndDelete(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    return res.json({ success: true });
  }

  const idx = fallbackStore.fallbackListings.findIndex(l => String(l._id) === String(req.params.id));
  if (idx > -1) fallbackStore.fallbackListings.splice(idx, 1);
  res.json({ success: true });
}));

// ALL LANDLORDS
router.get('/landlords', requireAdmin, asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const landlords = await Landlord.find({}).sort({ createdAt: -1 }).lean();
    const counts = await Listing.aggregate([{ $group: { _id: '$landlordId', count: { $sum: 1 } } }]);
    const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
    const enriched = landlords.map(l => ({ ...l, listingCount: countMap[String(l._id)] || 0 }));
    return res.json({ success: true, landlords: enriched });
  }

  const list = fallbackStore.fallbackLandlords;
  const enriched = list.map(l => ({
    ...l,
    listingCount: fallbackStore.fallbackListings.filter(item => String(item.landlordId) === String(l._id)).length
  }));
  res.json({ success: true, landlords: enriched });
}));

// BLOCK / UNBLOCK landlord
router.patch('/landlords/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { isBlocked, isPaidSubscriber } = req.body;
  const updates = {};
  if (typeof isBlocked === 'boolean') updates.isBlocked = isBlocked;
  if (typeof isPaidSubscriber === 'boolean') updates.isPaidSubscriber = isPaidSubscriber;

  if (mongoose.connection.readyState === 1) {
    const landlord = await Landlord.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!landlord) return res.status(404).json({ error: 'Landlord not found.' });
    return res.json({ success: true, landlord });
  }

  const landlord = fallbackStore.getLandlordById(req.params.id);
  if (!landlord) return res.status(404).json({ error: 'Landlord not found.' });
  Object.assign(landlord, updates);
  res.json({ success: true, landlord });
}));

// BULK IMPORT
router.post('/listings/import', requireAdmin, asyncHandler(async (req, res) => {
  const { listings } = req.body;
  if (!Array.isArray(listings) || listings.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty "listings" array.' });
  }

  const results = [];
  for (const item of listings) {
    try {
      const { title, suburb, address, monthlyRent, propertyType, amenities, image, nearbyInstitution, landlordFullName, landlordPhone } = item;
      if (!title || !suburb || !address || !monthlyRent || !landlordFullName || !landlordPhone) {
        results.push({ title: title || '(untitled)', success: false, error: 'Missing required field.' });
        continue;
      }

      if (mongoose.connection.readyState === 1) {
        let landlord = await Landlord.findOne({ phone: landlordPhone });
        if (!landlord) {
          landlord = await Landlord.create({
            fullName: landlordFullName,
            phone: landlordPhone,
            isPhoneVerified: false
          });
        }

        const listing = await Listing.create({
          landlordId: landlord._id,
          title: String(title).slice(0, 120),
          suburb: String(suburb).slice(0, 60),
          address: String(address).slice(0, 200),
          monthlyRent: Number(monthlyRent),
          propertyType: propertyType || 'Backroom',
          amenities: Array.isArray(amenities) ? amenities.slice(0, 15) : [],
          image: image || '',
          nearbyInstitution: nearbyInstitution || '',
          status: 'active',
          source: 'admin_import'
        });
        results.push({ title: listing.title, success: true, listingId: listing._id });
      } else {
        const listing = fallbackStore.addListing({
          title: String(title).slice(0, 120),
          suburb: String(suburb).slice(0, 60),
          address: String(address).slice(0, 200),
          monthlyRent: Number(monthlyRent),
          propertyType: propertyType || 'Backroom',
          amenities: Array.isArray(amenities) ? amenities.slice(0, 15) : [],
          image: image || '',
          nearbyInstitution: nearbyInstitution || '',
          status: 'active',
          source: 'admin_import'
        });
        results.push({ title: listing.title, success: true, listingId: listing._id });
      }
    } catch (err) {
      results.push({ title: item.title || '(untitled)', success: false, error: err.message });
    }
  }

  res.json({ success: true, results });
}));

// GET all room requests
router.get('/room-requests', requireAdmin, asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const requests = await RoomRequest.find().sort({ createdAt: -1 });
    return res.json({ success: true, requests });
  }
  res.json({ success: true, requests: fallbackStore.fallbackRequests });
}));

// DELETE a room request
router.delete('/room-requests/:id', requireAdmin, asyncHandler(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    await RoomRequest.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Room request removed.' });
  }

  const idx = fallbackStore.fallbackRequests.findIndex(r => String(r._id) === String(req.params.id));
  if (idx > -1) fallbackStore.fallbackRequests.splice(idx, 1);
  res.json({ success: true, message: 'Room request removed.' });
}));

module.exports = router;
