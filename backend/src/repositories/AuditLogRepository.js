const BaseRepository = require('./BaseRepository');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const fallbackStore = require('../../../services/fallbackStore');
const appEvents = require('../events/eventEmitter');

// Sensitive keys that must NEVER appear anywhere in audit logs
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'adminkey',
  'token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'cookie',
  'adminsession',
  'jwt',
  'apikey',
  'key'
]);

/**
 * Recursively scrub sensitive keys and credentials from details/metadata
 */
function scrubSensitiveData(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => scrubSensitiveData(item, depth + 1));
  }
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      clean[key] = scrubSensitiveData(val, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Deduce standard category from action and resource
 */
function deduceCategory(action = '', resource = '') {
  const upperAction = String(action || '').toUpperCase();
  const upperResource = String(resource || '').toUpperCase();

  if (upperAction.startsWith('AI_') || upperResource.includes('AI')) {
    return 'AI';
  }
  if (
    upperAction.startsWith('ROOM_REQUEST_') ||
    upperAction.startsWith('REQUEST_') ||
    upperResource === 'ROOMREQUEST' ||
    upperResource === 'REQUEST'
  ) {
    return 'REQUEST';
  }
  if (
    upperAction.startsWith('ROOM_') ||
    upperAction.startsWith('LISTING_') ||
    upperResource === 'LISTING' ||
    upperResource === 'ROOM'
  ) {
    return 'ROOM';
  }
  if (
    upperAction.includes('AUTH') ||
    upperAction.includes('LOGIN') ||
    upperAction.includes('LOGOUT') ||
    upperAction.includes('BLOCK') ||
    upperAction.includes('CSRF') ||
    upperAction.includes('SECURITY') ||
    upperAction.includes('RATE_LIMIT')
  ) {
    return 'SECURITY';
  }
  if (
    upperAction.startsWith('USER_') ||
    upperAction.startsWith('ROLE_') ||
    upperAction.startsWith('LANDLORD_') ||
    upperResource === 'USER' ||
    upperResource === 'LANDLORD'
  ) {
    return 'USER';
  }
  return 'SYSTEM';
}

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
    category,
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
    details = {},
    metadata = {},
    previousValue,
    newValue,
    status = 'SUCCESS',
    result,
    requestId = null
  }) {
    let validUserId = null;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      validUserId = userId;
    }

    const calculatedResult = result || (status === 'FAILURE' || status === 'FAILED' ? 'FAILED' : 'SUCCESS');
    const calculatedStatus = status || (calculatedResult === 'FAILED' ? 'FAILURE' : 'SUCCESS');
    const computedCategory = category || deduceCategory(action, resource || entityType);

    // Scrub all sensitive data
    const safeDetails = scrubSensitiveData(details);
    const safeMetadata = scrubSensitiveData(metadata);
    const safeChanges = changes ? scrubSensitiveData(changes) : (previousValue || newValue ? scrubSensitiveData({ previous: previousValue, next: newValue }) : null);

    const logData = {
      userId: validUserId,
      actorId: actorId ? String(actorId) : (validUserId ? String(validUserId) : null),
      actorEmail: actorEmail || (details && (details.actorEmail || details.email)) || null,
      actorRole: actorRole || userRole || 'ADMIN',
      userRole: userRole || actorRole || 'ADMIN',
      action: action || 'ADMIN_ACTION',
      category: computedCategory,
      resource: resource || entityType || 'Listing',
      entityType: entityType || resource || 'Listing',
      resourceId: resourceId ? String(resourceId) : (entityId ? String(entityId) : null),
      entityId: entityId ? String(entityId) : (resourceId ? String(resourceId) : null),
      previousStatus: previousStatus || null,
      newStatus: newStatus || null,
      changes: safeChanges,
      failureReason: failureReason || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      details: safeDetails,
      metadata: safeMetadata,
      previousValue: previousValue ? scrubSensitiveData(previousValue) : null,
      newValue: newValue ? scrubSensitiveData(newValue) : null,
      status: calculatedStatus,
      result: calculatedResult,
      requestId: requestId || (details && details.requestId) || null,
      createdAt: new Date()
    };

    let saved = null;
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const log = new this.model(logData);
        saved = await log.save();
        if (fallbackStore.addAuditLog) {
          fallbackStore.addAuditLog({ ...logData, _id: String(saved._id), createdAt: saved.createdAt });
        }
      } else if (fallbackStore.addAuditLog) {
        saved = fallbackStore.addAuditLog(logData);
      }
    } catch (err) {
      if (fallbackStore.addAuditLog) {
        saved = fallbackStore.addAuditLog(logData);
      }
    }

    // Broadcast in real-time to active admin listeners
    try {
      const broadcastPayload = saved ? (saved.toObject ? saved.toObject() : saved) : logData;
      appEvents.emit('audit:created', broadcastPayload);
    } catch (_) {}

    return saved;
  }

  async findRecent(limitOrOptions = 100, filterArg = {}, paginationArg = {}) {
    let limit = 100;
    let page = 1;
    let filter = {};
    let skip = 0;
    let sort = { createdAt: -1 };
    let search = null;

    if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
      limit = Math.min(200, Math.max(1, Number(limitOrOptions.limit) || 50));
      page = Math.max(1, Number(limitOrOptions.page) || 1);
      skip = (page - 1) * limit;

      if (limitOrOptions.action && limitOrOptions.action !== 'all') {
        filter.action = limitOrOptions.action;
      }
      if (limitOrOptions.actorEmail) {
        filter.actorEmail = limitOrOptions.actorEmail;
      }
      if (limitOrOptions.category && limitOrOptions.category !== 'all') {
        filter.category = limitOrOptions.category.toUpperCase();
      }
      if (limitOrOptions.entityType && limitOrOptions.entityType !== 'all') {
        filter.entityType = limitOrOptions.entityType;
      }
      if (limitOrOptions.resource && limitOrOptions.resource !== 'all') {
        filter.resource = limitOrOptions.resource;
      }
      if (limitOrOptions.result && limitOrOptions.result !== 'all') {
        filter.result = limitOrOptions.result.toUpperCase();
      }
      if (limitOrOptions.status && limitOrOptions.status !== 'all') {
        filter.status = limitOrOptions.status.toUpperCase();
      }
      if (limitOrOptions.search && typeof limitOrOptions.search === 'string' && limitOrOptions.search.trim()) {
        search = limitOrOptions.search.trim().toLowerCase();
      }
    } else {
      limit = Number(limitOrOptions) || 100;
      filter = filterArg || {};
      skip = paginationArg.skip || 0;
      sort = paginationArg.sort || { createdAt: -1 };
    }

    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const mongoFilter = { ...filter };
        if (search) {
          mongoFilter.$or = [
            { action: { $regex: search, $options: 'i' } },
            { actorEmail: { $regex: search, $options: 'i' } },
            { resource: { $regex: search, $options: 'i' } },
            { resourceId: { $regex: search, $options: 'i' } },
            { requestId: { $regex: search, $options: 'i' } },
            { failureReason: { $regex: search, $options: 'i' } }
          ];
        }

        const logs = await this.model
          .find(mongoFilter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('userId', 'fullName email role');
        const total = await this.model.countDocuments(mongoFilter).catch(() => (logs ? logs.length : 0));
        const totalPages = Math.ceil(total / limit) || 1;

        return {
          items: logs,
          logs,
          total,
          page,
          limit,
          totalPages
        };
      }

      let fb = [...(fallbackStore.fallbackAuditLogs || [])];
      if (filter.action) fb = fb.filter(l => l.action === filter.action);
      if (filter.actorEmail) fb = fb.filter(l => l.actorEmail === filter.actorEmail);
      if (filter.category) fb = fb.filter(l => (l.category || deduceCategory(l.action, l.resource)) === filter.category);
      if (filter.entityType) fb = fb.filter(l => (l.entityType || l.resource) === filter.entityType);
      if (filter.result) fb = fb.filter(l => (l.result || l.status) === filter.result);
      if (filter.status) fb = fb.filter(l => (l.status || l.result) === filter.status);

      if (search) {
        fb = fb.filter(l => {
          const matchStr = `${l.action || ''} ${l.actorEmail || ''} ${l.resource || ''} ${l.resourceId || ''} ${l.requestId || ''} ${l.failureReason || ''}`.toLowerCase();
          return matchStr.includes(search);
        });
      }

      fb.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const total = fb.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const sliced = fb.slice(skip, skip + limit);

      return {
        items: sliced,
        logs: sliced,
        total,
        page,
        limit,
        totalPages
      };
    } catch (err) {
      console.warn('Audit log find notice:', err.message);
      let fb = [...(fallbackStore.fallbackAuditLogs || [])];
      fb.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const total = fb.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const sliced = fb.slice(skip, skip + limit);
      return {
        items: sliced,
        logs: sliced,
        total,
        page,
        limit,
        totalPages
      };
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
          suspendedListings,
          aiQueries
        ] = await Promise.all([
          this.model.countDocuments(),
          this.model.countDocuments({
            action: { $in: ['LOGIN', 'ADMIN_LOGIN', 'USER_LOGIN'] },
            createdAt: { $gte: todayStart }
          }),
          this.model.countDocuments({
            $or: [
              { status: { $in: ['FAILURE', 'FAILED'] } },
              { result: 'FAILED' }
            ]
          }),
          this.model.countDocuments({
            action: { $in: ['LISTING_APPROVED', 'ROOM_APPROVED', 'ADMIN_MODERATE_LISTING_APPROVE', 'MODERATE_LISTING_APPROVE'] }
          }),
          this.model.countDocuments({
            action: { $in: ['LISTING_REJECTED', 'ROOM_REJECTED', 'ADMIN_MODERATE_LISTING_REJECT', 'MODERATE_LISTING_REJECT'] }
          }),
          this.model.countDocuments({
            action: { $in: ['LISTING_EDITED', 'ROOM_UPDATED', 'ADMIN_UPDATE_LISTING'] }
          }),
          this.model.countDocuments({
            action: { $in: ['LISTING_SUSPENDED', 'ROOM_SUSPENDED', 'ADMIN_MODERATE_LISTING_SUSPEND', 'MODERATE_LISTING_SUSPEND'] }
          }),
          this.model.countDocuments({
            action: { $in: ['AI_ADVISOR_QUERY', 'AI_TOOL_EXECUTED'] }
          })
        ]);

        return {
          totalLogs,
          todayLogins,
          successfulLogins: Math.max(0, todayLogins - failedLogins),
          failedLogins,
          listingApprovals: approvedListings,
          approvedListings,
          listingRejections: rejectedListings,
          rejectedListings,
          modifiedListings,
          suspendedListings,
          aiQueries,
          totalAdminActions: approvedListings + rejectedListings + modifiedListings + suspendedListings
        };
      }
      throw new Error('Database not connected, using fallbackStore for audit stats');
    } catch (err) {
      const fb = fallbackStore.fallbackAuditLogs || [];
      const approvedCount = fb.filter(l => String(l.action).includes('APPROVE')).length;
      const rejectedCount = fb.filter(l => String(l.action).includes('REJECT')).length;
      const modifiedCount = fb.filter(l => String(l.action).includes('EDIT') || String(l.action).includes('UPDATE')).length;
      const suspendedCount = fb.filter(l => String(l.action).includes('SUSPEND')).length;
      const failedCount = fb.filter(l => l.result === 'FAILED' || l.status === 'FAILURE').length;
      const loginCount = fb.filter(l => String(l.action).includes('LOGIN')).length;
      const aiCount = fb.filter(l => String(l.action).includes('AI_')).length;

      return {
        totalLogs: fb.length,
        todayLogins: loginCount,
        successfulLogins: Math.max(0, loginCount - failedCount),
        failedLogins: failedCount,
        listingApprovals: approvedCount,
        approvedListings: approvedCount,
        listingRejections: rejectedCount,
        rejectedListings: rejectedCount,
        modifiedListings: modifiedCount,
        suspendedListings: suspendedCount,
        aiQueries: aiCount,
        totalAdminActions: approvedCount + rejectedCount + modifiedCount + suspendedCount
      };
    }
  }
}

module.exports = new AuditLogRepository();
