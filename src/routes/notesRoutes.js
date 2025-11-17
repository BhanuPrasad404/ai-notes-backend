const express = require('express');
const {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
  getCollaborationHistory,
  getNotesSharedByMe,
} = require('../controllers/notesController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateNote, handleValidationErrors } = require('../middleware/validation');
const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/notes:
 *   post:
 *     summary: "Create a new note with AI processing"
 *     description: "Creates a note and triggers background AI processing for summary and tags"
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Meeting Notes"
 *               content:
 *                 type: string
 *                 example: "Discussed project timelines"
 *               contentType:
 *                 type: string
 *                 enum: ['text', 'richText']
 *                 example: "text"
 *     responses:
 *       201:
 *         description: "Note created successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Note created successfully"
 *                 note:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                 aiProcessing:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: "Validation error"
 *       401:
 *         description: "Unauthorized"
 */
router.post('/', validateNote, handleValidationErrors, createNote);

/**
 * @swagger
 * /api/notes:
 *   get:
 *     summary: "Get all notes with search and pagination"
 *     description: "Returns user's notes and shared notes"
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: "Notes retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notes:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: "Unauthorized"
 */
router.get('/shared-by-me', getNotesSharedByMe);
router.get('/', getNotes);

// SIMPLE ROUTES WITHOUT DOCUMENTATION
router.get('/:id', getNote);
router.get('/collaboration/history', getCollaborationHistory);
router.put('/:id', validateNote, handleValidationErrors, updateNote);
router.delete('/:id', deleteNote);

module.exports = router;