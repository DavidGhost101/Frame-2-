const aiAdvisorService = require('../services/AiAdvisorService');
const ApiResponse = require('../utils/apiResponse');

class AiAdvisorController {
  async askAdvisor(req, res, next) {
    try {
      const { message, question } = req.body;
      const query = message || question;

      if (!query || typeof query !== 'string' || !query.trim()) {
        return ApiResponse.error(res, 'Please provide a message or question.', 400);
      }

      const result = await aiAdvisorService.getAdvice(query);
      return ApiResponse.success(res, 'Advisor advice generated.', result, 200, {
        reply: result.answer, // Backwards compatibility for frontend
        answer: result.answer
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AiAdvisorController();
