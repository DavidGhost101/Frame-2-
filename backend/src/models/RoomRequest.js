const mongoose = require('mongoose');

const roomRequestSchema = new mongoose.Schema(
  {
    seekerName: {
      type: String,
      required: [true, 'Seeker name is required'],
      trim: true,
      maxlength: 200
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true
    },
    hasWhatsapp: {
      type: Boolean,
      default: true
    },
    suburb: {
      type: String,
      required: [true, 'Suburb is required'],
      trim: true,
      maxlength: 200,
      index: true
    },
    maxBudget: {
      type: Number,
      required: [true, 'Maximum budget is required'],
      min: 300,
      max: 50000,
      index: true
    },
    roomType: {
      type: String,
      enum: ['Any', 'Backroom', 'Ensuite', 'Garage', 'Flatlet', 'Student Accommodation', 'Apartment'],
      default: 'Any',
      index: true
    },
    occupation: {
      type: String,
      enum: ['Working Professional', 'Student', 'Couple', 'Single Person', 'Other'],
      default: 'Single Person'
    },
    moveInDate: {
      type: String,
      default: 'Immediate',
      trim: true,
      maxlength: 150
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },
    amenitiesWanted: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['active', 'found', 'hidden', 'archived'],
      default: 'active',
      index: true
    },
    contactCount: {
      type: Number,
      default: 0
    },
    isVerified: {
      type: Boolean,
      default: true
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

roomRequestSchema.index({ status: 1, suburb: 1, maxBudget: 1 });
roomRequestSchema.index({ seekerName: 'text', suburb: 'text', notes: 'text' });

module.exports = mongoose.model('RoomRequest', roomRequestSchema);
