const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiService = require('../services/aiService');
const { getIO } = require('../lib/socketIO');
const logger = require('../utils/logger'); // Add this line

// Helper function to check if user can access note
const canAccessNote = async (userId, noteId) => {
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
  return !!note;
};

// Helper function to check if user can edit note
const canEditNote = async (userId, noteId) => {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      OR: [
        { userId }, // User is owner (can do anything)
        {
          sharedNotes: {
            some: {
              sharedWithUserId: userId,
              permission: 'EDIT' // User has EDIT permission
            }
          }
        }
      ]
    }
  });
  return !!note;
};

// Create a new note with AI processing in background
const createNote = async (req, res) => {
  try {
    const { title, content, contentType = 'text' } = req.body;
    const userId = req.user.id;
    
    logger.debug('Creating new note', {
      userId,
      titleLength: title?.length,
      contentLength: content?.length,
      contentType
    });

    // Validation
    if (!title || !content) {
      logger.warn('Create note failed - title and content required', { userId });
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // save note immediately (user doesn't wait for AI)
    const note = await prisma.note.create({
      data: {
        title,
        content,
        contentType,
        userId,
        // Initially no AI data - will be added in background
        aiSummary: null,
        aiTags: "[]", // Store as empty array initially
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
      },
    });

    logger.info('Note created successfully', {
      userId,
      noteId: note.id,
      title: note.title,
      aiProcessing: content.length > 50
    });

    //  Send response to user IMMEDIATELY
    res.status(201).json({
      message: 'Note created successfully',
      note: {
        ...note,
        aiTags: note.aiTags || [] // Ensure array format
      },
      aiProcessing: content.length > 50, // Tell user if AI is working
    });

    //  Process AI in BACKGROUND if content is substantial
    if (content.length > 50) {
      setTimeout(async () => {
        try {
          logger.debug('Starting background AI processing', { noteId: note.id });

          const [aiSummary, aiTags] = await Promise.all([
            aiService.summarizeContent(content),
            aiService.suggestTags(content)
          ]);

          // Update note with AI data
          const updatedNote = await prisma.note.update({
            where: { id: note.id },
            data: {
              aiSummary,
              aiTags: JSON.stringify(aiTags)
            },
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true }
              }
            }
          });

          logger.info('AI processing completed successfully', {
            noteId: note.id,
            summaryLength: aiSummary?.length,
            tagsCount: aiTags?.length
          });

          const io = getIO();
          const noteOwnerId = note.userId;

          io.on('connection', (socket) => {
            logger.debug('User connected to socket', { socketId: socket.id });

            // Handle room joining for note updates
            socket.on('join-note-room', (noteId) => {
              socket.join(`note-${noteId}`);
              logger.debug('User joined note room', { socketId: socket.id, noteId });
            });

            socket.on('disconnect', () => {
              logger.debug('User disconnected from socket', { socketId: socket.id });
            });
          });

          // Emit to note owner specifically
          io.to(`user-${noteOwnerId}`).emit('ai-processing-complete', {
            noteId: note.id,
            note: {
              ...updatedNote,
              aiTags: aiTags // Send parsed tags
            },
            message: 'AI enhancement completed!'
          });

        } catch (aiError) {
          logger.error('Background AI processing failed', aiError, { noteId: note.id });

          const io = getIO();
          // Emit error event
          io.to(`user-${note.userId}`).emit('ai-processing-failed', {
            noteId: note.id,
            error: 'AI processing failed'
          });
        }
      }, 100);
    }

  } catch (error) {
    logger.error('Create note operation failed', error, {
      userId: req.user?.id,
      title: req.body?.title,
      contentLength: req.body?.content?.length
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all notes for user (OWN notes + SHARED notes)
const getNotes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, page = 1, limit = 10 } = req.query;

    logger.debug('Fetching notes', {
      userId,
      search: search || 'none',
      page: parseInt(page),
      limit: parseInt(limit)
    });

    //  Show both OWN notes and SHARED notes
    let where = {
      OR: [
        { userId }, // User's own notes
        {
          sharedNotes: {
            some: {
              sharedWithUserId: userId // Notes shared with user
            }
          }
        }
      ]
    };

    // Add search functionality
    if (search) {
      logger.debug('Applying search filter', { search });
      where.OR[0] = {
        userId,
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { aiSummary: { contains: search, mode: 'insensitive' } },
        ]
      };
      where.OR[1] = {
        sharedNotes: {
          some: {
            sharedWithUserId: userId,
            note: {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
                { aiSummary: { contains: search, mode: 'insensitive' } },
              ]
            }
          }
        }
      };
    }

    const notes = await prisma.note.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        attachments: true,
        // Include sharing info to know permission level
        sharedNotes: {
          where: {
            sharedWithUserId: userId
          },
          select: {
            permission: true,
            sharedAt: true
          }
        },
        userPreferences: {
          where: { userId },
          select: { isFavorite: true, personalTags: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const total = await prisma.note.count({ where });

    // Process notes to handle JSON aiTags and add permission info
    const processedNotes = notes.map(note => {
      const isOwner = note.userId === userId;
      const sharedInfo = note.sharedNotes[0]; // Get sharing info if exists

      // Safe JSON parsing for aiTags
      let parsedAiTags = [];
      try {
        if (note.aiTags) {
          parsedAiTags = JSON.parse(note.aiTags);
        }
      } catch (parseError) {
        logger.warn('Failed to parse aiTags', { noteId: note.id, aiTags: note.aiTags });
        parsedAiTags = [];
      }

      return {
        ...note,
        aiTags: parsedAiTags,
        // Add permission information
        permissions: {
          isOwner: isOwner,
          canEdit: isOwner || (sharedInfo && sharedInfo.permission === 'EDIT'),
          canDelete: isOwner, // Only owner can delete
          permissionLevel: isOwner ? 'OWNER' : (sharedInfo ? sharedInfo.permission : 'NONE'),
          sharedAt: sharedInfo ? sharedInfo.sharedAt : null
        }
      };
    });

    logger.info('Notes retrieved successfully', {
      userId,
      noteCount: processedNotes.length,
      totalCount: total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      notes: processedNotes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        hasMore: (page * limit) < total
      },
    });

  } catch (error) {
    logger.error('Get notes operation failed', error, {
      userId: req.user?.id,
      search: req.query?.search,
      page: req.query?.page,
      limit: req.query?.limit
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single note (UPDATED: Allow shared notes)
const getNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.debug('Fetching single note', { userId, noteId: id });

    //Check if user can access note (owner OR shared)
    const note = await prisma.note.findFirst({
      where: {
        id,
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
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        attachments: true,
        sharedNotes: {
          where: {
            sharedWithUserId: userId
          },
          select: {
            permission: true,
            sharedAt: true
          }
        },
        userPreferences: {
          where: { userId },
          select: { isFavorite: true, personalTags: true }
        }

      },
    });

    if (!note) {
      logger.warn('Get note failed - not found or access denied', { userId, noteId: id });
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    // Determine permissions
    const isOwner = note.userId === userId;
    const sharedInfo = note.sharedNotes[0];

    // Process note to handle JSON aiTags and add permissions
    let parsedAiTags = [];
    try {
      if (note.aiTags) {
        parsedAiTags = JSON.parse(note.aiTags);
      }
    } catch (parseError) {
      logger.warn('Failed to parse aiTags for single note', { noteId: id, aiTags: note.aiTags });
      parsedAiTags = [];
    }

    const processedNote = {
      ...note,
      aiTags: parsedAiTags,
      permissions: {
        isOwner: isOwner,
        canEdit: isOwner || (sharedInfo && sharedInfo.permission === 'EDIT'),
        canDelete: isOwner,
        permissionLevel: isOwner ? 'OWNER' : (sharedInfo ? sharedInfo.permission : 'NONE'),
        sharedAt: sharedInfo ? sharedInfo.sharedAt : null
      }
    };

    logger.info('Single note retrieved successfully', {
      userId,
      noteId: id,
      isOwner,
      canEdit: processedNote.permissions.canEdit
    });

    res.json({ note: processedNote });

  } catch (error) {
    logger.error('Get single note operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = req.user.id;

    logger.debug('Updating note', {
      userId,
      noteId: id,
      titleProvided: !!title,
      contentLength: content?.length
    });

    //  Check if user can edit note (owner OR has EDIT permission)
    const canEdit = await canEditNote(userId, id);
    
    if (!canEdit) {
      logger.warn('Update note failed - no edit permission', { userId, noteId: id });
      return res.status(403).json({ error: 'You do not have permission to edit this note' });
    }

    // Get existing note to check content changes
    const existingNote = await prisma.note.findFirst({
      where: { id }
    });

    if (!existingNote) {
      logger.warn('Update note failed - note not found', { userId, noteId: id });
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check if content changed significantly
    const contentChanged = content && content !== existingNote.content;
    const needsAIProcessing = contentChanged && content.length > 50;

    // Update note immediately without waiting for AI
    const updateData = {
      ...(title && { title }),
      ...(content && { content }),
      // Don't update AI fields here - will be done in background if needed
    };

    const updatedNote = await prisma.note.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        attachments: true
      },
    });

    // Process note to handle JSON aiTags
    let parsedAiTags = [];
    try {
      if (updatedNote.aiTags) {
        parsedAiTags = JSON.parse(updatedNote.aiTags);
      }
    } catch (parseError) {
      logger.warn('Failed to parse aiTags during update', { noteId: id });
      parsedAiTags = [];
    }

    const processedNote = {
      ...updatedNote,
      aiTags: parsedAiTags
    };

    logger.info('Note updated successfully', {
      userId,
      noteId: id,
      contentChanged,
      needsAIProcessing
    });

    res.json({
      message: 'Note updated successfully',
      note: processedNote,
      aiProcessing: needsAIProcessing,
    });

    // Process AI in background if content changed significantly
    if (needsAIProcessing) {
      setTimeout(async () => {
        try {
          logger.debug('Starting background AI reprocessing', { noteId: id });

          const [aiSummary, aiTags] = await Promise.all([
            aiService.summarizeContent(content),
            aiService.suggestTags(content)
          ]);

          await prisma.note.update({
            where: { id },
            data: {
              aiSummary,
              aiTags: JSON.stringify(aiTags)
            }
          });

          logger.info('Background AI reprocessing completed', {
            noteId: id,
            summaryLength: aiSummary?.length,
            tagsCount: aiTags?.length
          });
        } catch (aiError) {
          logger.error('Background AI update failed', aiError, { noteId: id });
        }
      }, 100);
    }

  } catch (error) {
    logger.error('Update note operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.id,
      title: req.body?.title,
      contentLength: req.body?.content?.length
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete note with automatic revoke
const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.debug('Deleting note', { userId, noteId: id });

    // Check if note exists and belongs to user
    const existingNote = await prisma.note.findFirst({
      where: { id, userId },
      include: {
        sharedNotes: {
          include: {
            sharedWith: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        },
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        }
      }
    });

    if (!existingNote) {
      logger.warn('Delete note failed - not found or no permission', { userId, noteId: id });
      return res.status(404).json({ error: 'Note not found or you do not have permission to delete' });
    }

    // Get all users this note is shared with
    const sharedWithUsers = existingNote.sharedNotes.map(share => ({
      userId: share.sharedWith.id,
      user: share.sharedWith
    }));

    //  Delete all sharing records AND note in transaction
    await prisma.$transaction(async (tx) => {
      // Delete all shared note records
      await tx.sharedNote.deleteMany({
        where: { noteId: id }
      });

      // Delete the note
      await tx.note.delete({
        where: { id },
      });
    });

    logger.info('Note deleted successfully', {
      userId,
      noteId: id,
      noteTitle: existingNote.title,
      revokedAccessCount: sharedWithUsers.length
    });

    //  Return shared users info so frontend can handle notifications
    res.json({
      message: 'Note deleted successfully',
      revokedAccessCount: sharedWithUsers.length,
      sharedUsers: sharedWithUsers, // Send to frontend
      noteTitle: existingNote.title,
      deletedBy: {
        name: existingNote.user.name,
        email: existingNote.user.email
      }
    });

  } catch (error) {
    logger.error('Delete note operation failed', error, {
      userId: req.user?.id,
      noteId: req.params?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCollaborationHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.debug('Fetching collaboration history', { userId });

    const sharedNotes = await prisma.sharedNote.findMany({
      where: {
        note: {
          userId: userId // I am the owner
        }
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true
          }
        },
        note: {
          select: {
            title: true,
            createdAt: true
          }
        }
      },
      orderBy: { sharedAt: 'desc' }
    });

    const collaboratorsMap = new Map();

    sharedNotes.forEach(share => {
      const collaborator = share.sharedWith;
      if (!collaborator) return;

      const collaboratorId = collaborator.id;

      if (!collaboratorsMap.has(collaboratorId)) {
        collaboratorsMap.set(collaboratorId, {
          id: collaborator.id,
          name: collaborator.name,
          email: collaborator.email,
          avatarUrl: collaborator.avatarUrl,
          joinedDate: collaborator.createdAt,
          collaborationCount: 1,
          lastCollaborated: share.sharedAt,
          lastNoteTitle: share.note.title,
          firstCollaboration: share.sharedAt
        });
      } else {
        const existing = collaboratorsMap.get(collaboratorId);
        existing.collaborationCount += 1;

        // Update last collaboration
        if (new Date(share.sharedAt) > new Date(existing.lastCollaborated)) {
          existing.lastCollaborated = share.sharedAt;
          existing.lastNoteTitle = share.note.title;
        }

        // Update first collaboration (earliest)
        if (new Date(share.sharedAt) < new Date(existing.firstCollaboration)) {
          existing.firstCollaboration = share.sharedAt;
        }
      }
    });

    const collaborators = Array.from(collaboratorsMap.values())
      .sort((a, b) => new Date(b.lastCollaborated) - new Date(a.lastCollaborated));

    logger.info('Collaboration history retrieved successfully', {
      userId,
      collaboratorCount: collaborators.length,
      totalShares: sharedNotes.length
    });

    res.json({
      collaborators,
      totalCount: collaborators.length
    });

  } catch (error) {
    logger.error('Get collaboration history operation failed', error, {
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to fetch collaboration history',
      details: error.message
    });
  }
};

const getNotesSharedByMe = async (req, res) => {
  try {
    const userId = req.user.id; // Current user ID

    logger.debug('Fetching notes shared by user', { userId });

    const sharedNotes = await prisma.sharedNote.findMany({
      where: {
        note: {
          userId: userId //  Notes where I'm the owner!
        }
      },
      include: {
        note: {
          include: {
            user: { //  Get note owner info (which is ME!)
              select: { id: true, name: true, email: true, avatarUrl: true }
            },
          }
        },
        sharedWith: { //  Get who I shared with
          select: { id: true, name: true, email: true, avatarUrl: true }
        }
      }
    });

    logger.info('Notes shared by user retrieved successfully', {
      userId,
      sharedCount: sharedNotes.length
    });

    res.json({
      sharedByMeCount: sharedNotes.length,
      sharedNotes: sharedNotes
    });

  } catch (error) {
    logger.error('Get notes shared by me operation failed', error, {
      userId: req.user?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
  canAccessNote,
  canEditNote,
  getCollaborationHistory,
  getNotesSharedByMe
};