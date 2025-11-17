const cloudinary = require('../lib/cloudinary');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

const uploadAvatar = async (req, res) => {
  try {
    logger.debug('Avatar upload process started');

    // 1. VALIDATE FILE EXISTS
    if (!req.files || !req.files.avatar) {
      logger.warn('Avatar upload failed - no file provided', { userId: req.user?.id });
      return res.status(400).json({
        success: false,
        error: 'No avatar file uploaded. Please select an image file.'
      });
    }

    const avatar = req.files.avatar;
    const userId = req.user.id;

    logger.debug('Processing avatar upload', {
      userId,
      fileName: avatar.name,
      fileSize: avatar.size,
      mimeType: avatar.mimetype
    });

    // VALIDATE FILE TYPE
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(avatar.mimetype)) {
      logger.warn('Avatar upload failed - invalid file type', {
        userId,
        mimeType: avatar.mimetype,
        allowedTypes: allowedMimeTypes
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Please upload JPEG, PNG, GIF, or WebP images only.'
      });
    }

    // VALIDATE FILE SIZE (2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (avatar.size > maxSize) {
      logger.warn('Avatar upload failed - file too large', {
        userId,
        fileSize: avatar.size,
        maxSize
      });
      return res.status(400).json({
        success: false,
        error: 'File too large. Please upload images smaller than 2MB.'
      });
    }

    // UPLOAD TO CLOUDINARY - FIXED VERSION
    let uploadResult;
    try {
      // Use data URI format for more reliable uploads
      const dataUri = `data:${avatar.mimetype};base64,${avatar.data.toString('base64')}`;

      logger.debug('Uploading to Cloudinary', {
        userId,
        dataUriLength: dataUri.length,
        folder: 'avatars'
      });

      uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'avatars',
        public_id: `avatar_${userId}`,
        overwrite: true,
        transformation: [
          { width: 200, height: 200, crop: 'fill', gravity: 'face' }, // Focus on faces if detected
          { quality: 'auto', fetch_format: 'auto' } // Optimize quality and format
        ]
      });

      logger.info('Cloudinary upload successful', {
        userId,
        cloudinaryUrl: uploadResult.secure_url,
        fileSize: uploadResult.bytes,
        format: uploadResult.format
      });
    } catch (cloudinaryError) {
      logger.error('Cloudinary upload failed', cloudinaryError, {
        userId,
        fileName: avatar.name,
        fileSize: avatar.size
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to upload image to cloud storage. Please try again.'
      });
    }

    // UPDATE DATABASE WITH CLOUDINARY URL
    let updatedUser;
    try {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          avatarUrl: uploadResult.secure_url
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          createdAt: true
        }
      });
      
      logger.info('User avatar updated in database', {
        userId,
        avatarUrl: uploadResult.secure_url
      });
    } catch (dbError) {
      logger.error('Database update failed after successful Cloudinary upload', dbError, {
        userId,
        cloudinaryUrl: uploadResult.secure_url
      });
      // Even if DB fails, we still have the Cloudinary upload
      return res.status(500).json({
        success: false,
        error: 'Avatar uploaded but failed to update user profile. Please contact support.'
      });
    }

    logger.info('Avatar upload completed successfully', {
      userId,
      imageUrl: uploadResult.secure_url
    });

    res.json({
      success: true,
      message: 'Avatar uploaded to cloud successfully!',
      user: updatedUser,
      imageUrl: uploadResult.secure_url 
    });

  } catch (error) {
    logger.error('Unexpected avatar upload error', error, {
      userId: req.user?.id,
      hasFiles: !!req.files,
      fileCount: req.files ? Object.keys(req.files).length : 0
    });
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred during avatar upload.'
    });
  }
};

module.exports = { uploadAvatar }