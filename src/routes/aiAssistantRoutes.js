// routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const AIController = require('../controllers/aiAssitantController');
const authMiddleware = require('../middleware/authMiddleware');

// All AI routes
router.get('/assistant', authMiddleware, AIController.getConversation);
router.post('/assistant', authMiddleware, AIController.saveConversation,);
router.post('/chat', authMiddleware, AIController.getAIResponse);
router.delete('/assistant', authMiddleware, AIController.clearConversation);

module.exports = router;