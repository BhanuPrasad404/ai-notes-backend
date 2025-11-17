const express = require('express');
const {
  shareNote,
  getSharedNotes,
  revokeShare,
  bulkRevokeNoteShares
} = require('../controllers/sharingController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateShare, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/notes/{id}/share:
 *   post:
 *     summary: "Share a note with another user"
 *     description: "Share a note with specific permissions"
 *     tags: [Sharing]
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
 *         description: "Note shared successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Note shared successfully"
 *                 sharedNote:
 *                   type: object
 *       400:
 *         description: "Validation error"
 *       401:
 *         description: "Unauthorized"
 */
router.post('/:id/share', validateShare, handleValidationErrors, shareNote);
router.post('/bulk-revoke-shares', bulkRevokeNoteShares);


router.get('/shared', getSharedNotes);
router.delete('/:id/share/:userId', revokeShare);

module.exports = router;