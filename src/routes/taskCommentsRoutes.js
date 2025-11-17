const express = require('express');
const {
  getTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
} = require('../controllers/taskCommentsController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/tasks/{taskId}/comments:
 *   get:
 *     summary: "Get all comments for a task"
 *     tags: [Task Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *     responses:
 *       200:
 *         description: "Comments retrieved successfully"
 */
router.get('/:taskId/comments', getTaskComments);

/**
 * @swagger
 * /api/tasks/{taskId}/comments:
 *   post:
 *     summary: "Add a comment to a task"
 *     tags: [Task Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
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
 *     responses:
 *       201:
 *         description: "Comment added successfully"
 */
router.post('/:taskId/comments', createTaskComment);

/**
 * @swagger
 * /api/tasks/comments/{commentId}:
 *   put:
 *     summary: "Update a comment"
 *     tags: [Task Comments]
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
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Comment updated successfully"
 */
router.put('/comments/:commentId', updateTaskComment);

/**
 * @swagger
 * /api/tasks/comments/{commentId}:
 *   delete:
 *     summary: "Delete a comment"
 *     tags: [Task Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *     responses:
 *       200:
 *         description: "Comment deleted successfully"
 */
router.delete('/comments/:commentId', deleteTaskComment);

module.exports = router;