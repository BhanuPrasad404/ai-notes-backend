const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

const addSidebarTag = async (req, res) => {
    try {
        const userId = req.user.id;
        const { tag } = req.body;

        logger.debug('Adding sidebar tag', { userId, tag });

        if (!tag || tag.trim() === '') {
            logger.warn('Add sidebar tag failed - tag required', { userId });
            return res.status(400).json({ error: 'Tag is required' });
        }

        const cleanTag = tag.trim().toLowerCase();

        // Get current user with sidebar tags
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { sidebarTags: true }
        });

        // Check if tag already exists
        if (user.sidebarTags.includes(cleanTag)) {
            logger.warn('Add sidebar tag failed - tag already exists', { userId, tag: cleanTag });
            return res.status(400).json({ error: 'Tag already exists' });
        }

        // Add new tag
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                sidebarTags: { push: cleanTag }
            },
            select: { sidebarTags: true }
        });

        logger.info('Sidebar tag added successfully', {
            userId,
            tag: cleanTag,
            totalTags: updatedUser.sidebarTags.length
        });

        res.json({
            success: true,
            sidebarTags: updatedUser.sidebarTags,
            message: 'Tag added successfully'
        });

    } catch (error) {
        logger.error('Add sidebar tag operation failed', error, {
            userId: req.user?.id,
            tag: req.body?.tag
        });
        res.status(500).json({ error: 'Failed to add tag' });
    }
};

// Remove tag from user's sidebar
const removeSidebarTag = async (req, res) => {
    try {
        const userId = req.user.id;
        const { tag } = req.body;

        logger.debug('Removing sidebar tag', { userId, tag });

        // Get current user with sidebar tags
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { sidebarTags: true }
        });

        // Remove tag from array
        const updatedTags = user.sidebarTags.filter(t => t !== tag);

        // Update user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                sidebarTags: updatedTags
            },
            select: { sidebarTags: true }
        });

        logger.info('Sidebar tag removed successfully', {
            userId,
            tag,
            totalTags: updatedUser.sidebarTags.length
        });

        res.json({
            success: true,
            sidebarTags: updatedUser.sidebarTags,
            message: 'Tag removed successfully'
        });

    } catch (error) {
        logger.error('Remove sidebar tag operation failed', error, {
            userId: req.user?.id,
            tag: req.body?.tag
        });
        res.status(500).json({ error: 'Failed to remove tag' });
    }
};

// Get user's sidebar tags
const getSidebarTags = async (req, res) => {
    try {
        const userId = req.user.id;

        logger.debug('Fetching sidebar tags', { userId });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { sidebarTags: true }
        });

        logger.info('Sidebar tags retrieved successfully', {
            userId,
            tagCount: user.sidebarTags.length
        });

        res.json({ sidebarTags: user.sidebarTags });

    } catch (error) {
        logger.error('Get sidebar tags operation failed', error, {
            userId: req.user?.id
        });
        res.status(500).json({ error: 'Failed to get tags' });
    }
};

module.exports = {
    addSidebarTag, removeSidebarTag, getSidebarTags
}