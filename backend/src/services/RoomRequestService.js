const roomRequestRepository = require('../repositories/RoomRequestRepository');
const fallbackStore = require('../../../services/fallbackStore');
const mongoose = require('mongoose');
const appEvents = require('../events/eventEmitter');

// Duplicate submission window cache (prevents duplicate room requests within 30 seconds)
const recentRequestSubmissions = new Map();

setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [key, val] of recentRequestSubmissions.entries()) {
    if (val.timestamp < cutoff) recentRequestSubmissions.delete(key);
  }
}, 60000).unref();

class RoomRequestService {
  /**
   * Search and filter room seeker requests
   */
  async getRoomRequests(queryParams = {}) {
    try {
      const {
        suburb,
        roomType,
        maxBudget,
        keyword,
        status = 'active',
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        order = 'desc'
      } = queryParams;

      const filter = {};

      if (status && status !== 'all') {
        filter.status = status;
      }

      if (suburb && suburb !== 'all') {
        filter.suburb = new RegExp(`^${suburb}$`, 'i');
      }

      if (roomType && roomType !== 'all' && roomType !== 'Any') {
        filter.roomType = roomType;
      }

      if (maxBudget) {
        filter.maxBudget = { $lte: Number(maxBudget) };
      }

      if (keyword) {
        filter.$or = [
          { seekerName: new RegExp(keyword, 'i') },
          { suburb: new RegExp(keyword, 'i') },
          { notes: new RegExp(keyword, 'i') },
          { occupation: new RegExp(keyword, 'i') }
        ];
      }

      const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
      const sortOrder = order === 'asc' ? 1 : -1;
      const pagination = {
        skip,
        limit: Math.min(100, Number(limit)),
        sort: { [sortBy]: sortOrder }
      };

      let items = [];
      let total = 0;
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
          const res = await roomRequestRepository.findPaginated(filter, pagination);
          items = res.items || [];
          total = res.total || 0;
        } catch (_) {}
      }

      if (total === 0 && fallbackStore && fallbackStore.fallbackRequests) {
        let fbItems = fallbackStore.fallbackRequests.filter(r => !r.isDeleted && r.status !== 'archived');
        if (status && status !== 'all') {
          fbItems = fbItems.filter(r => r.status === status);
        }
        if (suburb && suburb !== 'all') {
          fbItems = fbItems.filter(r => (r.suburb || '').toLowerCase() === suburb.toLowerCase());
        }
        if (keyword) {
          const kw = keyword.toLowerCase();
          fbItems = fbItems.filter(r =>
            (r.seekerName && r.seekerName.toLowerCase().includes(kw)) ||
            (r.suburb && r.suburb.toLowerCase().includes(kw)) ||
            (r.notes && r.notes.toLowerCase().includes(kw))
          );
        }
        return {
          items: fbItems.slice(skip, skip + Number(limit)),
          total: fbItems.length,
          page: Number(page),
          limit: Number(limit)
        };
      }

