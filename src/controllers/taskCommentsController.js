const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

// Get all comments for a task
const getTaskComments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    logger.debug('Fetching task comments', { userId, taskId });

    // Check if user has access to this task
    const canAccess = await canAccessTask(userId, taskId);
    if (!canAccess) {
      logger.warn('Get comments failed - no task access', { userId, taskId });
      return res.status(403).json({ error: 'No access to this task' });
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        reactions: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
        fileAttachments: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },

      },
      orderBy: {
        createdAt: 'asc', // Oldest first for conversation flow
      },
    });

    // Transform comments to include reaction summary
    const commentsWithReactions = comments.map(comment => {
      // Calculate reaction counts per emoji
      const reactionSummary = comment.reactions.reduce((acc, reaction) => {
        acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
        return acc;
      }, {});

      const repliedTo = comment.repliedToCommentId ? {
        id: comment.repliedToCommentId,
        content: comment.repliedToContent,
        user: {
          id: comment.repliedToUserId,
          name: comment.repliedToUserName,
          email: comment.repliedToUserEmail
        },
        createdAt: comment.repliedToCreatedAt


      } : null

      return {
        ...comment,
        reactionSummary,
        repliedTo,
        repliedToFileAttachments: comment.repliedToFileAttachments || []
      };
    });

    logger.info('Task comments retrieved successfully', {
      userId,
      taskId,
      commentCount: comments.length
    });

    res.json({
      message: 'Comments retrieved successfully',
      comments: commentsWithReactions,
      count: comments.length,
    });
  } catch (error) {
    logger.error('Get task comments operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.taskId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new comment
const createTaskComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content, repliedToCommentId, fileIds = [] } = req.body;
    const userId = req.user.id;

    logger.debug('Creating task comment', {
      userId,
      taskId,
      contentLength: content?.length,
      repliedToCommentId,
      fileCount: fileIds.length
    });

    // Allow empty content if files exist
    if (!content?.trim() && fileIds.length === 0) {
      logger.warn('Create comment failed - content or file required', { userId, taskId });
      return res.status(400).json({
        error: 'Message content or file is required'
      });
    }

    // Check task access
    const canAccess = await canAccessTask(userId, taskId);
    if (!canAccess) {
      logger.warn('Create comment failed - no task access', { userId, taskId });
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Handle reply logic
    let repliedToData = null;
    if (repliedToCommentId) {
      repliedToData = await prisma.taskComment.findFirst({
        where: {
          id: repliedToCommentId,
          taskId: taskId
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          fileAttachments: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true }
              }
            }
          }
        }
      });

      if (!repliedToData) {
        logger.warn('Create comment failed - replied to comment not found', {
          userId,
          taskId,
          repliedToCommentId
        });
        return res.status(400).json({ error: 'Original comment not found' });
      }
    }

    // Create the comment
    const comment = await prisma.taskComment.create({
      data: {
        content: content?.trim() || '',
        taskId,
        userId,
        ...(repliedToData && {
          repliedToCommentId: repliedToData.id,
          repliedToContent: repliedToData.content,
          repliedToUserId: repliedToData.user.id,
          repliedToUserName: repliedToData.user.name,
          repliedToUserEmail: repliedToData.user.email,
          repliedToCreatedAt: repliedToData.createdAt,
          repliedToFileAttachments: repliedToData.fileAttachments
        })
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
        fileAttachments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        }
      }
    });

    logger.debug('Task comment created', {
      userId,
      taskId,
      commentId: comment.id,
      isReply: !!repliedToCommentId
    });

    // Link files to this comment
    if (fileIds.length > 0) {
      logger.debug('Linking files to comment', {
        commentId: comment.id,
        fileCount: fileIds.length
      });

      await prisma.fileAttachment.updateMany({
        where: {
          id: { in: fileIds },
          userId: userId // Security: user can only link their own files
        },
        data: {
          commentId: comment.id
        }
      });

      // Reload comment with attached files
      const updatedComment = await prisma.taskComment.findUnique({
        where: { id: comment.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          fileAttachments: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true }
              }
            }
          }
        }
      });

      logger.info('Task comment created with files', {
        userId,
        taskId,
        commentId: comment.id,
        fileCount: updatedComment.fileAttachments.length
      });

      const responseComment = {
        ...updatedComment,
        repliedTo: repliedToData ? {
          id: repliedToData.id,
          content: repliedToData.content,
          user: repliedToData.user,
          createdAt: repliedToData.createdAt
        } : null
      };

      return res.status(201).json({
        message: 'Message sent successfully',
        comment: responseComment,
      });
    }

    const responseComment = {
      ...comment,
      repliedTo: repliedToData ? {
        id: repliedToData.id,
        content: repliedToData.content,
        user: repliedToData.user,
        createdAt: repliedToData.createdAt
      } : null
    };

    logger.info('Task comment created successfully', {
      userId,
      taskId,
      commentId: comment.id,
      contentLength: content?.length
    });

    res.status(201).json({
      message: 'Message sent successfully',
      comment: responseComment,
    });

  } catch (error) {
    logger.error('Create task comment operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.taskId,
      contentLength: req.body?.content?.length
    });
    res.status(500).json({
      error: 'Failed to send message: ' + error.message
    });
  }
};

