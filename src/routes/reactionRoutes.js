const express = require('express');
const {
  addReaction,
  removeReaction,
  getCommentReactions
} = require('../controllers/reactionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/comments/{commentId}/reactions:
 *   post:
 *     summary: "Add or update reaction to a comment"
 *     tags: [Reactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *                 example: "👍"
 *     responses:
 *       200:
 *         description: "Reaction added/updated successfully"
 */
router.post('/:commentId/reactions', addReaction);

/**
 * @swagger
 * /api/comments/{commentId}/reactions:
 *   delete:
 *     summary: "Remove reaction from a comment"
 *     tags: [Reactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *                 example: "👍"
 *     responses:
 *       200:
 *         description: "Reaction removed successfully"
 */
router.delete('/:commentId/reactions', removeReaction);

/**
 * @swagger
 * /api/comments/{commentId}/reactions:
 *   get:
 *     summary: "Get all reactions for a comment"
 *     tags: [Reactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *     responses:
 *       200:
 *         description: "Reactions retrieved successfully"
 */
router.get('/:commentId/reactions', getCommentReactions);

module.exports = router;