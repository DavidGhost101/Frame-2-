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
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const log = new this.model(logData);
        const saved = await log.save();
        if (fallbackStore.addAuditLog) {
          fallbackStore.addAuditLog({ ...logData, _id: String(saved._id), createdAt: saved.createdAt });
        }
        return saved;
      } else if (fallbackStore.addAuditLog) {
        return fallbackStore.addAuditLog(logData);
      }
    } catch (err) {
      if (fallbackStore.addAuditLog) {
        return fallbackStore.addAuditLog(logData);
      }
      return null;
    }
  }

  async findRecent(limitOrOptions = 100, filterArg = {}, paginationArg = {}) {
    let limit = 100;
    let filter = {};
    let skip = 0;
    let sort = { createdAt: -1 };

    if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
      limit = Number(limitOrOptions.limit) || 100;
      const page = Math.max(1, Number(limitOrOptions.page) || 1);
      skip = (page - 1) * limit;
      if (limitOrOptions.action) filter.action = limitOrOptions.action;
      if (limitOrOptions.actorEmail) filter.actorEmail = limitOrOptions.actorEmail;
      if (limitOrOptions.entityType) filter.entityType = limitOrOptions.entityType;
      if (limitOrOptions.result) filter.result = limitOrOptions.result;
    } else {
      limit = Number(limitOrOptions) || 100;
      filter = filterArg || {};
      skip = paginationArg.skip || 0;
      sort = paginationArg.sort || { createdAt: -1 };
    }

    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const logs = await this.model
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('userId', 'fullName email role');
        const total = await this.model.countDocuments(filter).catch(() => (logs ? logs.length : 0));
        if (logs && logs.length > 0) {
          return { items: logs, logs, total };
        }
      }
      let fb = [...(fallbackStore.fallbackAuditLogs || [])];
      if (filter.action) fb = fb.filter(l => l.action === filter.action);
      if (filter.actorEmail) fb = fb.filter(l => l.actorEmail === filter.actorEmail);
      if (filter.entityType) fb = fb.filter(l => l.entityType === filter.entityType);
      if (filter.result) fb = fb.filter(l => l.result === filter.result);
      fb.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const sliced = fb.slice(skip, skip + limit);
      return { items: sliced, logs: sliced, total: fb.length };
    } catch (err) {
      console.warn('Audit log find notice:', err.message);
      let fb = [...(fallbackStore.fallbackAuditLogs || [])];
      fb.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const sliced = fb.slice(skip, skip + limit);
      return { items: sliced, logs: sliced, total: fb.length };
    }
  }

  async getAuditStats() {
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
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
          listingApprovals: approvedListings,
          approvedListings,
          listingRejections: rejectedListings,
          rejectedListings,
          modifiedListings,
          suspendedListings,
          totalAdminActions: approvedListings + rejectedListings + modifiedListings + suspendedListings
        };
      }
      throw new Error('Database not connected, using fallbackStore for audit stats');
    } catch (err) {
      console.warn('Audit stats notice:', err.message);
      const fb = fallbackStore.fallbackAuditLogs || [];
      const approvedCount = fb.filter(l => String(l.action).includes('APPROVE')).length;
      const rejectedCount = fb.filter(l => String(l.action).includes('REJECT')).length;
      const modifiedCount = fb.filter(l => String(l.action).includes('EDIT') || String(l.action).includes('UPDATE')).length;
      const suspendedCount = fb.filter(l => String(l.action).includes('SUSPEND')).length;

      return {
        totalLogs: fb.length,
        todayLogins: fb.filter(l => String(l.action).includes('LOGIN')).length,
        failedLogins: fb.filter(l => l.result === 'FAILED' || l.status === 'FAILURE').length,
        listingApprovals: approvedCount,
        approvedListings: approvedCount,
        listingRejections: rejectedCount,
        rejectedListings: rejectedCount,
        modifiedListings: modifiedCount,
        suspendedListings: suspendedCount,
        totalAdminActions: approvedCount + rejectedCount + modifiedCount + suspendedCount
      };
    }
  }
}

module.exports = new AuditLogRepository();