// Update a comment (only by owner)
const updateTaskComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    logger.debug('Updating task comment', { userId, commentId, contentLength: content?.length });

    // Validation
    if (!content || !content.trim()) {
      logger.warn('Update comment failed - content required', { userId, commentId });
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Find comment and check ownership
    const existingComment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        userId: userId // Only owner can update
      },
    });

    if (!existingComment) {
      logger.warn('Update comment failed - not found or no permission', { userId, commentId });
      return res.status(404).json({ error: 'Comment not found or no permission' });
    }

    // Update comment (only within 5 minutes of creation)
    const timeDiff = Date.now() - existingComment.createdAt.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (timeDiff > fiveMinutes) {
      logger.warn('Update comment failed - edit window expired', {
        userId,
        commentId,
        timeDiff: Math.round(timeDiff / 1000 / 60) + ' minutes'
      });
      return res.status(400).json({ error: 'Comments can only be edited within 5 minutes of creation' });
    }

    const updatedComment = await prisma.taskComment.update({
      where: { id: commentId },
      data: {
        content: content.trim(),
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

    logger.info('Task comment updated successfully', {
      userId,
      commentId,
      taskId: existingComment.taskId
    });

    res.json({
      message: 'Comment updated successfully',
      comment: updatedComment,
    });

  } catch (error) {
    logger.error('Update task comment operation failed', error, {
      userId: req.user?.id,
      commentId: req.params?.commentId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a comment (only by owner)
const deleteTaskComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    logger.debug('Deleting task comment', { userId, commentId });

    // Find comment and check ownership
    const existingComment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        userId: userId // Only owner can delete
      },
    });

    if (!existingComment) {
      logger.warn('Delete comment failed - not found or no permission', { userId, commentId });
      return res.status(404).json({ error: 'Comment not found or no permission' });
    }

    // Delete comment (only within 5 minutes of creation)
    const timeDiff = Date.now() - existingComment.createdAt.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (timeDiff > fiveMinutes) {
      logger.warn('Delete comment failed - delete window expired', {
        userId,
        commentId,
        timeDiff: Math.round(timeDiff / 1000 / 60) + ' minutes'
      });
      return res.status(400).json({ error: 'Comments can only be deleted within 5 minutes of creation' });
    }

    await prisma.taskComment.delete({
      where: { id: commentId },
    });

    logger.info('Task comment deleted successfully', {
      userId,
      commentId,
      taskId: existingComment.taskId
    });

    res.json({
      message: 'Comment deleted successfully',
    });

  } catch (error) {
    logger.error('Delete task comment operation failed', error, {
      userId: req.user?.id,
      commentId: req.params?.commentId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to check task access (reuse from your existing code)
const canAccessTask = async (userId, taskId) => {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { userId }, // User is owner
        {
          sharedTasks: {
            some: {
              sharedWithUserId: userId // User has sharing access
            }
          }
        }
      ]
    }
  });
  return !!task;
};

module.exports = {
  getTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
};