const mongoose = require('mongoose');

const TRIAL_DAYS = 90; // 3 months free trial

const landlordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: 100
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      index: true
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true
    },
    hasWhatsapp: {
      type: Boolean,
      default: true
    },
    showPhonePublicly: {
      type: Boolean,
      default: false
    },
    consentPhonePublic: {
      type: Boolean,
      default: false
    },
    consentTimestamp: {
      type: Date,
      default: null
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    },
    isPaidSubscriber: {
      type: Boolean,
      default: false,
      index: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
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

landlordSchema.methods.isWithinFreeAccess = function () {
  return this.isPaidSubscriber || (this.trialEndsAt && this.trialEndsAt > new Date());
};

module.exports = mongoose.model('Landlord', landlordSchema);
