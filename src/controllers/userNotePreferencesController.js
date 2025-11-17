// controllers/userNotePreferencesController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

// Toggle favorite status for a note
const toggleFavorite = async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;
    const { isFavorite } = req.body;

    logger.debug('Toggling favorite status', { userId, noteId, isFavorite });

    // Check if user can access the note first
    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        OR: [
          { userId }, // User is owner
          {
            sharedNotes: {
              some: {
                sharedWithUserId: userId // User has sharing access
              }
            }
          }
        ]
      }
    });

    if (!note) {
      logger.warn('Toggle favorite failed - note not found or access denied', { userId, noteId });
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    // Upsert favorite preference
    const preference = await prisma.userNotePreferences.upsert({
      where: {
        userId_noteId: {
          userId,
          noteId
        }
      },
      update: {
        isFavorite
      },
      create: {
        userId,
        noteId,
        isFavorite
      }
    });

    logger.info('Favorite status updated successfully', {
      userId,
      noteId,
      isFavorite,
      action: isFavorite ? 'added_to_favorites' : 'removed_from_favorites'
    });

    res.json({ 
      success: true, 
      preference,
      message: isFavorite ? 'Note added to favorites' : 'Note removed from favorites'
    });

  } catch (error) {
    logger.error('Toggle favorite operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.noteId,
      isFavorite: req.body?.isFavorite
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add personal tag to a note
const addPersonalTag = async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;
    const { tag } = req.body;

    logger.debug('Adding personal tag', { userId, noteId, tag });

    if (!tag || tag.trim() === '') {
      logger.warn('Add personal tag failed - tag required', { userId, noteId });
      return res.status(400).json({ error: 'Tag is required' });
    }

    const cleanTag = tag.trim().toLowerCase();

    // Check if user can access the note
    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        OR: [
          { userId },
          {
            sharedNotes: {
              some: {
                sharedWithUserId: userId
              }
            }
          }
        ]
      }
    });

    if (!note) {
      logger.warn('Add personal tag failed - note not found or access denied', { userId, noteId });
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    // Get existing preferences or create empty one
    let preference = await prisma.userNotePreferences.findUnique({
      where: {
        userId_noteId: {
          userId,
          noteId
        }
      }
    });

    if (!preference) {
      preference = await prisma.userNotePreferences.create({
        data: {
          userId,
          noteId,
          personalTags: [cleanTag],
          isFavorite: false
        }
      });
      
      logger.debug('Created new user note preferences', { userId, noteId });
    } else {
      // Check if tag already exists
      if (preference.personalTags.includes(cleanTag)) {
        logger.warn('Add personal tag failed - tag already exists', { userId, noteId, tag: cleanTag });
        return res.status(400).json({ error: 'Tag already exists' });
      }

      // Add tag to existing array (max 3 tags)
      const updatedTags = [...preference.personalTags, cleanTag].slice(0, 3);
      
      preference = await prisma.userNotePreferences.update({
        where: {
          userId_noteId: {
            userId,
            noteId
          }
        },
        data: {
          personalTags: updatedTags
        }
      });
    }

    logger.info('Personal tag added successfully', {
      userId,
      noteId,
      tag: cleanTag,
      totalTags: preference.personalTags.length
    });

    res.json({ 
      success: true, 
      preference,
      message: 'Tag added successfully'
    });

  } catch (error) {
    logger.error('Add personal tag operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.noteId,
      tag: req.body?.tag
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove personal tag from a note
const removePersonalTag = async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;
    const { tag } = req.body;

    logger.debug('Removing personal tag', { userId, noteId, tag });

    const preference = await prisma.userNotePreferences.findUnique({
      where: {
        userId_noteId: {
          userId,
          noteId
        }
      }
    });

    if (!preference) {
      logger.warn('Remove personal tag failed - no preferences found', { userId, noteId });
      return res.status(404).json({ error: 'No preferences found for this note' });
    }

    // Remove tag from array
    const updatedTags = preference.personalTags.filter(t => t !== tag);

    const updatedPreference = await prisma.userNotePreferences.update({
      where: {
        userId_noteId: {
          userId,
          noteId
        }
      },
      data: {
        personalTags: updatedTags
      }
    });

    logger.info('Personal tag removed successfully', {
      userId,
      noteId,
      tag,
      remainingTags: updatedTags.length
    });

    res.json({ 
      success: true, 
      preference: updatedPreference,
      message: 'Tag removed successfully'
    });

  } catch (error) {
    logger.error('Remove personal tag operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.noteId,
      tag: req.body?.tag
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user preferences for a specific note
const getUserNotePreferences = async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    logger.debug('Fetching user note preferences', { userId, noteId });

    const preference = await prisma.userNotePreferences.findUnique({
      where: {
        userId_noteId: {
          userId,
          noteId
        }
      }
    });

    // Return default preferences if none exist
    const defaultPreferences = {
      isFavorite: false,
      personalTags: []
    };

    const result = preference || defaultPreferences;

    logger.info('User note preferences retrieved successfully', {
      userId,
      noteId,
      hasPreferences: !!preference,
      isFavorite: result.isFavorite,
      tagCount: result.personalTags.length
    });

    res.json({ 
      preferences: result 
    });

  } catch (error) {
    logger.error('Get user note preferences operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.noteId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  toggleFavorite,
  addPersonalTag,
  removePersonalTag,
  getUserNotePreferences
};