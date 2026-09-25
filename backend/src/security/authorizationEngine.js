/**
 * Centralized Authorization Engine (RBAC & ABAC)
 *
 * Enforces:
 * authenticate() -> identifyUser() -> identifyRole() -> identifyResource() -> verifyOwnership() -> checkPermission() -> execute() -> audit()
 *
 * The backend is the final authority. Frontend authorization, roles, and ownership claims are untrusted.
 */

const { ROLES, PERMISSIONS, ROLE_PERMISSIONS } = require('../config/roles');

const ACTIONS = {
  // Listing Actions
  LISTING_CREATE: 'listing:create',
  LISTING_READ: 'listing:read',
  LISTING_UPDATE: 'listing:update',
  LISTING_DELETE: 'listing:delete',
  LISTING_APPROVE: 'listing:approve',
  LISTING_REJECT: 'listing:reject',
  LISTING_SUSPEND: 'listing:suspend',

  // Seeker / Room Request Actions
  REQUEST_CREATE: 'request:create',
  REQUEST_READ: 'request:read',
  REQUEST_UPDATE_STATUS: 'request:update_status',
  REQUEST_DELETE: 'request:delete',

  // Landlord Actions
  LANDLORD_READ: 'landlord:read',
  LANDLORD_UPDATE: 'landlord:update',
  LANDLORD_BLOCK: 'landlord:block',
  LANDLORD_SET_PAID: 'landlord:set_paid',

  // User Administration
  USER_READ: 'user:read',
  USER_UPDATE_ROLE: 'user:update_role',
  USER_BLOCK: 'user:block',
  USER_DELETE: 'user:delete',

  // System & Observability
  AUDIT_LOG_READ: 'audit_log:read',
  REPORT_EXPORT: 'report:export',
  NOTIFICATION_SEND: 'notification:send',

  // AI & Tool Actions
  AI_ADVISOR_QUERY: 'ai:advisor_query',
  AI_EXECUTE_TOOL: 'ai:execute_tool',

  // File Upload
  FILE_UPLOAD: 'file:upload'
};

