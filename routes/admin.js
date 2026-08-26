const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { requireAdmin } = require('../middleware/auth');
const Listing = require('../models/Listing');
const Landlord = require('../models/Landlord');

// Wraps an async route handler so a rejected promise (DB timeout, bad query,
// etc.) is turned into a clean JSON 500 instead of an unhandled rejection
// that can crash the whole process.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error('admin route error:', err.message);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
}

// Slows down brute-force guessing of the admin key.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// LOGIN: exchange the admin key for a session cookie, so you don't have to
// paste the key into every request from the dashboard.
router.post('/login', adminLoginLimiter, (req, res) => {
  const { adminKey } = req.body;
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: 'Admin access is not configured on this server.' });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
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

  res.json({
    success: true,
    stats: {
      listings: { total, active, pending, rejected, flagged },
      landlords: { total: landlordCount, verified: verifiedLandlords, paid: paidLandlords },
      totalContactClicks: contactAgg[0]?.total || 0
    }
  });
}));

// ALL LISTINGS, any status, with landlord info attached — full visibility.
// ?flagged=true shows only listings flagged for scam review.
router.get('/listings', requireAdmin, asyncHandler(async (req, res) => {
  const { status, flagged } = req.query;
  const query = {};
  if (status && status !== 'All') query.status = status;
  if (flagged === 'true') query.flagged = true;

  const listings = await Listing.find(query).sort({ createdAt: -1 }).populate('landlordId', 'fullName phone isBlocked');
  res.json({ success: true, listings });
}));

// EDIT any field on any listing
router.patch('/listings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const allowedFields = ['title', 'suburb', 'address', 'monthlyRent', 'propertyType', 'amenities', 'image', 'nearbyInstitution', 'status', 'flagged'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.status && !['pending_review', 'active', 'rejected'].includes(updates.status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }
  // Clearing the flag also clears the reasons/report count, since it's a
  // conscious admin decision that the listing is fine.
  if (updates.flagged === false) {
    updates.flagReasons = [];
    updates.reportCount = 0;
  }

  const listing = await Listing.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  res.json({ success: true, listing });
}));

// DELETE a listing outright
router.delete('/listings/:id', requireAdmin, asyncHandler(async (req, res) => {
  const listing = await Listing.findByIdAndDelete(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  res.json({ success: true });
}));

// ALL LANDLORDS with their listing counts
router.get('/landlords', requireAdmin, asyncHandler(async (req, res) => {
  const landlords = await Landlord.find({}).sort({ createdAt: -1 }).lean();
  const counts = await Listing.aggregate([{ $group: { _id: '$landlordId', count: { $sum: 1 } } }]);
  const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
  const enriched = landlords.map(l => ({ ...l, listingCount: countMap[String(l._id)] || 0 }));
  res.json({ success: true, landlords: enriched });
}));

// BLOCK / UNBLOCK a landlord (blocked landlords can't create new listings)
router.patch('/landlords/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { isBlocked, isPaidSubscriber } = req.body;
  const updates = {};
  if (typeof isBlocked === 'boolean') updates.isBlocked = isBlocked;
  if (typeof isPaidSubscriber === 'boolean') updates.isPaidSubscriber = isPaidSubscriber;
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'isBlocked or isPaidSubscriber (boolean) is required.' });
  }
  const landlord = await Landlord.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!landlord) return res.status(404).json({ error: 'Landlord not found.' });
  res.json({ success: true, landlord });
}));

// BULK IMPORT: manually curated listings (e.g. copied from a Facebook group
// post you reviewed yourself) — never automated scraping. Each entry needs
// landlordFullName + landlordPhone (a Landlord record is created/reused,
// unverified, so it's visibly distinct from a landlord who verified via
// OTP) plus the usual listing fields. Imported listings go live immediately
// since an admin already reviewed them.
router.post('/listings/import', requireAdmin, asyncHandler(async (req, res) => {
  const { listings } = req.body;
  if (!Array.isArray(listings) || listings.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty "listings" array.' });
  }
  if (listings.length > 50) {
    return res.status(400).json({ error: 'Import at most 50 listings at a time.' });
  }

  const results = [];
  for (const item of listings) {
    try {
      const { title, suburb, address, monthlyRent, propertyType, amenities, image, nearbyInstitution, landlordFullName, landlordPhone } = item;
      if (!title || !suburb || !address || !monthlyRent || !landlordFullName || !landlordPhone) {
        results.push({ title: title || '(untitled)', success: false, error: 'Missing required field.' });
        continue;
      }

      let landlord = await Landlord.findOne({ phone: landlordPhone });
      if (!landlord) {
        landlord = await Landlord.create({
          fullName: landlordFullName,
          phone: landlordPhone,
          isPhoneVerified: false // imported, not OTP-verified — shown as such in the dashboard
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
    } catch (err) {
      results.push({ title: item.title || '(untitled)', success: false, error: err.message });
    }
  }

  res.json({ success: true, results });
}));

module.exports = router;
