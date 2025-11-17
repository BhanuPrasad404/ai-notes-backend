// routes/avatarRoutes.js
const express = require('express');
const fileUpload = require('express-fileupload');
const { uploadAvatar } = require('../controllers/avatarController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Configure file upload for avatars
router.use(fileUpload({
  limits: { 
    fileSize: 2 * 1024 * 1024 // 2MB limit for avatars
  },
  abortOnLimit: true,
  safeFileNames: true,
  preserveExtension: true
}));

// Routes
router.post('/upload', authMiddleware, uploadAvatar); // Upload requires auth


module.exports = router;