const mongoose = require('mongoose');
const BaseRepository = require('./BaseRepository');
const RoomRequest = require('../models/RoomRequest');

class RoomRequestRepository extends BaseRepository {
  constructor() {
    super(RoomRequest);
  }

  async findPaginated(filter = {}, pagination = {}) {
    const { skip = 0, limit = 20, sort = { createdAt: -1 } } = pagination;
    const queryFilter = { isDeleted: { $ne: true }, ...filter };

    const [items, total] = await Promise.all([
      this.model.find(queryFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit),
      this.model.countDocuments(queryFilter)
    ]);

    return { items, total };
  }

  async incrementContactCount(id) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findByIdAndUpdate(id, { $inc: { contactCount: 1 } }, { new: true });
    } catch (_) {
      return null;
    }
  }

  async getMetrics() {
    const mongoose = require('mongoose');
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }
    const [total, active] = await Promise.all([
      this.model.countDocuments({ isDeleted: { $ne: true } }),
      this.model.countDocuments({ isDeleted: { $ne: true }, status: 'active' })
    ]);
    return { total, active };
  }
}

module.exports = new RoomRequestRepository();
