const mongoose = require('mongoose');
const BaseRepository = require('./BaseRepository');
const Listing = require('../models/Listing');

class ListingRepository extends BaseRepository {
  constructor() {
    super(Listing);
  }

  async findWithPopulatedLandlord(filter = {}, pagination = {}, projection = null) {
    const { skip = 0, limit = 20, sort = { createdAt: -1 } } = pagination;
    const queryFilter = { isDeleted: { $ne: true }, ...filter };

    const [items, total] = await Promise.all([
      this.model.find(queryFilter, projection)
        .populate('landlordId', 'fullName phone isPhoneVerified hasWhatsapp showPhonePublicly isPaidSubscriber trialEndsAt')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      this.model.countDocuments(queryFilter)
    ]);

    return { items, total };
  }

  async findByIdWithLandlord(id) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findOne({ _id: id, isDeleted: { $ne: true } })
        .populate('landlordId', 'fullName phone isPhoneVerified hasWhatsapp showPhonePublicly isPaidSubscriber trialEndsAt');
    } catch (_) {
      return null;
    }
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

  async reportListing(id, reason) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findByIdAndUpdate(
        id,
        {
          $inc: { reportCount: 1 },
          $push: { flagReasons: reason }
        },
        { new: true }
      );
    } catch (_) {
      return null;
    }
  }


  async getMetrics() {
    const [total, active, pending, flagged] = await Promise.all([
      this.model.countDocuments({ isDeleted: { $ne: true } }),
      this.model.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
      this.model.countDocuments({ isDeleted: { $ne: true }, status: 'pending_review' }),
      this.model.countDocuments({ isDeleted: { $ne: true }, flagged: true })
    ]);
    return { total, active, pending, flagged };
  }
}

module.exports = new ListingRepository();
