const mongoose = require('mongoose');

const roomRequestSchema = new mongoose.Schema({
  seekerName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  hasWhatsapp: {
    type: Boolean,
    default: true
  },
  suburb: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  maxBudget: {
    type: Number,
    required: true,
    min: 300,
    max: 20000
  },
  roomType: {
    type: String,
    enum: ['Any', 'Backroom', 'Ensuite', 'Garage', 'Flatlet', 'Student Accommodation', 'Apartment'],
    default: 'Any'
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
    maxlength: 60
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  amenitiesWanted: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['active', 'found', 'hidden'],
    default: 'active'
  },
  contactCount: {
    type: Number,
    default: 0
  },
  isVerified: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('RoomRequest', roomRequestSchema);
