const BaseRepository = require('./BaseRepository');
const User = require('../models/User');
const Landlord = require('../models/Landlord');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByEmailWithPassword(email) {
    return this.model.findOne({ email: email.toLowerCase(), isDeleted: { $ne: true } }).select('+password');
  }

  async findByPhone(phone) {
    return this.model.findOne({ phone, isDeleted: { $ne: true } });
  }

  async findLandlordByPhone(phone) {
    return Landlord.findOne({ phone, isDeleted: { $ne: true } });
  }

  async createLandlord(data) {
    const landlord = new Landlord(data);
    return landlord.save();
  }

  async updateLandlord(id, data) {
    return Landlord.findByIdAndUpdate(id, data, { new: true });
  }

  async findAllLandlords(filter = {}, sort = { createdAt: -1 }) {
    return Landlord.find({ isDeleted: { $ne: true }, ...filter }).sort(sort);
  }
}

module.exports = new UserRepository();
