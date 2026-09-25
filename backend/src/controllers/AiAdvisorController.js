const aiAdvisorService = require('../services/AiAdvisorService');
const ApiResponse = require('../utils/apiResponse');
const auditLogRepository = require('../repositories/AuditLogRepository');

class AiAdvisorController {
  async askAdvisor(req, res, next) {
    const actorId = req.user ? (req.user._id || req.user.id || req.user.userId) : null;
    const actorEmail = req.user ? req.user.email : 'public@rentaroom.local';
    const actorRole = req.user ? (req.user.role || 'USER') : 'ANONYMOUS';

    try {
      const { message, question, query: rawQuery } = req.body;
      const query = message || question || rawQuery;

      if (!query || typeof query !== 'string' || !query.trim()) {
        return ApiResponse.error(res, 'Please provide a message or question.', 400);
      }

      const result = await aiAdvisorService.getAdvice(query);

      // Audit AI Tool Action
      auditLogRepository.logAction({
        userId: actorId,
        actorId,
        actorEmail,
        actorRole,
        action: 'AI_ADVISOR_QUERY',
        category: 'AI',
        resource: 'AiAdvisor',
        resourceId: 'soweto-housing-advisor',
        status: 'SUCCESS',
        result: 'SUCCESS',
        ipAddress: req.ip,
        requestId: req.id,
        details: {
          toolName: 'AiAdvisorService',
          actionType: 'QUERY_ADVISOR',
          authorized: true,
          queryLength: query.length,
          model: result.model || 'gemini-1.5-flash',
          grounded: !!result.grounded
        }
      }).catch(() => {});

      return ApiResponse.success(res, 'Advisor advice generated.', result, 200, {
        reply: result.answer, // Backwards compatibility for frontend
        answer: result.answer
      });
    } catch (err) {
      auditLogRepository.logAction({
        userId: actorId,
        actorId,
        actorEmail,
        actorRole,
        action: 'AI_ADVISOR_QUERY',
        category: 'AI',
        resource: 'AiAdvisor',
        resourceId: 'soweto-housing-advisor',
        status: 'FAILURE',
        result: 'FAILED',
        failureReason: err.message,
        ipAddress: req.ip,
        requestId: req.id,
        details: {
          toolName: 'AiAdvisorService',
          actionType: 'QUERY_ADVISOR',
          authorized: false
        }
      }).catch(() => {});

      next(err);
    }
  }
}

module.exports = new AiAdvisorController();
