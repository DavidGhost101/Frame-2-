const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Landlord',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: 500
    },
    suburb: {
      type: String,
      required: [true, 'Suburb is required'],
      trim: true,
      maxlength: 200,
      index: true
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: 500
    },
    monthlyRent: {
      type: Number,
      required: [true, 'Monthly rent is required'],
      min: [0, 'Monthly rent must be a positive number'],
      index: true
    },
    propertyType: {
      type: String,
      enum: ['Backroom', 'Garage', 'Flatlet', 'Ensuite', 'Student Accommodation', 'Apartment'],
      default: 'Backroom',
      index: true
    },
    nearbyInstitution: {
      type: String,
      trim: true,
      default: ''
    },
    amenities: {
      type: [String],
      default: []
    },
    image: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: [
        'draft', 'pending_review', 'approved', 'published', 'active', 'rejected', 'suspended', 'archived',
        'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ARCHIVED'
      ],
      default: 'pending_review',
      index: true
    },
    publicationStatus: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED', 'SUSPENDED', 'REJECTED', 'ARCHIVED'],
      default: 'PENDING',
      index: true
    },
    approvedBy: {
      type: String,
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    publishedAt: {
      type: Date,
      default: null
    },
    rejectedBy: {
      type: String,
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    },
    suspendedBy: {
      type: String,
      default: null
    },
    suspendedAt: {
      type: Date,
      default: null
    },
    lastModifiedBy: {
      type: String,
      default: null
    },
    lastModifiedAt: {
      type: Date,
      default: null
    },
    contactCount: {
      type: Number,
      default: 0
    },
    source: {
      type: String,
      enum: ['landlord', 'admin_import', 'system_curated'],
      default: 'landlord'
    },
    flagged: {
      type: Boolean,
      default: false,
      index: true
    },
    flagReasons: {
      type: [String],
      default: []
    },
    reportCount: {
      type: Number,
      default: 0
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

listingSchema.index({ status: 1, suburb: 1, monthlyRent: 1 });
listingSchema.index({ title: 'text', suburb: 'text', address: 'text' });

module.exports = mongoose.model('Listing', listingSchema);
