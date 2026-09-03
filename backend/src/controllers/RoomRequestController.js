const roomRequestService = require('../services/RoomRequestService');
const { RoomRequestValidator } = require('../validators/roomRequestValidator');
const ApiResponse = require('../utils/apiResponse');
const { toWhatsAppNumber, buildWhatsAppLinks } = require('../utils/phoneUtils');

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
        return ApiResponse.error(res, 'Validation error', 400, validation.errors);
      }

      const request = await roomRequestService.createRoomRequest(req.body);
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
      return ApiResponse.success(res, 'Room request status updated.', updated, 200, {
        request: updated
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

