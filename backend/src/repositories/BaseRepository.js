const mongoose = require('mongoose');

class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async findById(id, projection = null, options = {}) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findOne({ _id: id, isDeleted: { $ne: true } }, projection, options);
    } catch (_) {
      return null;
    }
  }

  async findOne(filter = {}, projection = null, options = {}) {
    try {
      return await this.model.findOne({ isDeleted: { $ne: true }, ...filter }, projection, options);
    } catch (_) {
      return null;
    }
  }

  async find(filter = {}, projection = null, options = {}) {
    try {
      return await this.model.find({ isDeleted: { $ne: true }, ...filter }, projection, options);
    } catch (_) {
      return [];
    }
  }

  async count(filter = {}) {
    try {
      return await this.model.countDocuments({ isDeleted: { $ne: true }, ...filter });
    } catch (_) {
      return 0;
    }
  }

  async create(data, options = {}) {
    if (Array.isArray(data)) {
      return this.model.insertMany(data, options);
    }
    const doc = new this.model(data);
    return doc.save(options);
  }

  async updateById(id, updateData, options = { new: true }) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findOneAndUpdate(
        { _id: id, isDeleted: { $ne: true } },
        updateData,
        options
      );
    } catch (_) {
      return null;
    }
  }

  async softDelete(id) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findOneAndUpdate(
        { _id: id },
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      );
    } catch (_) {
      return null;
    }
  }

  async hardDelete(id) {
    if (!id || !mongoose.isValidObjectId(id)) {
      return null;
    }
    try {
      return await this.model.findByIdAndDelete(id);
    } catch (_) {
      return null;
    }
  }
}


module.exports = BaseRepository;
