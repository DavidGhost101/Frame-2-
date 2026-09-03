const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP', 'PUSH'],
      required: true,
      index: true
    },
    recipient: {
      type: String,
      required: true,
      index: true
    },
    template: {
      type: String,
      default: 'GENERAL'
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED', 'DELIVERED'],
      default: 'PENDING',
      index: true
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    errorMessage: {
      type: String,
      default: null
    },
    retryCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

notificationLogSchema.index({ createdAt: -1, status: 1 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
