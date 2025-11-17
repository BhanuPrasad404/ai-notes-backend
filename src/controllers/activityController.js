const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

// Get recent activities for current user
const getRecentActivities = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 10 } = req.query;

        logger.debug('Fetching recent activities', {
            userId,
            limit: parseInt(limit)
        });

        const activities = await prisma.activity.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            select: {
                id: true,
                type: true,
                actorName: true,
                targetType: true,
                targetTitle: true,
                message: true,
                metadata: true,
                read: true,
                createdAt: true
            }
        });

        const unreadCount = activities.filter(a => !a.read).length;

        logger.info('Activities retrieved successfully', {
            userId,
            activityCount: activities.length,
            unreadCount
        });

        res.json({
            activities,
            total: activities.length,
            unreadCount
        });

    } catch (error) {
        logger.error('Failed to fetch activities', error, {
            userId: req.user?.id,
            limit: req.query.limit
        });
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
};

// Create activity (internal function - called by other controllers)
const createActivity = async (activityData) => {
    try {
        const {
            userId,        // Who this activity is for
            type,          // Activity type
            actorId,       // Who did the action
            actorName,     // Who did the action (name)
            targetType,    // 'NOTE' or 'TASK'
            targetId,      // Note/Task ID
            targetTitle,   // Note/Task title
            message,       // Human readable message
            metadata = {}  // Extra data
        } = activityData;

        logger.debug('Creating activity', {
            userId,
            type,
            actorId,
            targetType,
            targetId
        });

        const activity = await prisma.activity.create({
            data: {
                userId,
                type,
                actorId,
                actorName,
                targetType,
                targetId,
                targetTitle,
                message,
                metadata,
                read: false
            }
        });

        logger.info('Activity created successfully', {
            activityId: activity.id,
            userId,
            type,
            targetType
        });

        return activity;
    } catch (error) {
        logger.error('Failed to create activity', error, {
            userId: activityData?.userId,
            type: activityData?.type,
            targetId: activityData?.targetId
        });
        // Don't throw - activity creation shouldn't break main operations
    }
};

// Mark activity as read
const markAsRead = async (req, res) => {
    try {
        const { activityId } = req.params;
        const userId = req.user.id;

        logger.debug('Marking activity as read', {
            userId,
            activityId
        });

        const activity = await prisma.activity.updateMany({
            where: {
                id: activityId,
                userId // Ensure user can only mark their own activities
            },
            data: { read: true }
        });

        if (activity.count === 0) {
            logger.warn('Activity not found or access denied', {
                userId,
                activityId
            });
            return res.status(404).json({ error: 'Activity not found' });
        }

        logger.info('Activity marked as read', {
            userId,
            activityId
        });

        res.json({ message: 'Activity marked as read' });
    } catch (error) {
        logger.error('Failed to mark activity as read', error, {
            userId: req.user?.id,
            activityId: req.params.activityId
        });
        res.status(500).json({ error: 'Failed to mark activity as read' });
    }
};

// Mark all as read
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        logger.debug('Marking all activities as read', { userId });

        await prisma.activity.updateMany({
            where: {
                userId,
                read: false
            },
            data: { read: true }
        });

        logger.info('All activities marked as read', { userId });

        res.json({ message: 'All activities marked as read' });
    } catch (error) {
        logger.error('Failed to mark all activities as read', error, {
            userId: req.user?.id
        });
        res.status(500).json({ error: 'Failed to mark activities as read' });
    }
};

module.exports = {
    getRecentActivities,
    createActivity,     
    markAsRead,
    markAllAsRead
};