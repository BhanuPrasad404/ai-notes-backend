const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

// Add or update reaction
const addReaction = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    logger.debug('Adding reaction to comment', {
      userId,
      commentId,
      emoji
    });

    // Validate emoji
    const validEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    if (!validEmojis.includes(emoji)) {
      logger.warn('Invalid emoji reaction attempted', { userId, commentId, emoji });
      return res.status(400).json({ error: 'Invalid emoji' });
    }

    // Check if comment exists
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: { task: true }
    });

    if (!comment) {
      logger.warn('Reaction failed - comment not found', { userId, commentId });
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user has access to the task
    const canAccess = await prisma.task.findFirst({
      where: {
        id: comment.taskId,
        OR: [
          { userId },
          {
            sharedTasks: {
              some: { sharedWithUserId: userId }
            }
          }
        ]
      }
    });

    if (!canAccess) {
      logger.warn('Reaction failed - no access to task', { userId, commentId, taskId: comment.taskId });
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Upsert reaction (add or update)
    const reaction = await prisma.reaction.upsert({
      where: {
        commentId_userId_emoji: {
          commentId,
          userId,
          emoji
        }
      },
      update: {
        emoji, // Update emoji if exists
        updatedAt: new Date()
      },
      create: {
        emoji,
        commentId,
        userId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Get updated reaction counts
    const reactionCounts = await prisma.reaction.groupBy({
      by: ['emoji'],
      where: { commentId },
      _count: {
        emoji: true
      }
    });

    // Get all reactions for this comment
    const allReactions = await prisma.reaction.findMany({
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

    logger.info('Reaction added successfully', {
      userId,
      commentId,
      emoji,
      taskId: comment.taskId,
      isUpdate: reaction.updatedAt > reaction.createdAt
    });

    // Send real-time update
    const socketService = require('../lib/socketIO');
    const io = socketService.getIO();

    io.to(`task-${comment.taskId}`).emit('reaction-updated', {
      commentId,
      reaction,
      action: 'added',
      reactionCounts: reactionCounts.reduce((acc, curr) => {
        acc[curr.emoji] = curr._count.emoji;
        return acc;
      }, {}),
      allReactions
    });

    res.json({
      message: 'Reaction added successfully',
      reaction,
      reactionCounts: reactionCounts.reduce((acc, curr) => {
        acc[curr.emoji] = curr._count.emoji;
        return acc;
      }, {})
    });

  } catch (error) {
    logger.error('Failed to add reaction', error, {
      userId: req.user?.id,
      commentId: req.params?.commentId,
      emoji: req.body?.emoji
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove reaction
const removeReaction = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    logger.debug('Removing reaction from comment', {
      userId,
      commentId,
      emoji
    });

    // Check if reaction exists
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        commentId_userId_emoji: {
          commentId,
          userId,
          emoji
        }
      },
      include: {
        comment: {
          include: { task: true }
        }
      }
    });

    if (!existingReaction) {
      logger.warn('Remove reaction failed - reaction not found', { userId, commentId, emoji });
      return res.status(404).json({ error: 'Reaction not found' });
    }

    // Delete reaction
    await prisma.reaction.delete({
      where: {
        commentId_userId_emoji: {
          commentId,
          userId,
          emoji
        }
      }
    });

    // Get updated reaction counts
    const reactionCounts = await prisma.reaction.groupBy({
      by: ['emoji'],
      where: { commentId },
      _count: {
        emoji: true
      }
    });

    // Get all reactions for this comment
    const allReactions = await prisma.reaction.findMany({
      where: { commentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    logger.info('Reaction removed successfully', {
      userId,
      commentId,
      emoji,
      taskId: existingReaction.comment.taskId
    });

    // Send real-time update
    const socketService = require('../lib/socketIO');
    const io = socketService.getIO();

    io.to(`task-${existingReaction.comment.taskId}`).emit('reaction-updated', {
      commentId,
      reaction: existingReaction,
      action: 'removed',
      reactionCounts: reactionCounts.reduce((acc, curr) => {
        acc[curr.emoji] = curr._count.emoji;
        return acc;
      }, {}),
      allReactions
    });

    res.json({
      message: 'Reaction removed successfully',
      reactionCounts: reactionCounts.reduce((acc, curr) => {
        acc[curr.emoji] = curr._count.emoji;
        return acc;
      }, {})
    });

  } catch (error) {
    logger.error('Failed to remove reaction', error, {
      userId: req.user?.id,
      commentId: req.params?.commentId,
      emoji: req.body?.emoji
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get comment reactions
const getCommentReactions = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    logger.debug('Fetching comment reactions', { userId, commentId });

    // Check if user has access to the comment's task
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: { task: true }
    });

    if (!comment) {
      logger.warn('Get reactions failed - comment not found', { userId, commentId });
      return res.status(404).json({ error: 'Comment not found' });
    }

    const canAccess = await prisma.task.findFirst({
      where: {
        id: comment.taskId,
        OR: [
          { userId },
          {
            sharedTasks: {
              some: { sharedWithUserId: userId }
            }
          }
        ]
      }
    });

    if (!canAccess) {
      logger.warn('Get reactions failed - no access to task', { userId, commentId, taskId: comment.taskId });
      return res.status(403).json({ error: 'No access to this task' });
    }

    // Get reaction counts
    const reactionCounts = await prisma.reaction.groupBy({
      by: ['emoji'],
      where: { commentId },
      _count: {
        emoji: true
      }
    });

    // Get all reactions with user info
    const reactions = await prisma.reaction.findMany({
      where: { commentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    logger.info('Comment reactions retrieved successfully', {
      userId,
      commentId,
      reactionCount: reactions.length,
      uniqueEmojis: reactionCounts.length
    });

    res.json({
      reactionCounts: reactionCounts.reduce((acc, curr) => {
        acc[curr.emoji] = curr._count.emoji;
        return acc;
      }, {}),
      reactions
    });

  } catch (error) {
    logger.error('Failed to get comment reactions', error, {
      userId: req.user?.id,
      commentId: req.params?.commentId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  addReaction,
  removeReaction,
  getCommentReactions
};