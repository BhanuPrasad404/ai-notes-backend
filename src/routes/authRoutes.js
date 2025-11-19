const express = require('express');
const { signup, login, googleLogin, forgotPassword, resetPassword } = require('../controllers/authController');
const { validateSignup, validateLogin, handleValidationErrors } = require('../middleware/validation');
const authMiddleware = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); 

const router = express.Router();

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User created successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
 *       400:
 *         description: Validation error
 */
router.post('/signup', validateSignup, handleValidationErrors, signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
 *       400:
 *         description: Invalid credentials
 */
router.post('/login', validateLogin, handleValidationErrors, login);
router.post('/google', googleLogin);
router.post("/reset-password", resetPassword);
router.post("/forgot-password", forgotPassword);

// Add this route to your existing authRoutes.js
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                createdAt: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add these to your authRoutes.js for testing

// Test email service directly
router.post('/test-email-service', async (req, res) => {
    try {
        const { email } = req.body;

        logger.info('Testing email service', {
            testEmail: email,
            hasResendKey: !!process.env.RESEND_API_KEY
        });

        if (!email) {
            return res.status(400).json({ error: 'Email is required for test' });
        }

        const emailResult = await sendEmail(
            email,
            'Test Email from AI Notes Backend',
            `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Test Email</h2>
        <p>If you receive this, the email service is working!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </div>
      `
        );

        logger.info('Email test result', {
            success: emailResult.success,
            error: emailResult.error,
            messageId: emailResult.data?.id
        });

        res.json({
            success: emailResult.success,
            error: emailResult.error,
            messageId: emailResult.data?.id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Email test failed', error, { email: req.body?.email });
        res.status(500).json({ error: error.message });
    }
});

// Check environment configuration
router.get('/debug-config', (req, res) => {
    const config = {
        hasResendApiKey: !!process.env.RESEND_API_KEY,
        resendKeyLength: process.env.RESEND_API_KEY?.length,
        nodeEnv: process.env.NODE_ENV,
        backendUrl: process.env.BACKEND_URL,
        timestamp: new Date().toISOString()
    };

    logger.info('Debug configuration check', config);

    res.json(config);
});


module.exports = router;