const express = require('express');
const router = express.Router();
const aiAdvisorController = require('../controllers/AiAdvisorController');
const { aiAdvisorLimiter } = require('../middleware/rateLimiters');

router.post('/advisor', aiAdvisorLimiter, aiAdvisorController.askAdvisor);
router.post('/chat', aiAdvisorLimiter, aiAdvisorController.askAdvisor); // Alias for existing frontend

module.exports = router;
