const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    actorId: {
      type: String,
      default: null,
      index: true
    },
    actorEmail: {
      type: String,
      default: null,
      index: true
    },
    actorRole: {
      type: String,
      default: 'ADMIN',
      index: true
    },
    userRole: {
      type: String,
      default: 'ADMIN'
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    resource: {
      type: String,
      default: 'Listing',
      index: true
    },
    entityType: {
      type: String,
      default: 'Listing',
      index: true
    },
    resourceId: {
      type: String,
      default: null,
      index: true
    },
    entityId: {
      type: String,
      default: null,
      index: true
    },
    previousStatus: {
      type: String,
      default: null
    },
    newStatus: {
      type: String,
      default: null
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    failureReason: {
      type: String,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE', 'WARNING', 'FAILED'],
      default: 'SUCCESS'
    },
    result: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'WARNING'],
      default: 'SUCCESS',
      index: true
    }
  },
  {
    timestamps: true
  }
);

auditLogSchema.pre('save', function (next) {
  if (!this.entityType && this.resource) this.entityType = this.resource;
  if (!this.resource && this.entityType) this.resource = this.entityType;
  if (!this.entityId && this.resourceId) this.entityId = this.resourceId;
  if (!this.resourceId && this.entityId) this.resourceId = this.entityId;
  if (!this.actorRole && this.userRole) this.actorRole = this.userRole;
  if (!this.userRole && this.actorRole) this.userRole = this.actorRole;
  if (!this.result) {
    this.result = this.status === 'FAILURE' || this.status === 'FAILED' ? 'FAILED' : 'SUCCESS';
  }
  if (!this.status) {
    this.status = this.result === 'FAILED' ? 'FAILURE' : 'SUCCESS';
  }
  next();
});

auditLogSchema.index({ createdAt: -1, action: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actorEmail: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
