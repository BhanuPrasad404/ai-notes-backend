// controllers/profileController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const { sendEmail } = require("../utils/emailService");
const logger = require('../utils/logger'); // Add this line

// Get user profile
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        logger.debug('Fetching user profile', { userId });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                createdAt: true,
            }
        });

        logger.info('User profile retrieved successfully', { userId });

        res.json({ user });
    } catch (error) {
        logger.error('Failed to fetch user profile', error, { userId: req.user?.id });
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

const updateName = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        logger.debug('Updating user name', { userId, nameLength: name?.length });

        if (!name || name.trim() === '') {
            logger.warn('Name update failed - name required', { userId });
            return res.status(400).json({ error: 'Name is required' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { name: name.trim() },
            select: { id: true, name: true, email: true, avatarUrl: true }
        });

        logger.info('User name updated successfully', {
            userId,
            oldName: req.user.name,
            newName: updatedUser.name
        });

        res.json({
            success: true,
            user: updatedUser,
            message: 'Name updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update user name', error, {
            userId: req.user?.id,
            name: req.body?.name
        });
        res.status(500).json({ error: 'Failed to update name' });
    }
};

// Update user email
const updateEmail = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.body;

        logger.debug('Updating user email', { userId, oldEmail: req.user.email, newEmail: email });

        if (!email || email.trim() === '') {
            logger.warn('Email update failed - email required', { userId });
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.trim() }
        });

        if (existingUser && existingUser.id !== userId) {
            logger.warn('Email update failed - email already in use', {
                userId,
                requestedEmail: email,
                existingUserId: existingUser.id
            });
            return res.status(400).json({ error: 'Email already in use' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { email: email.trim() },
            select: { id: true, name: true, email: true, avatarUrl: true }
        });

        logger.info('User email updated successfully', {
            userId,
            oldEmail: req.user.email,
            newEmail: updatedUser.email
        });

        res.json({
            success: true,
            user: updatedUser,
            message: 'Email updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update user email', error, {
            userId: req.user?.id,
            email: req.body?.email
        });
        res.status(500).json({ error: 'Failed to update email' });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        logger.debug('Changing user password', { userId });

        // Get user with password
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            logger.warn('Password change failed - incorrect current password', { userId });
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        logger.info('User password changed successfully', { userId });

        await sendEmail(
            user.email,
            "Password Changed Successfully",
            `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Password Updated</h2>
        <p>Hi <strong>${user.name || "there"}</strong>,</p>
        <p>Your password has been successfully changed. If this wasn't you, please reset it again immediately.</p>
        </div>
      `
        );

        logger.debug('Password change notification email sent', { userId, email: user.email });

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        logger.error('Failed to change user password', error, { userId: req.user?.id });
        res.status(500).json({ error: 'Failed to change password' });
    }
};

// Delete account
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        const userEmail = req.user.email;
        const userName = req.user.name;

        logger.warn('User account deletion requested', { userId, email: userEmail, name: userName });

        await prisma.$transaction(async (tx) => {
            // Delete all user data (your existing deletion logic)
            await tx.note.deleteMany({ where: { userId } });
            await tx.task.deleteMany({ where: { userId } });
            await tx.userNotePreferences.deleteMany({ where: { userId } });
            await tx.sharedNote.deleteMany({ where: { sharedWithUserId: userId } });
            await tx.project.deleteMany({ where: { userId } });
            await tx.fileAttachment.deleteMany({ where: { userId } });

            // Finally delete user
            await tx.user.delete({ where: { id: userId } });
        });

        logger.info('User account deleted successfully', { userId, email: userEmail, name: userName });

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        logger.error('Failed to delete user account', error, {
            userId: req.user?.id,
            email: req.user?.email
        });
        res.status(500).json({ error: 'Failed to delete account' });
    }
};

module.exports = {
    getProfile,
    updateName,
    updateEmail,
    changePassword,
    deleteAccount
};