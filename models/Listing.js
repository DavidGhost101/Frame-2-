const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Landlord', required: true, index: true },
  title: { type: String, required: true, trim: true },
  suburb: { type: String, required: true, trim: true, index: true },
  address: { type: String, required: true, trim: true },
  monthlyRent: { type: Number, required: true, min: 0 },
  propertyType: {
    type: String,
    enum: ['Backroom', 'Garage', 'Flatlet', 'Ensuite', 'Student Accommodation', 'Apartment'],
    default: 'Backroom'
  },
  nearbyInstitution: { type: String, trim: true, default: '' },
  amenities: { type: [String], default: [] },
  image: { type: String, default: '' },
  status: { type: String, enum: ['pending_review', 'active', 'rejected'], default: 'pending_review', index: true },
  contactCount: { type: Number, default: 0 },

  // Where the listing came from: posted by a verified landlord, or manually
  // curated into the system by an admin (e.g. from a Facebook group post the
  // admin reviewed themselves — never from automated scraping).
  source: { type: String, enum: ['landlord', 'admin_import'], default: 'landlord' },

  // Scam-safety signals
  flagged: { type: Boolean, default: false, index: true },
  flagReasons: { type: [String], default: [] },
  reportCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

listingSchema.index({ status: 1, suburb: 1, monthlyRent: 1 });

module.exports = mongoose.model('Listing', listingSchema);
