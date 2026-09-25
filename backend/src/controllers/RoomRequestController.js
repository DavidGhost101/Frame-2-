const roomRequestService = require('../services/RoomRequestService');
const { RoomRequestValidator } = require('../validators/roomRequestValidator');
const ApiResponse = require('../utils/apiResponse');
const { toWhatsAppNumber, buildWhatsAppLinks } = require('../utils/phoneUtils');
const auditLogRepository = require('../repositories/AuditLogRepository');

class RoomRequestController {
  async getRoomRequests(req, res, next) {
    try {
      const result = await roomRequestService.getRoomRequests(req.query);
      return ApiResponse.paginated(
        res,
        'Room seeker requests retrieved successfully',
        result.items,
        result.page,
        result.limit,
        result.total,
        { requests: result.items } // Legacy backward compatibility
      );
    } catch (err) {
      next(err);
    }
  }

  async createRoomRequest(req, res, next) {
    try {
      const validation = RoomRequestValidator.validateCreate(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, validation.errors[0] || 'Validation error', 400, validation.errors);
      }

      const request = await roomRequestService.createRoomRequest(req.body);

      auditLogRepository.logAction({
        userId: req.user ? (req.user._id || req.user.userId) : null,
        actorEmail: req.user ? req.user.email : (req.body.phone || 'room_seeker'),
        actorRole: req.user ? (req.user.role || 'USER') : 'USER',
        action: 'ROOM_REQUEST_CREATED',
        category: 'REQUEST',
        resource: 'RoomRequest',
        resourceId: String(request._id),
        status: 'SUCCESS',
        result: 'SUCCESS',
        ipAddress: req.ip,
        requestId: req.id,
        details: {
          suburbs: request.preferredSuburbs || request.suburb,
          budget: request.budgetMax || request.maxBudget
        }
      }).catch(() => {});

      return ApiResponse.success(res, 'Room request posted successfully.', request, 201, {
        request
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const updated = await roomRequestService.updateStatus(req.params.id, status);

      auditLogRepository.logAction({
        userId: req.user ? (req.user._id || req.user.userId) : null,
        actorEmail: req.user ? req.user.email : 'admin_moderator',
        actorRole: req.user ? (req.user.role || 'ADMIN') : 'ADMIN',
        action: 'ROOM_REQUEST_UPDATED',
        category: 'REQUEST',
        resource: 'RoomRequest',
        resourceId: String(req.params.id),
        status: 'SUCCESS',
        result: 'SUCCESS',
        newStatus: status,
        ipAddress: req.ip,
        requestId: req.id
      }).catch(() => {});

      return ApiResponse.success(res, 'Room request status updated.', updated, 200, {
        request: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteRoomRequest(req, res, next) {
    try {
      const deleted = await roomRequestService.deleteRoomRequest(req.params.id, req.user);

      auditLogRepository.logAction({
        userId: req.user ? (req.user._id || req.user.userId) : null,
        actorEmail: req.user ? req.user.email : 'user',
        actorRole: req.user ? (req.user.role || 'ADMIN') : 'ADMIN',
        action: 'ROOM_REQUEST_DELETED',
        category: 'REQUEST',
        resource: 'RoomRequest',
        resourceId: String(req.params.id),
        status: 'SUCCESS',
        result: 'SUCCESS',
        ipAddress: req.ip,
        requestId: req.id
      }).catch(() => {});

      return ApiResponse.success(res, 'Room request deleted successfully.', deleted, 200, {
        request: deleted
      });
    } catch (err) {
      next(err);
    }
  }

  async trackContact(req, res, next) {
    try {
      await roomRequestService.trackContact(req.params.id);
      let request = null;
      try {
        request = await roomRequestService.getRequestById(req.params.id);
      } catch (_) {}

      const phone = (request && request.phone) || '+27821234567';
      const seekerName = (request && request.seekerName) || 'Room Seeker';
      const suburb = (request && request.suburb) || 'Soweto';
      const budget = (request && request.maxBudget) ? `R${request.maxBudget}` : 'your budget';
      const text = `Hi ${seekerName}, I saw your room request on Rent A Room looking for a place in ${suburb} (${budget}/month). I have an available room for you!`;

      const { cleanNumber, whatsappLink, whatsappWebLink, callLink } = buildWhatsAppLinks(phone, text);

      return ApiResponse.success(res, 'Contact inquiry recorded', {
        whatsappLink,
        whatsappWebLink,
        callLink,
        phone,
        cleanPhone: cleanNumber,
        seekerName
      }, 200, {
        whatsappLink,
        whatsappWebLink,
        callLink,
        phone,
        cleanPhone: cleanNumber,
        seekerName
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RoomRequestController();

