const express = require('express');
const router = express.Router();
const { addSidebarTag, removeSidebarTag, getSidebarTags } = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Add tag to sidebar
router.post('/sidebar-tags', addSidebarTag);

// Remove tag from sidebar  
router.delete('/sidebar-tags', removeSidebarTag);

// Get all sidebar tags
router.get('/sidebar-tags', getSidebarTags);

module.exports = router;