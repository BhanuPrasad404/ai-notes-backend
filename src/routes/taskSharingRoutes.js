const express = require('express');
const {
  shareTask,
  getSharedTasks,
  revokeTaskShare,
  bulkRevokeTaskShares
} = require('../controllers/taskSharingController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateShare, handleValidationErrors } = require('../middleware/validation');

console.log(' Imported getTasksSharedByMe:', typeof getTasksSharedByMe);
const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/tasks/{id}/share:
 *   post:
 *     summary: "Share a task with another user"
 *     description: "Share a task with specific permissions"
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sharedWithEmail
 *             properties:
 *               sharedWithEmail:
 *                 type: string
 *                 example: "jane@example.com"
 *               permission:
 *                 type: string
 *                 enum: ['VIEW', 'EDIT']
 *                 example: "VIEW"
 *     responses:
 *       201:
 *         description: "Task shared successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Task shared successfully"
 *                 sharedTask:
 *                   type: object
 *       400:
 *         description: "Validation error"
 *       401:
 *         description: "Unauthorized"
 */
router.post('/:id/share', validateShare, handleValidationErrors, shareTask);

/**
 * @swagger
 * /api/tasks/shared:
 *   get:
 *     summary: "Get tasks shared with current user"
 *     description: "Returns all tasks shared with the authenticated user"
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Shared tasks retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Shared tasks retrieved successfully"
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: integer
 *       401:
 *         description: "Unauthorized"
 */

router.post('/bulk-revoke-shares', bulkRevokeTaskShares);

/**
 * @swagger
 * /api/tasks/{id}/share/{userId}:
 *   delete:
 *     summary: "Revoke task sharing access"
 *     description: "Revoke a user's access to a shared task"
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Sharing access revoked successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sharing access revoked successfully"
 *       401:
 *         description: "Unauthorized"
 *       404:
 *         description: "Sharing record not found"
 */
router.delete('/:id/share/:userId', revokeTaskShare);


module.exports = router;