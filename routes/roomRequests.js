const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const RoomRequest = require('../models/RoomRequest');
const fallbackStore = require('../services/fallbackStore');
const { parsePhoneNumber } = require('../services/otpService');

// Format phone number to clean international SA format +27...
function normalizePhoneNumber(raw) {
  try {
    return parsePhoneNumber(raw);
  } catch (e) {
    let clean = String(raw).replace(/[\s\-()]/g, '');
    if (clean.startsWith('0') && clean.length === 10) {
      return '+27' + clean.slice(1);
    }
    if (clean.startsWith('27') && clean.length === 11) {
      return '+' + clean;
    }
    return clean;
  }
}

// BROWSE active room requests
router.get('/', async (req, res) => {
  try {
    const { suburb, maxBudget, roomType, occupation, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    if (mongoose.connection.readyState === 1) {
      const query = { status: 'active' };

      if (suburb && suburb.trim() !== '' && suburb !== 'All') {
        query.suburb = new RegExp(suburb.trim(), 'i');
      }
      if (roomType && roomType !== 'All' && roomType !== 'Any') {
        query.roomType = { $in: [roomType, 'Any'] };
      }
      if (maxBudget) {
        query.maxBudget = { $gte: Number(maxBudget) };
      }
      if (occupation && occupation !== 'All') {
        query.occupation = occupation;
      }

      const [requests, total] = await Promise.all([
        RoomRequest.find(query)
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum),
        RoomRequest.countDocuments(query)
      ]);

      return res.json({
        success: true,
        count: requests.length,
        total,
        page: pageNum,
        requests
      });
    } else {
      let filtered = fallbackStore.fallbackRequests.filter(r => r.status === 'active');
      if (suburb && suburb !== 'All') {
        const regex = new RegExp(suburb.trim(), 'i');
        filtered = filtered.filter(r => regex.test(r.suburb));
      }
      if (roomType && roomType !== 'All' && roomType !== 'Any') {
        filtered = filtered.filter(r => r.roomType === roomType || r.roomType === 'Any');
      }
      if (maxBudget) {
        filtered = filtered.filter(r => r.maxBudget >= Number(maxBudget));
      }
      if (occupation && occupation !== 'All') {
        filtered = filtered.filter(r => r.occupation === occupation);
      }

      const total = filtered.length;
      const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);
      return res.json({
        success: true,
        count: paginated.length,
        total,
        page: pageNum,
        requests: paginated
      });
    }
  } catch (err) {
    console.error('browse room requests error:', err.message);
    const requests = fallbackStore.fallbackRequests.filter(r => r.status === 'active');
    res.json({
      success: true,
      count: requests.length,
      total: requests.length,
      page: 1,
      requests
    });
  }
});

// GET single room request
router.get('/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const request = await RoomRequest.findById(req.params.id);
      if (request && request.status === 'active') {
        return res.json({ success: true, request });
      }
    }
    const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(req.params.id));
    if (item && item.status === 'active') {
      return res.json({ success: true, request: item });
    }
    res.status(404).json({ error: 'Room request not found.' });
  } catch (err) {
    const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(req.params.id));
    if (item) return res.json({ success: true, request: item });
    res.status(404).json({ error: 'Room request not found.' });
  }
});

