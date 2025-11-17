const express = require('express');
const { 
  enhanceNote, 
  extractNoteActions, 
  summarizeNoteManual, 
  checkAIHealth 
} = require('../controllers/aiController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateAIRequest, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/ai/summarize-manual:
 *   post:
 *     summary: Summarize content using AI
 *     description: "Uses local Ollama Mistral model to generate concise summary with key points"
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 example: "This is a long text about artificial intelligence and machine learning."
 *               noteId:
 *                 type: string
 *                 example: "cmgg69ayr0001xsxqzuys73r8"
 *     responses:
 *       200:
 *         description: Content summarized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 originalContent:
 *                   type: string
 *                 summary:
 *                   type: string
 *                   example: "Key points about AI and machine learning."
 *                 noteId:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/summarize-manual', validateAIRequest, handleValidationErrors, summarizeNoteManual);

/**
 * @swagger
 * /api/ai/extract-actions:
 *   post:
 *     summary: Extract action items from content
 *     description: "Uses AI to identify tasks and action items from notes"
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 example: "Meeting notes with action items."
 *               noteId:
 *                 type: string
 *                 example: "note123"
 *     responses:
 *       200:
 *         description: Action items extracted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 originalContent:
 *                   type: string
 *                 actionItems:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Task 1", "Task 2", "Task 3"]
 *                 noteId:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/extract-actions', validateAIRequest, handleValidationErrors, extractNoteActions);

// Simple routes without documentation
router.post('/enhance', validateAIRequest, handleValidationErrors, enhanceNote);
router.get('/health', checkAIHealth);

module.exports = router;