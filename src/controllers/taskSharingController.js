const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

const { createActivity } = require('./activityController');

/**
 * Share a task with another user by email
 * @route POST /api/tasks/:id/share
 */
const shareTask = async (req, res) => {
  try {
    const { id: taskId } = req.params;
    const { sharedWithEmail, permission = 'VIEW' } = req.body;
    const userId = req.user.id; // User A (owner)

    logger.debug('Sharing task request', {
      userId,
      taskId,
      sharedWithEmail,
      permission
    });

    // Validation
    if (!sharedWithEmail) {
      logger.warn('Share task failed - email required', { userId, taskId });
      return res.status(400).json({ error: 'User email is required' });
    }

    // Check if permission is valid
    const validPermissions = ['VIEW', 'EDIT'];
    if (!validPermissions.includes(permission)) {
      logger.warn('Share task failed - invalid permission', { userId, taskId, permission });
      return res.status(400).json({ error: 'Invalid permission type' });
    }

    // Check if task exists and belongs to user
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: userId
      }
    });

    if (!task) {
      logger.warn('Share task failed - task not found or no permission', { userId, taskId });
      return res.status(404).json({ error: 'Task not found or you do not have permission' });
    }

    // Find the user to share with by email
    const userToShareWith = await prisma.user.findUnique({
      where: { email: sharedWithEmail }
    });

    if (!userToShareWith) {
      logger.warn('Share task failed - user not found', { userId, taskId, sharedWithEmail });
      return res.status(404).json({ error: 'User not found with this email' });
    }

    // Prevent sharing with yourself
    if (userToShareWith.id === userId) {
      logger.warn('Share task failed - cannot share with self', { userId, taskId });
      return res.status(400).json({ error: 'Cannot share task with yourself' });
    }

    // Check if already shared
    const existingShare = await prisma.sharedTask.findFirst({
      where: {
        taskId: taskId,
        sharedWithUserId: userToShareWith.id
      }
    });

    if (existingShare) {
      logger.warn('Share task failed - already shared', {
        userId,
        taskId,
        sharedWithUserId: userToShareWith.id
      });
      return res.status(400).json({ error: 'Task is already shared with this user' });
    }

    // Create the sharing record
    const sharedTask = await prisma.sharedTask.create({
      data: {
        taskId: taskId,
        sharedWithUserId: userToShareWith.id,
        permission: permission
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        task: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    logger.info('Task shared successfully', {
      userId,
      taskId,
      sharedWithUserId: userToShareWith.id,
      sharedWithEmail: userToShareWith.email,
      permission
    });

    const activity = await createActivity({
      userId: userToShareWith.id,
      type: 'TASK_SHARED',
      actorId: req.user.id,
      actorName: req.user.name,
      targetType: 'TASK',
      targetId: taskId,
      targetTitle: task.title,
      message: `${req.user.name} shared task "${task.title}" with you`,
      metadata: { permission }
    });

    const io = require('../lib/socketIO').getIO();
    io.to(`user-${userToShareWith.id}`).emit('new-notification', {
      type: 'TASK_SHARED',
      activity: activity,
      message: `${req.user.name} shared "${task.title}" with you`,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Task shared successfully',
      sharedTask: {
        id: sharedTask.id,
        task: sharedTask.task,
        sharedWith: sharedTask.sharedWith,
        permission: sharedTask.permission,
        sharedAt: sharedTask.sharedAt
      }
    });

  } catch (error) {
    logger.error('Share task operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.id,
      sharedWithEmail: req.body?.sharedWithEmail
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Revoke sharing access for a user
 * @route DELETE /api/tasks/:id/share/:userId
 */
const revokeTaskShare = async (req, res) => {
  try {
    const { id: taskId, userId: sharedWithUserId } = req.params;
    const userId = req.user.id; // User A (owner)

    logger.debug('Revoking task share', {
      userId,
      taskId,
      sharedWithUserId
    });

    // Check if task exists and belongs to user
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: userId
      }
    });

    if (!task) {
      logger.warn('Revoke task share failed - task not found or no permission', {
        userId,
        taskId,
        sharedWithUserId
      });
      return res.status(404).json({ error: 'Task not found or you do not have permission' });
    }

    // Find and delete the sharing record
    const deletedShare = await prisma.sharedTask.deleteMany({
      where: {
        taskId: taskId,
        sharedWithUserId: sharedWithUserId
      }
    });

    if (deletedShare.count === 0) {
      logger.warn('Revoke task share failed - sharing record not found', {
        userId,
        taskId,
        sharedWithUserId
      });
      return res.status(404).json({ error: 'Sharing record not found' });
    }

    logger.info('Task share revoked successfully', {
      userId,
      taskId,
      sharedWithUserId,
      taskTitle: task.title
    });

    const activity = await createActivity({
      userId: sharedWithUserId,
      type: 'TASK_ACCESS_REVOKED',
      actorId: req.user.id,
      actorName: req.user.name,
      targetType: 'TASK',
      targetId: taskId,
      targetTitle: task.title,
      message: `${req.user.name} revoked your access to task "${task.title}"`,
      metadata: { permission: 'REVOKED' }
    });

    const io = require('../lib/socketIO').getIO();
    io.to(`user-${sharedWithUserId}`).emit('new-notification', {
      type: 'TASK_ACCESS_REVOKED',
      activity: activity,
      message: `${req.user.name} revoked your access to task "${task.title}"`,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Sharing access revoked successfully'
    });

  } catch (error) {
    logger.error('Revoke task share operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.id,
      sharedWithUserId: req.params?.userId
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Bulk revoke task shares
 * @route POST /api/tasks/bulk-revoke-shares
 */
const bulkRevokeTaskShares = async (req, res) => {
  try {
    const { shareIds } = req.body; // Array of sharedTask IDs
    const userId = req.user.id;

    logger.debug('Bulk revoking task shares', {
      userId,
      shareCount: shareIds?.length
    });

    if (!shareIds || !Array.isArray(shareIds) || shareIds.length === 0) {
      logger.warn('Bulk revoke task shares failed - invalid share IDs', { userId });
      return res.status(400).json({ error: 'Share IDs array is required' });
    }

    // Verify user owns these shares and delete in one query
    const deletedShares = await prisma.sharedTask.deleteMany({
      where: {
        id: { in: shareIds },
        task: {
          userId: userId // Ensure user owns the tasks
        }
      }
    });

    logger.info('Bulk task shares revoked successfully', {
      userId,
      requestedCount: shareIds.length,
      actualCount: deletedShares.count
    });

    res.json({
      message: `Successfully revoked ${deletedShares.count} share(s)`,
      revokedCount: deletedShares.count
    });

  } catch (error) {
    logger.error('Bulk revoke task shares operation failed', error, {
      userId: req.user?.id,
      shareCount: req.body?.shareIds?.length
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  shareTask,
  revokeTaskShare,
  bulkRevokeTaskShares
};