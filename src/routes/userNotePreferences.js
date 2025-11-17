// routes/userNotePreferences.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
    toggleFavorite,
    addPersonalTag,
    removePersonalTag,
    getUserNotePreferences
} = require('../controllers/userNotePreferencesController');

router.post('/notes/:noteId/favorite', authMiddleware, toggleFavorite);
router.post('/notes/:noteId/tags', authMiddleware, addPersonalTag);
router.delete('/notes/:noteId/tags', authMiddleware, removePersonalTag);
router.get('/notes/:noteId/preferences', authMiddleware, getUserNotePreferences);

module.exports = router;