const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createActivity } = require('./activityController');
const logger = require('../utils/logger'); // Add this line

/**
 * Share a note with another user by email
 * @route POST /api/notes/:id/share
 */
const shareNote = async (req, res) => {
  try {
    const { id: noteId } = req.params;
    const { sharedWithEmail, permission = 'VIEW' } = req.body;
    const userId = req.user.id; // User A (owner)

    logger.debug('Sharing note request', {
      userId,
      noteId,
      sharedWithEmail,
      permission
    });

    // Validation
    if (!sharedWithEmail) {
      logger.warn('Share note failed - email required', { userId, noteId });
      return res.status(400).json({ error: 'User email is required' });
    }

    // Check if permission is valid
    const validPermissions = ['VIEW', 'EDIT'];
    if (!validPermissions.includes(permission)) {
      logger.warn('Share note failed - invalid permission', { userId, noteId, permission });
      return res.status(400).json({ error: 'Invalid permission type' });
    }

    // Check if note exists and belongs to user
    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId: userId
      }
    });

    if (!note) {
      logger.warn('Share note failed - note not found or no permission', { userId, noteId });
      return res.status(404).json({ error: 'Note not found or you do not have permission' });
    }

    // Find the user to share with by email
    const userToShareWith = await prisma.user.findUnique({
      where: { email: sharedWithEmail }
    });

    if (!userToShareWith) {
      logger.warn('Share note failed - user not found', { userId, noteId, sharedWithEmail });
      return res.status(404).json({ error: 'User not found with this email' });
    }

    // Prevent sharing with yourself
    if (userToShareWith.id === userId) {
      logger.warn('Share note failed - cannot share with self', { userId, noteId });
      return res.status(400).json({ error: 'Cannot share note with yourself' });
    }

    // Check if already shared
    const existingShare = await prisma.sharedNote.findFirst({
      where: {
        noteId: noteId,
        sharedWithUserId: userToShareWith.id
      }
    });

    if (existingShare) {
      logger.warn('Share note failed - already shared', {
        userId,
        noteId,
        sharedWithUserId: userToShareWith.id
      });
      return res.status(400).json({ error: 'Note is already shared with this user' });
    }

    // Create the sharing record
    const sharedNote = await prisma.sharedNote.create({
      data: {
        noteId: noteId,
        sharedWithUserId: userToShareWith.id,
        permission: permission
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          }
        },
        note: {
          select: {
            id: true,
            title: true,
          }
        }
      }
    });

    logger.info('Note shared successfully', {
      userId,
      noteId,
      sharedWithUserId: userToShareWith.id,
      sharedWithEmail: userToShareWith.email,
      permission
    });

    await createActivity({
      userId: userToShareWith.id,   
      type: 'NOTE_SHARED',
      actorId: req.user.id,              
      actorName: req.user.name,
      targetType: 'NOTE',
      targetId: noteId,
      targetTitle: note.title,
      message: `${req.user.name} shared "${note.title}" with you`,
      metadata: { permission }
    });

    res.status(201).json({
      message: 'Note shared successfully',
      sharedNote: {
        id: sharedNote.id,
        note: sharedNote.note,
        sharedWith: sharedNote.sharedWith,
        permission: sharedNote.permission,
        sharedAt: sharedNote.sharedAt
      }
    });

  } catch (error) {
    logger.error('Share note operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.id,
      sharedWithEmail: req.body?.sharedWithEmail
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get all notes shared with the current user
 * @route GET /api/notes/shared
 */
const getSharedNotes = async (req, res) => {
  try {
    const userId = req.user.id; // User B (viewing shared notes)

    logger.debug('Fetching shared notes', { userId });

    // Get all notes shared with this user
    const sharedNotes = await prisma.sharedNote.findMany({
      where: {
        sharedWithUserId: userId
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
            },
            attachments: true,
            userPreferences: {
              where: { userId },
              select: { isFavorite: true, personalTags: true }
            }
          }
        }
      },
      orderBy: {
        sharedAt: 'desc'
      }
    });

    // Process the notes to include sharing info
    const processedNotes = sharedNotes.map(shared => ({
      id: shared.note.id,
      title: shared.note.title,
      content: shared.note.content,
      aiSummary: shared.note.aiSummary,
      aiTags: shared.note.aiTags ? JSON.parse(shared.note.aiTags) : [],
      contentType: shared.note.contentType,
      isPublic: shared.note.isPublic,
      createdAt: shared.note.createdAt,
      updatedAt: shared.note.updatedAt,
      owner: shared.note.user,
      attachments: shared.note.attachments,
      userPreferences: shared.note.userPreferences,
      sharedInfo: {
        sharedAt: shared.sharedAt,
        permission: shared.permission,
        sharedNoteId: shared.id
      }
    }));

    logger.info('Shared notes retrieved successfully', {
      userId,
      noteCount: processedNotes.length
    });

    res.json({
      message: 'Shared notes retrieved successfully',
      notes: processedNotes,
      count: processedNotes.length
    });

  } catch (error) {
    logger.error('Get shared notes operation failed', error, {
      userId: req.user?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Revoke sharing access for a user
 * @route DELETE /api/notes/:id/share/:userId
 */
const revokeShare = async (req, res) => {
  try {
    const { id: noteId, userId: sharedWithUserId } = req.params;
    const userId = req.user.id; // User A (owner)

    logger.debug('Revoking note share', {
      userId,
      noteId,
      sharedWithUserId
    });

    // Check if note exists and belongs to user
    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId: userId
      }
    });

    if (!note) {
      logger.warn('Revoke share failed - note not found or no permission', {
        userId,
        noteId,
        sharedWithUserId
      });
      return res.status(404).json({ error: 'Note not found or you do not have permission' });
    }

    // Find and delete the sharing record
    const deletedShare = await prisma.sharedNote.deleteMany({
      where: {
        noteId: noteId,
        sharedWithUserId: sharedWithUserId
      }
    });

    if (deletedShare.count === 0) {
      logger.warn('Revoke share failed - sharing record not found', {
        userId,
        noteId,
        sharedWithUserId
      });
      return res.status(404).json({ error: 'Sharing record not found' });
    }

    logger.info('Note share revoked successfully', {
      userId,
      noteId,
      sharedWithUserId,
      noteTitle: note.title
    });

    await createActivity({
      userId: sharedWithUserId,           // User B's ID (who lost access)
      type: 'NOTE_ACCESS_REVOKED',        // Different type for revoke!
      actorId: req.user.id,               // User A (who revoked)
      actorName: req.user.name,
      targetType: 'NOTE',
      targetId: noteId,
      targetTitle: note.title,
      message: `${req.user.name} revoked your access to "${note.title}"`, // Clear message
      metadata: { action: 'REVOKED' }
    });

    res.json({
      message: 'Sharing access revoked successfully'
    });

  } catch (error) {
    logger.error('Revoke share operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.id,
      sharedWithUserId: req.params?.userId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Bulk revoke note shares
 * @route POST /api/notes/bulk-revoke-shares
 */
const bulkRevokeNoteShares = async (req, res) => {
  try {
    const { shareIds } = req.body; // Array of sharedNote IDs
    const userId = req.user.id;

    logger.debug('Bulk revoking note shares', {
      userId,
      shareCount: shareIds?.length
    });

    if (!shareIds || !Array.isArray(shareIds) || shareIds.length === 0) {
      logger.warn('Bulk revoke failed - invalid share IDs', { userId });
      return res.status(400).json({ error: 'Share IDs array is required' });
    }

    // Verify user owns these shares and delete in one query
    const deletedShares = await prisma.sharedNote.deleteMany({
      where: {
        id: { in: shareIds },
        note: {
          userId: userId // Ensure user owns the notes
        }
      }
    });

    logger.info('Bulk note shares revoked successfully', {
      userId,
      requestedCount: shareIds.length,
      actualCount: deletedShares.count
    });

    res.json({
      message: `Successfully revoked ${deletedShares.count} share(s)`,
      revokedCount: deletedShares.count
    });

  } catch (error) {
    logger.error('Bulk revoke note shares operation failed', error, {
      userId: req.user?.id,
      shareCount: req.body?.shareIds?.length
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  shareNote,
  getSharedNotes,
  revokeShare,
  bulkRevokeNoteShares
};