class AuthorizationEngine {
  /**
   * Evaluates if a subject (user/actor) is authorized to perform an action on a resource.
   *
   * @param {Object|null} user - The authenticated actor object from req.user
   * @param {string} action - One of ACTIONS.*
   * @param {Object|null} resource - Target entity (e.g. listing, landlord, request, user)
   * @param {Object} [context={}] - Optional request metadata (ip, userAgent, updates, etc.)
   * @returns {{ authorized: boolean, reason: string|null, code: string }}
   */
  can(user, action, resource = null, context = {}) {
    // 1. Check if user is blocked or suspended
    if (user && (user.isBlocked || user.status === 'BLOCKED' || user.status === 'SUSPENDED')) {
      return {
        authorized: false,
        reason: 'Account is blocked or suspended by administration.',
        code: 'ACCOUNT_BLOCKED'
      };
    }

    const role = (user && (user.role || (user.admin ? ROLES.ADMIN : null))) || 'ANONYMOUS';
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isAdmin = isSuperAdmin || role === ROLES.ADMIN;
    const isManager = isAdmin || role === ROLES.MANAGER;

    // Super Admin and Admin bypass resource-level ownership for moderation purposes
    if (isAdmin) {
      return { authorized: true, reason: 'Authorized as administrator.', code: 'ADMIN_AUTHORIZED' };
    }

    switch (action) {
      // ----------------------------------------------------
      // Public Actions
      // ----------------------------------------------------
      case ACTIONS.LISTING_READ:
      case ACTIONS.REQUEST_READ:
      case ACTIONS.AI_ADVISOR_QUERY:
        return { authorized: true, reason: 'Public read allowed.', code: 'PUBLIC_ALLOWED' };

      // ----------------------------------------------------
      // Listing Creation
      // ----------------------------------------------------
      case ACTIONS.LISTING_CREATE:
      case ACTIONS.REQUEST_CREATE:
      case ACTIONS.FILE_UPLOAD:
        // Open to public/authenticated users unless explicitly blocked
        if (user && user.isBlocked) {
          return { authorized: false, reason: 'Blocked users cannot create content.', code: 'BLOCKED' };
        }
        return { authorized: true, reason: 'Creation allowed.', code: 'ALLOWED' };

      // ----------------------------------------------------
      // Listing Ownership & Modification
      // ----------------------------------------------------
      case ACTIONS.LISTING_UPDATE: {
        if (!user) {
          return { authorized: false, reason: 'Authentication required to update listing.', code: 'AUTH_REQUIRED' };
        }
        if (!resource) {
          return { authorized: false, reason: 'Target listing not found.', code: 'RESOURCE_NOT_FOUND' };
        }

        // Check ownership
        const isOwner = this.verifyListingOwnership(user, resource);
        if (!isOwner) {
          return { authorized: false, reason: 'You do not own this listing.', code: 'FORBIDDEN_NOT_OWNER' };
        }

        // Check if non-admin is attempting to tamper with administrative / moderation flags
        if (context.updates) {
          const forbiddenModerationFields = [
            'isApproved', 'status', 'publicationStatus', 'approvedBy',
            'approvedAt', 'rejectionReason', 'flagged', 'flagReasons',
            'reportCount', 'landlordId', 'isPaidSubscriber'
          ];
          const attemptedTampering = forbiddenModerationFields.filter(f => context.updates[f] !== undefined);
          if (attemptedTampering.length > 0) {
            return {
              authorized: false,
              reason: `Non-administrators cannot modify protected fields: ${attemptedTampering.join(', ')}`,
              code: 'FORBIDDEN_MODERATION_FIELDS'
            };
          }
        }

        return { authorized: true, reason: 'Authorized as listing owner.', code: 'OWNER_AUTHORIZED' };
      }

      case ACTIONS.LISTING_DELETE: {
        if (!user) {
          return { authorized: false, reason: 'Authentication required to delete listing.', code: 'AUTH_REQUIRED' };
        }
        if (!resource) {
          return { authorized: false, reason: 'Target listing not found.', code: 'RESOURCE_NOT_FOUND' };
        }
        const isOwner = this.verifyListingOwnership(user, resource);
        if (!isOwner) {
          return { authorized: false, reason: 'You do not own this listing.', code: 'FORBIDDEN_NOT_OWNER' };
        }
        return { authorized: true, reason: 'Authorized as listing owner.', code: 'OWNER_AUTHORIZED' };
      }

      // Moderation Actions (Admin / Manager only)
      case ACTIONS.LISTING_APPROVE:
      case ACTIONS.LISTING_REJECT:
      case ACTIONS.LISTING_SUSPEND:
        if (!isManager) {
          return { authorized: false, reason: 'Moderation privileges required.', code: 'FORBIDDEN_MODERATOR_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as moderator.', code: 'MODERATOR_AUTHORIZED' };

      // Seeker Request Administration (Status & Delete)
      case ACTIONS.REQUEST_UPDATE_STATUS:
      case ACTIONS.REQUEST_DELETE:
        if (!isAdmin) {
          return { authorized: false, reason: 'Admin privileges required to moderate room requests.', code: 'FORBIDDEN_ADMIN_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as admin.', code: 'ADMIN_AUTHORIZED' };

      // Landlord Administration
      case ACTIONS.LANDLORD_READ:
        if (!isAdmin) {
          return { authorized: false, reason: 'Admin privileges required to view full landlord records.', code: 'FORBIDDEN_ADMIN_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as admin.', code: 'ADMIN_AUTHORIZED' };

      case ACTIONS.LANDLORD_BLOCK:
      case ACTIONS.LANDLORD_SET_PAID:
        if (!isAdmin) {
          return { authorized: false, reason: 'Admin privileges required to alter landlord payment or block status.', code: 'FORBIDDEN_ADMIN_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as admin.', code: 'ADMIN_AUTHORIZED' };

      case ACTIONS.LANDLORD_UPDATE: {
        if (!user) {
          return { authorized: false, reason: 'Authentication required.', code: 'AUTH_REQUIRED' };
        }
        // Landlord can update own profile, admin can update any
        const userLandlordId = String(user.landlordId || user.userId || user._id || '');
        const targetLandlordId = String(resource && (resource._id || resource.id || resource) || '');
        if (!isAdmin && (!userLandlordId || userLandlordId !== targetLandlordId)) {
          return { authorized: false, reason: 'Cannot modify another landlord profile.', code: 'FORBIDDEN_NOT_OWNER' };
        }
        // Non-admins cannot alter payment status or block flags
        if (!isAdmin && context.updates) {
          if (context.updates.isPaidSubscriber !== undefined || context.updates.isBlocked !== undefined) {
            return { authorized: false, reason: 'Cannot alter payment or block status.', code: 'FORBIDDEN_PRIVILEGE_ESCALATION' };
          }
        }
        return { authorized: true, reason: 'Authorized.', code: 'AUTHORIZED' };
      }

      // User Administration
      case ACTIONS.USER_READ:
      case ACTIONS.USER_UPDATE_ROLE:
      case ACTIONS.USER_BLOCK:
      case ACTIONS.USER_DELETE:
        if (!isAdmin) {
          return { authorized: false, reason: 'Admin privileges required for user management.', code: 'FORBIDDEN_ADMIN_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as admin.', code: 'ADMIN_AUTHORIZED' };

      // Observability & Audits
      case ACTIONS.AUDIT_LOG_READ:
      case ACTIONS.REPORT_EXPORT:
      case ACTIONS.NOTIFICATION_SEND:
        if (!isAdmin) {
          return { authorized: false, reason: 'Admin privileges required.', code: 'FORBIDDEN_ADMIN_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as admin.', code: 'ADMIN_AUTHORIZED' };

      // AI Tool Execution
      case ACTIONS.AI_EXECUTE_TOOL: {
        if (!context.toolName) {
          return { authorized: false, reason: 'Missing tool name.', code: 'INVALID_TOOL' };
        }
        return this.canExecuteAiTool(user, context.toolName);
      }

      default:
        return { authorized: false, reason: 'Unknown or unhandled action.', code: 'UNKNOWN_ACTION' };
    }
  }

  /**
   * Helper to verify if an actor owns a listing
   */
  verifyListingOwnership(user, listing) {
    if (!user || !listing) return false;
    const userIds = [
      user._id,
      user.id,
      user.landlordId,
      user.userId
    ].filter(Boolean).map(id => String(id));

    const listingLandlordId = listing.landlordId
      ? (listing.landlordId._id || listing.landlordId.id || listing.landlordId)
      : null;

    if (!listingLandlordId) return false;
    return userIds.includes(String(listingLandlordId));
  }

  /**
   * Check if a user can execute an AI tool based on tool classification
   */
  canExecuteAiTool(user, toolName) {
    const { TOOL_CLASSIFICATIONS } = require('./aiSecurityGate');
    const classification = TOOL_CLASSIFICATIONS[toolName] || 'HIGH_RISK';

    const role = (user && user.role) || (user && user.admin ? ROLES.ADMIN : 'ANONYMOUS');
    const isAdmin = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;

    switch (classification) {
      case 'PUBLIC':
        return { authorized: true, reason: 'Public tool allowed.', code: 'PUBLIC' };
      case 'USER_AUTHENTICATED':
        if (!user) return { authorized: false, reason: 'Authentication required for this tool.', code: 'AUTH_REQUIRED' };
        return { authorized: true, reason: 'Authenticated user authorized.', code: 'AUTHENTICATED' };
      case 'USER_OWNED':
        if (!user) return { authorized: false, reason: 'Authentication required.', code: 'AUTH_REQUIRED' };
        return { authorized: true, reason: 'Caller identity verified.', code: 'OWNED' };
      case 'ADMIN':
      case 'SENSITIVE':
      case 'HIGH_RISK':
        if (!isAdmin) {
          return { authorized: false, reason: `Administrator authorization required to execute ${toolName}.`, code: 'FORBIDDEN_ADMIN_REQUIRED' };
        }
        return { authorized: true, reason: 'Authorized as administrator.', code: 'ADMIN_AUTHORIZED' };
      default:
        return { authorized: false, reason: 'Unknown tool classification.', code: 'UNKNOWN_TOOL' };
    }
  }
}

const authEngine = new AuthorizationEngine();

module.exports = {
  authEngine,
  AuthorizationEngine,
  ACTIONS
};