// POST a new room request
router.post('/create', async (req, res) => {
  try {
    const {
      seekerName,
      phone,
      hasWhatsapp = true,
      suburb,
      maxBudget,
      roomType = 'Any',
      occupation = 'Single Person',
      moveInDate = 'Immediate',
      notes = '',
      amenitiesWanted = []
    } = req.body;

    if (!seekerName || !seekerName.trim()) {
      return res.status(400).json({ error: 'Please provide your name.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Please provide a contact phone number.' });
    }
    if (!suburb || !suburb.trim()) {
      return res.status(400).json({ error: 'Please specify the area/suburb where you need a room.' });
    }
    if (!maxBudget || Number(maxBudget) <= 0) {
      return res.status(400).json({ error: 'Please provide your maximum monthly budget (ZAR).' });
    }

    const formattedPhone = normalizePhoneNumber(phone);

    if (mongoose.connection.readyState === 1) {
      const newRequest = await RoomRequest.create({
        seekerName: String(seekerName).trim().slice(0, 80),
        phone: formattedPhone,
        hasWhatsapp: Boolean(hasWhatsapp),
        suburb: String(suburb).trim().slice(0, 80),
        maxBudget: Number(maxBudget),
        roomType: roomType || 'Any',
        occupation: occupation || 'Single Person',
        moveInDate: String(moveInDate || 'Immediate').trim().slice(0, 60),
        notes: String(notes || '').trim().slice(0, 500),
        amenitiesWanted: Array.isArray(amenitiesWanted) ? amenitiesWanted.slice(0, 10) : [],
        status: 'active',
        isVerified: true
      });

      return res.status(201).json({
        success: true,
        message: 'Your room request has been posted! Landlords can now contact you on WhatsApp.',
        request: newRequest
      });
    } else {
      const newRequest = fallbackStore.addRequest({
        seekerName: String(seekerName).trim().slice(0, 80),
        phone: formattedPhone,
        hasWhatsapp: Boolean(hasWhatsapp),
        suburb: String(suburb).trim().slice(0, 80),
        maxBudget: Number(maxBudget),
        roomType: roomType || 'Any',
        occupation: occupation || 'Single Person',
        moveInDate: String(moveInDate || 'Immediate').trim().slice(0, 60),
        notes: String(notes || '').trim().slice(0, 500),
        amenitiesWanted: Array.isArray(amenitiesWanted) ? amenitiesWanted.slice(0, 10) : [],
        status: 'active',
        isVerified: true
      });

      return res.status(201).json({
        success: true,
        message: 'Your room request has been posted! Landlords can now contact you on WhatsApp.',
        request: newRequest
      });
    }
  } catch (err) {
    console.error('create room request error:', err.message);
    res.status(500).json({ error: 'Failed to submit room request.' });
  }
});

// CONTACT room seeker via WhatsApp or Phone
router.post('/:id/contact', async (req, res) => {
  try {
    let request = null;
    if (mongoose.connection.readyState === 1) {
      request = await RoomRequest.findById(req.params.id);
    }
    if (!request) {
      request = fallbackStore.fallbackRequests.find(r => String(r._id) === String(req.params.id));
    }
    if (!request || request.status !== 'active') {
      return res.status(404).json({ error: 'Room request not found.' });
    }

    request.contactCount = (request.contactCount || 0) + 1;
    if (request.save) await request.save();

    const { toWhatsAppNumber } = require('../backend/src/utils/phoneUtils');
    const cleanPhone = toWhatsAppNumber(request.phone) || '27821234567';

    if (request.hasWhatsapp) {

      const message = encodeURIComponent(
        `Hi ${request.seekerName}, I saw your request on Rent A Room looking for a room in ${request.suburb} (Budget R${request.maxBudget}/month). I have a room available that might suit you. Let's chat!`
      );
      return res.json({
        success: true,
        whatsappLink: `https://wa.me/${cleanPhone}?text=${message}`,
        hasWhatsapp: true,
        phone: request.phone,
        seekerName: request.seekerName
      });
    } else {
      return res.json({
        success: true,
        callLink: `tel:${request.phone}`,
        hasWhatsapp: false,
        phone: request.phone,
        seekerName: request.seekerName
      });
    }
  } catch (err) {
    console.error('contact room seeker error:', err.message);
    res.status(500).json({ error: 'Failed to generate contact link.' });
  }
});

// MARK as found / close request
router.post('/:id/found', async (req, res) => {
  try {
    let request = null;
    if (mongoose.connection.readyState === 1) {
      request = await RoomRequest.findById(req.params.id);
    }
    if (!request) {
      request = fallbackStore.fallbackRequests.find(r => String(r._id) === String(req.params.id));
    }
    if (!request) return res.status(404).json({ error: 'Room request not found.' });

    request.status = 'found';
    if (request.save) await request.save();

    res.json({ success: true, message: 'Room request marked as resolved.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

module.exports = router;
