const mongoose = require('mongoose');

const TRIAL_DAYS = 90; // free for 3 months from signup

const landlordSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true }, // E.164 format (+27...)
  isPhoneVerified: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },

  // Contact preferences (all opt-in, set during signup)
  hasWhatsapp: { type: Boolean, default: true },
  showPhonePublicly: { type: Boolean, default: false },
  consentPhonePublic: { type: Boolean, default: false }, // must be true if showPhonePublicly is true
  consentTimestamp: { type: Date, default: null },

  // Billing: free trial, then requires admin to mark as paid
  trialEndsAt: { type: Date, default: () => new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000) },
  isPaidSubscriber: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

landlordSchema.methods.isWithinFreeAccess = function () {
  return this.isPaidSubscriber || this.trialEndsAt > new Date();
};

module.exports = mongoose.model('Landlord', landlordSchema);
