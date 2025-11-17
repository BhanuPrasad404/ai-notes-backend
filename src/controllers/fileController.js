// controllers/fileController.js - PROPER WORKING VERSION
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { CallTracker } = require('assert');
const cloudinary = require('../lib/cloudinary');
const logger = require('../utils/logger'); // Add this line

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const uploadFile = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      logger.warn('File upload failed - no file provided', { userId: req.user?.id });
      return res.status(400).json({ success: false, error: 'No file selected' });
    }

    const file = req.files.file;
    const userId = req.user.id;
    const { commentId } = req.body;

    logger.debug('Processing file upload', {
      userId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimetype,
      commentId: commentId || 'none'
    });

    if (file.size > MAX_FILE_SIZE) {
      logger.warn('File upload failed - file too large', {
        userId,
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE
      });
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB'
      });
    }

    const documentMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed'
    ];

    const resourceType = documentMimeTypes.includes(file.mimetype)
      ? 'raw'
      : file.mimetype.startsWith('image/')
        ? 'image'
        : 'auto';

    const dataUri = `data:${file.mimetype};base64,${file.data.toString('base64')}`;

    logger.debug('Uploading to Cloudinary', {
      userId,
      resourceType,
      folder: 'note_files'
    });

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: 'note_files',
      public_id: `file_${uuidv4()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      access_mode: 'public',
      resource_type: resourceType,
      overwrite: false,
    });

    const fileAttachment = await prisma.fileAttachment.create({
      data: {
        filename: file.name,
        fileUrl: uploadResult.secure_url,
        fileSize: file.size,
        fileType: file.mimetype,
        userId,
        commentId: commentId || null
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    logger.info('File uploaded successfully', {
      userId,
      fileId: fileAttachment.id,
      fileName: file.name,
      fileSize: file.size,
      cloudinaryUrl: uploadResult.secure_url
    });

    res.json({ success: true, message: 'File uploaded successfully', fileAttachment });
  } catch (error) {
    logger.error('File upload operation failed', error, {
      userId: req.user?.id,
      fileName: req.files?.file?.name,
      fileSize: req.files?.file?.size
    });
    res.status(500).json({
      success: false,
      error: 'File upload failed: ' + error.message
    });
  }
};

const uploadNoteFile = async (req, res) => {
  try {
    logger.debug('Note file upload request received');

    if (!req.files || !req.files.file) {
      logger.warn('Note file upload failed - no file provided', { userId: req.user?.id });
      return res.status(400).json({
        success: false,
        error: 'No file selected'
      });
    }

    const file = req.files.file;
    const userId = req.user.id;
    const { noteId } = req.body;

    logger.debug('Processing note file upload', {
      userId,
      noteId: noteId || 'none',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimetype
    });

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      logger.warn('Note file upload failed - file too large', {
        userId,
        noteId,
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE
      });
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB'
      });
    }

    logger.debug('Uploading note file to Cloudinary');

    // Determine resource type (same logic as uploadFile)
    let resourceType = 'auto';
    const documentMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed'
    ];

    if (documentMimeTypes.includes(file.mimetype)) {
      resourceType = 'raw';
    } else if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    }

    // Use reliable upload method (same as uploadFile)
    const dataUri = `data:${file.mimetype};base64,${file.data.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: 'note_attachments',
      public_id: `note_file_${uuidv4()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      access_mode: 'public',
      resource_type: resourceType,
      overwrite: false
    });

    logger.info('Note file uploaded to Cloudinary successfully', {
      userId,
      noteId,
      fileName: file.name,
      cloudinaryUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });

    // Create file record in database
    const noteAttachment = await prisma.noteAttachment.create({
      data: {
        filename: file.name,
        fileUrl: uploadResult.secure_url,
        fileSize: file.size,
        fileType: file.mimetype,
        noteId: noteId,
        cloudinaryPublicId: uploadResult.public_id
      },
      include: {
        note: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    logger.info('Note attachment created in database', {
      userId,
      noteId,
      attachmentId: noteAttachment.id,
      fileName: file.name
    });

    res.json({
      success: true,
      message: 'File uploaded to cloud successfully',
      noteAttachment: {
        id: noteAttachment.id,
        filename: noteAttachment.filename,
        fileUrl: noteAttachment.fileUrl,
        fileSize: noteAttachment.fileSize,
        fileType: noteAttachment.fileType,
        createdAt: noteAttachment.createdAt,
        user: noteAttachment.note.user
      }
    });

  } catch (error) {
    logger.error('Note file upload operation failed', error, {
      userId: req.user?.id,
      noteId: req.body?.noteId,
      fileName: req.files?.file?.name
    });
    res.status(500).json({
      success: false,
      error: 'File upload failed: ' + error.message
    });
  }
};

const deleteAttachment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attachmentId } = req.params;

    logger.debug('Delete attachment request', { userId, attachmentId });

    if (!attachmentId) {
      logger.warn('Delete attachment failed - missing attachment ID', { userId });
      return res.status(400).json({
        success: false,
        error: 'Attachment ID is required'
      });
    }

    // Find the attachment and check if user has permission
    const attachment = await prisma.noteAttachment.findFirst({
      where: {
        id: attachmentId,
        note: {
          userId: userId // User must own the note
        }
      }
    });

    if (!attachment) {
      logger.warn('Delete attachment failed - not found or no permission', { userId, attachmentId });
      return res.status(404).json({
        success: false,
        error: 'Attachment not found or you do not have permission to delete it'
      });
    }

    // Delete from Cloudinary if public_id exists
    if (attachment.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(attachment.cloudinaryPublicId);
        logger.info('File deleted from Cloudinary', {
          userId,
          attachmentId,
          cloudinaryPublicId: attachment.cloudinaryPublicId
        });
      } catch (cloudinaryError) {
        logger.error('Cloudinary deletion failed, continuing with database deletion', cloudinaryError, {
          userId,
          attachmentId,
          cloudinaryPublicId: attachment.cloudinaryPublicId
        });
      }
    }

    // Delete from database
    await prisma.noteAttachment.delete({
      where: { id: attachmentId }
    });

    logger.info('Attachment deleted from database', {
      userId,
      attachmentId,
      fileName: attachment.filename
    });

    res.json({
      success: true,
      message: 'Attachment deleted successfully',
      deletedAttachment: {
        id: attachment.id,
        filename: attachment.filename
      }
    });

  } catch (error) {
    logger.error('Delete attachment operation failed', error, {
      userId: req.user?.id,
      attachmentId: req.params?.attachmentId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete attachment: ' + error.message
    });
  }
};

const getCommentFiles = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    logger.debug('Fetching comment files', { userId, commentId });

    const files = await prisma.fileAttachment.findMany({
      where: { commentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    logger.info('Comment files retrieved successfully', {
      userId,
      commentId,
      fileCount: files.length
    });

    res.json({
      success: true,
      files
    });

  } catch (error) {
    logger.error('Get comment files operation failed', error, {
      userId: req.user?.id,
      commentId: req.params?.commentId
    });
    res.status(500).json({ error: 'Failed to get files' });
  }
};

// Add this to your fileController.js
const downloadFileProxy = async (req, res) => {
  try {
    const { fileId } = req.params;

    logger.debug('File download request', { fileId });

    const fileRecord = await prisma.fileAttachment.findUnique({
      where: { id: fileId }
    });

    if (!fileRecord) {
      logger.warn('File download failed - file not found', { fileId });
      return res.status(404).json({ error: 'File not found' });
    }

    // Fetch from Cloudinary through your server
    const response = await fetch(fileRecord.fileUrl);
    const fileBuffer = await response.buffer();

    logger.info('File downloaded successfully', {
      fileId,
      fileName: fileRecord.filename,
      fileType: fileRecord.fileType,
      fileSize: fileBuffer.length
    });

    // Serve the file directly
    res.setHeader('Content-Type', fileRecord.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.filename}"`);
    res.send(fileBuffer);

  } catch (error) {
    logger.error('File download operation failed', error, {
      fileId: req.params?.fileId
    });
    res.status(500).json({ error: 'Download failed' });
  }
};

module.exports = {
  uploadFile,
  uploadNoteFile,
  getCommentFiles,
  deleteAttachment,
  downloadFileProxy
};