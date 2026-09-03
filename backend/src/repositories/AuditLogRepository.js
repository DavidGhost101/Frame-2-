const BaseRepository = require('./BaseRepository');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const fallbackStore = require('../../../services/fallbackStore');

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog);
  }

  async logAction({
    userId,
    actorId,
    actorEmail,
    actorRole,
    userRole,
    action,
    resource,
    entityType,
    resourceId,
    entityId,
    previousStatus,
    newStatus,
    changes,
    failureReason,
    ipAddress,
    userAgent,
    details,
    metadata,
    previousValue,
    newValue,
    status = 'SUCCESS',
    result
  }) {
    let validUserId = null;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      validUserId = userId;
    }

    const calculatedResult = result || (status === 'FAILURE' || status === 'FAILED' ? 'FAILED' : 'SUCCESS');
    const calculatedStatus = status || (calculatedResult === 'FAILED' ? 'FAILURE' : 'SUCCESS');

    const logData = {
      userId: validUserId,
      actorId: actorId ? String(actorId) : (validUserId ? String(validUserId) : null),
      actorEmail: actorEmail || (details && details.actorEmail) || (details && details.email) || null,
      actorRole: actorRole || userRole || 'ADMIN',
      userRole: userRole || actorRole || 'ADMIN',
      action: action || 'ADMIN_ACTION',
      resource: resource || entityType || 'Listing',
      entityType: entityType || resource || 'Listing',
      resourceId: resourceId ? String(resourceId) : (entityId ? String(entityId) : null),
      entityId: entityId ? String(entityId) : (resourceId ? String(resourceId) : null),
      previousStatus: previousStatus || null,
      newStatus: newStatus || null,
      changes: changes || (previousValue || newValue ? { previous: previousValue, next: newValue } : null),
      failureReason: failureReason || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      details: details || {},
      metadata: metadata || {},
      previousValue: previousValue || null,
      newValue: newValue || null,
      status: calculatedStatus,
      result: calculatedResult
    };

    try {
      const log = new this.model(logData);
      const saved = await log.save();
      // Also cache in fallbackStore for instant dashboard inspection
      if (fallbackStore.addAuditLog) {
        fallbackStore.addAuditLog({ ...logData, _id: String(saved._id), createdAt: saved.createdAt });
      }
      return saved;
    } catch (err) {
      console.warn('Audit log write notice:', err.message);
      if (fallbackStore.addAuditLog) {
        return fallbackStore.addAuditLog(logData);
      }
      return null;
    }
  }

  async findRecent(limit = 100, filter = {}, pagination = {}) {
    try {
      const { skip = 0, sort = { createdAt: -1 } } = pagination;
      const logs = await this.model
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email role');
      const total = await this.model.countDocuments(filter).catch(() => (logs ? logs.length : 0));
      if (logs && logs.length > 0) {
        return { items: logs, total };
      }
      const fb = fallbackStore.fallbackAuditLogs || [];
      return { items: fb.slice(skip, skip + limit), total: fb.length };
    } catch (err) {
      console.warn('Audit log find notice:', err.message);
      const fb = fallbackStore.fallbackAuditLogs || [];
      return { items: fb, total: fb.length };
    }
  }

  async getAuditStats() {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        totalLogs,
        todayLogins,
        failedLogins,
        approvedListings,
        rejectedListings,
        modifiedListings,
        suspendedListings
      ] = await Promise.all([
        this.model.countDocuments(),
        this.model.countDocuments({
          action: { $in: ['LOGIN', 'ADMIN_LOGIN'] },
          createdAt: { $gte: todayStart }
        }),
        this.model.countDocuments({
          action: { $in: ['LOGIN', 'ADMIN_LOGIN'] },
          result: 'FAILED'
        }),
        this.model.countDocuments({
          action: { $in: ['LISTING_APPROVED', 'ADMIN_MODERATE_LISTING_APPROVE', 'MODERATE_LISTING_APPROVE'] }
        }),
        this.model.countDocuments({
          action: { $in: ['LISTING_REJECTED', 'ADMIN_MODERATE_LISTING_REJECT', 'MODERATE_LISTING_REJECT'] }
        }),
        this.model.countDocuments({
          action: { $in: ['LISTING_EDITED', 'ADMIN_UPDATE_LISTING'] }
        }),
        this.model.countDocuments({
          action: { $in: ['LISTING_SUSPENDED', 'ADMIN_MODERATE_LISTING_SUSPEND', 'MODERATE_LISTING_SUSPEND'] }
        })
      ]);

      return {
        totalLogs,
        todayLogins,
        failedLogins,
        approvedListings,
        rejectedListings,
        modifiedListings,
        suspendedListings
      };
    } catch (err) {
      console.warn('Audit stats notice:', err.message);
      const fb = fallbackStore.fallbackAuditLogs || [];
      return {
        totalLogs: fb.length,
        todayLogins: fb.filter(l => l.action.includes('LOGIN')).length,
        failedLogins: fb.filter(l => l.result === 'FAILED' || l.status === 'FAILURE').length,
        approvedListings: fb.filter(l => l.action.includes('APPROVE')).length,
        rejectedListings: fb.filter(l => l.action.includes('REJECT')).length,
        modifiedListings: fb.filter(l => l.action.includes('EDIT')).length,
        suspendedListings: fb.filter(l => l.action.includes('SUSPEND')).length
      };
    }
  }
}

module.exports = new AuditLogRepository();