      return { items, total, page: Number(page), limit: Number(limit) };
    } catch (err) {
      console.warn('RoomRequestService query fallback:', err.message);
      let fbItems = (fallbackStore.fallbackRequests || []).filter(r => !r.isDeleted && r.status !== 'archived');
      return {
        items: fbItems,
        total: fbItems.length,
        page: 1,
        limit: 20
      };
    }
  }

  /**
   * Create a new room request
   */
  async createRoomRequest(data) {
    const formattedPhone = data.phone.startsWith('+') ? data.phone : (data.phone.startsWith('0') ? '+27' + data.phone.substring(1) : '+27' + data.phone);

    // Duplicate check
    const naturalKey = `${formattedPhone.replace(/\D/g, '')}:${(data.suburb || '').toLowerCase().trim()}:${(data.roomType || '').toLowerCase().trim()}:${Number(data.maxBudget)}`;
    const now = Date.now();
    const lastSub = recentRequestSubmissions.get(naturalKey);
    if (lastSub && (now - lastSub.timestamp < 30000)) {
      const err = new Error('A room request with these details was recently submitted. Please avoid submitting duplicates.');
      err.statusCode = 409;
      err.code = 'DUPLICATE_SUBMISSION';
      throw err;
    }
    recentRequestSubmissions.set(naturalKey, { timestamp: now });

    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (!isDbConnected && fallbackStore && fallbackStore.addRequest) {
      const fbReq = fallbackStore.addRequest({
        seekerName: data.seekerName.trim(),
        phone: formattedPhone,
        hasWhatsapp: data.hasWhatsapp !== undefined ? Boolean(data.hasWhatsapp) : true,
        suburb: data.suburb.trim(),
        maxBudget: Number(data.maxBudget),
        roomType: data.roomType || 'Any',
        occupation: data.occupation || 'Single Person',
        moveInDate: data.moveInDate || 'Immediate',
        notes: (data.notes || '').trim(),
        amenitiesWanted: Array.isArray(data.amenitiesWanted) ? data.amenitiesWanted : [],
        status: 'active',
        isVerified: true
      });
      try {
        appEvents.emit('request:created', fbReq);
      } catch (_) {}
      return fbReq;
    }

    try {
      const request = await roomRequestRepository.create({
        seekerName: data.seekerName.trim(),
        phone: formattedPhone,
        hasWhatsapp: data.hasWhatsapp !== undefined ? Boolean(data.hasWhatsapp) : true,
        suburb: data.suburb.trim(),
        maxBudget: Number(data.maxBudget),
        roomType: data.roomType || 'Any',
        occupation: data.occupation || 'Single Person',
        moveInDate: data.moveInDate || 'Immediate',
        notes: (data.notes || '').trim(),
        amenitiesWanted: Array.isArray(data.amenitiesWanted) ? data.amenitiesWanted : [],
        status: 'active',
        isVerified: true
      });

      try {
        appEvents.emit('request:created', request);
      } catch (_) {}

      return request;
    } catch (err) {
      console.warn('RoomRequestService create fallback:', err.message);
      if (fallbackStore && fallbackStore.addRequest) {
        const fbReq = fallbackStore.addRequest({
          seekerName: data.seekerName.trim(),
          phone: formattedPhone,
          hasWhatsapp: data.hasWhatsapp !== undefined ? Boolean(data.hasWhatsapp) : true,
          suburb: data.suburb.trim(),
          maxBudget: Number(data.maxBudget),
          roomType: data.roomType || 'Any',
          occupation: data.occupation || 'Single Person',
          moveInDate: data.moveInDate || 'Immediate',
          notes: (data.notes || '').trim(),
          amenitiesWanted: Array.isArray(data.amenitiesWanted) ? data.amenitiesWanted : [],
          status: 'active',
          isVerified: true
        });
        try {
          appEvents.emit('request:created', fbReq);
        } catch (_) {}
        return fbReq;
      }
      throw err;
    }
  }

  /**
   * Get single room request by ID
   */
  async getRequestById(id) {
    let req = null;
    try {
      req = await roomRequestRepository.findById(id);
    } catch (_) {}
    if (!req && fallbackStore && fallbackStore.fallbackRequests) {
      req = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
    }
    return req;
  }

  /**
   * Update room request details (resilient to both DB and fallbackStore)
   */
  async updateRoomRequest(id, updateData = {}, adminUser = null) {
    let request = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      try {
        request = await roomRequestRepository.updateById(id, updateData);
      } catch (err) {
        console.warn('DB updateRoomRequest warning:', err.message);
      }
    }

    if (fallbackStore && fallbackStore.fallbackRequests) {
      const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
      if (item) {
        Object.assign(item, updateData);
        if (typeof fallbackStore.saveStore === 'function') {
          try { fallbackStore.saveStore(); } catch (_) {}
        }
        if (!request) request = item;
      }
    }

    return request;
  }

  /**
   * Update request status (active, archived, etc.)
   */
  async updateStatus(id, status) {
    try {
      const updated = await roomRequestRepository.updateById(id, { status });
      if (updated) return updated;
    } catch (_) {}
    if (fallbackStore && fallbackStore.fallbackRequests) {
      const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
      if (item) {
        item.status = status;
        return item;
      }
    }
    return null;
  }

  /**
   * Delete room request
   */
  async deleteRoomRequest(id, adminUser = null) {
    let deleted = null;
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        deleted = await roomRequestRepository.deleteById(id);
      }
    } catch (err) {
      console.warn('DB deleteRoomRequest warning:', err.message);
    }

    if (fallbackStore && typeof fallbackStore.deleteRequest === 'function') {
      const fbDeleted = fallbackStore.deleteRequest(id);
      if (!deleted && fbDeleted) {
        deleted = fbDeleted;
      }
    }

    // Emit real-time event
    try {
      appEvents.emit('request:deleted', {
        requestId: String(id),
        timestamp: new Date().toISOString()
      });
    } catch (_) {}

    return deleted || { _id: id, isDeleted: true };
  }

  /**
   * Increment contact count
   */
  async trackContact(id) {
    try {
      const updated = await roomRequestRepository.incrementContactCount(id);
      if (updated) return updated;
    } catch (_) {}
    if (fallbackStore && fallbackStore.fallbackRequests) {
      const item = fallbackStore.fallbackRequests.find(r => String(r._id) === String(id));
      if (item) {
        item.contactCount = (item.contactCount || 0) + 1;
        return item;
      }
    }
    return null;
  }
}


module.exports = new RoomRequestService();
