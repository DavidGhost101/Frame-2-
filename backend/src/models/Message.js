const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    listingId: {
      type: String,
      required: true,
      index: true
    },
    landlordId: {
      type: String,
      default: ''
    },
    tenantId: {
      type: String,
      required: true,
      index: true
    },
    sender: {
      type: String,
      enum: ['tenant', 'landlord', 'system'],
      default: 'tenant'
    },
    senderName: {
      type: String,
      default: 'Tenant'
    },
    senderPhone: {
      type: String,
      default: ''
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

messageSchema.index({ listingId: 1, tenantId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
