// routes/fileRoutes.js - FIXED VERSION
const express = require('express');
const fileUpload = require('express-fileupload');
const {
  uploadFile,
  uploadNoteFile,
  getCommentFiles,
  deleteAttachment,
  downloadFileProxy
} = require('../controllers/fileController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Configure file upload
router.use(fileUpload({
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  abortOnLimit: true,
  createParentPath: false,
  useTempFiles: false,
  safeFileNames: false,
  preserveExtension: true
}));

// Routes - Apply auth only where needed
router.post('/upload', authMiddleware, uploadFile);
router.post('/upload-note', authMiddleware, uploadNoteFile)
//router.get('/:filename', serveFile);
router.get('/comment/:commentId', authMiddleware, getCommentFiles);
router.delete('/attachments/:attachmentId', authMiddleware, deleteAttachment);
router.get('/download/:fileId',downloadFileProxy);

module.exports = router;