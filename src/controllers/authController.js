const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { sendEmail } = require("../utils/emailService");
const crypto = require("crypto");
const logger = require('../utils/logger');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Signup Controller
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    logger.debug('Signup request received', {
      email,
      nameLength: name?.length,
      passwordLength: password?.length
    });

    // Validation checking the required Email and password because both needed to proceed
    if (!email || !password) {
      logger.warn('Signup validation failed', { hasEmail: !!email, hasPassword: !!password });
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists this is the most important part to acess the user 
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      logger.warn('User already exists during signup', { email });
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password with using the bycrpy.hash() where it  can be new version of it
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user if the exisisting user is not found then we can create one 
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        avatarUrl: null,
        authProvider: "local"
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true
      }
    });

    // Generate token 
    const token = generateToken(user.id);

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      authProvider: 'local'
    });

    await sendEmail(
      user.email,
      "🎉 Welcome to TaskFlow(IntelliSense)",
      `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111;">
    <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
      <h2 style="color: #2563eb;">Welcome to <span style="color:#111;">TaskFlow</span>!</h2>
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>We're thrilled to have you on board 🎉</p>
      <p>Your account has been successfully created. You can now start organizing your notes, managing tasks, and staying productive!</p>
      <a href="https://ai-notes-app-ebon.vercel.app/dashboard" 
         style="display: inline-block; background-color: #2563eb; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
        Go to Dashboard →
      </a>
      <hr style="margin-top: 20px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This email was sent by TaskFlow. Please don't reply directly to this message.</p>
    </div>
  </div>
  `
    );

    logger.debug('Welcome email sent', { userId: user.id, email: user.email });

    res.status(201).json({
      message: 'User created successfully',
      user,
      token
    });

  } catch (error) {
    logger.error('Signup operation failed', error, {
      email: req.body?.email,
      name: req.body?.name
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Login Controller
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.debug('Login attempt', { email });

    // Validation
    if (!email || !password) {
      logger.warn('Login validation failed', { hasEmail: !!email, hasPassword: !!password });
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      logger.warn('Login failed - user not found', { email });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn('Login failed - invalid password', { userId: user.id, email });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      authProvider: user.authProvider
    });

    await sendEmail(
      user.email,
      " Login Successful",
      `
  <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111;">
    <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
      <h2 style="color: #2563eb;">Login Alert </h2>
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>You've successfully logged in to your <strong>TaskFlow</strong> account.</p>
      <p>If this wasn't you, please <a href="https://ai-notes-app-ebon.vercel.app/reset-password" style="color:#2563eb; text-decoration:none;">reset your password</a> immediately.</p>
      <hr style="margin-top: 20px; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">This email was sent automatically for your security.</p>
    </div>
  </div>
  `
    );

    // Generate token
    const token = generateToken(user.id);

    // Return user data (without password)
    const userWithoutPassword = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt
    };

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    logger.error('Login operation failed', error, {
      email: req.body?.email
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Google Login Controller
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    logger.debug('Google login attempt', { tokenLength: credential?.length });


    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    let isNewUser = false;

    // Check if user exists with this email
    let user = await prisma.user.findUnique({
      where: { email: payload.email }
    });

    if (!user) {
      //  New Google user
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          name: payload.name,
          email: payload.email,
          avatarUrl: payload.picture,
          authProvider: 'google',
          googleId: payload.sub,
          password: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          authProvider: true,
          createdAt: true
        }
      });

      logger.info('New Google user registered', {
        userId: user.id,
        email: user.email,
        authProvider: 'google'
      });
    } else {
      // Existing user
      if (user.authProvider === 'local') {
        logger.warn('Google login conflict - email registered locally', {
          userId: user.id,
          email: user.email
        });
        return res.status(400).json({
          error: 'This email is already registered with email/password. Please login with your password instead.'
        });
      }

      // Update user info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          authProvider: 'google',
          googleId: payload.sub,
          avatarUrl: payload.picture,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          authProvider: true,
          createdAt: true
        }
      });

      logger.info('Existing user logged in via Google', {
        userId: user.id,
        email: user.email
      });
    }

    // Generate JWT token
    const jwtToken = generateToken(user.id);

    // Send email based on new or returning user
    if (isNewUser) {
      await sendEmail(
        user.email,
        "🎉 Welcome to TaskFlow (Google Login)",
        `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111;">
          <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #34a853;">Welcome to TaskFlow 👋</h2>
            <p>Hi <strong>${user.name}</strong>,</p>
            <p>We're excited to have you on board! You've successfully signed up using your Google account.</p>
            <a href="https://ai-notes-app-ebon.vercel.app/dashboard"
               style="display: inline-block; background-color: #2563eb; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Go to Dashboard →
            </a>
            <hr style="margin-top: 20px; border: none; border-top: 1px solid #e5e7eb;" />
            <p style="font-size: 12px; color: #6b7280;">This email was sent by TaskFlow automatically.</p>
          </div>
        </div>
        `
      );
    } else {
      await sendEmail(
        user.email,
        "🔐 Google Login Successful",
        `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111;">
          <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #34a853;">Google Login Alert </h2>
            <p>Hi <strong>${user.name}</strong>,</p>
            <p>You've successfully logged in using your Google account.</p>
            <p>If this wasn't you, please <a href="https://ai-notes-app-ebon.vercel.app/reset-password" style="color:#2563eb; text-decoration:none;">secure your account</a> immediately.</p>
            <hr style="margin-top: 20px; border: none; border-top: 1px solid #e5e7eb;" />
            <p style="font-size: 12px; color: #6b7280;">This is an automatic security notification from TaskFlow.</p>
          </div>
        </div>
        `
      );
    }

    logger.debug('Google login email sent', {
      userId: user.id,
      isNewUser,
      emailType: isNewUser ? 'welcome' : 'login_alert'
    });

    // Response
    res.json({
      message: isNewUser ? "Google signup successful" : "Google login successful",
      user,
      token: jwtToken
    });

  } catch (error) {
    logger.error('Google authentication failed', error, {
      tokenLength: req.body?.token?.length
    });

    res.status(400).json({ error: 'Google authentication failed' });
  }
};

const forgotPassword = async (req, res) => {
  console.log(' FORGOT PASSWORD STARTED');
  console.log('SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);

  try {
    const { email } = req.body;
    console.log(' Email received:', email);

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log('🔍 Searching for user:', email);
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        resetPasswordToken: true,
        resetPasswordExpiry: true
      }
    });

    if (!user) {
      console.log(' User not found');
      return res.json({ message: "If an account exists, a reset email has been sent" });
    }

    console.log('User found:', user.id);

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000);

    console.log('Token generated');

    // Save to database
    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: expiryTime,
      }
    });

    const resetUrl = `https://ai-notes-app-ebon.vercel.app/reset-password?token=${resetToken}&email=${email}`;
    console.log(' Reset URL:', resetUrl);

    // Send email
    console.log('Attempting to send email');
    const emailResult = await sendEmail(
      user.email,
      "Reset Your Password - TaskFlow",
      `<div>Reset link: ${resetUrl}</div>`
    );

    console.log(' Email result:', emailResult);

    if (emailResult.success) {
      return res.json({ message: "Password reset link sent to your email" });
    } else {
      return res.status(500).json({ error: "Failed to send email" });
    }

  } catch (error) {
    console.log(' ERROR:', error);
    console.log(' STACK:', error.stack);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    logger.debug('Reset password request', { tokenLength: token?.length, newPasswordLength: newPassword?.length });

    if (!token || !newPassword) {
      logger.warn('Reset password validation failed', { hasToken: !!token, hasNewPassword: !!newPassword });
      return res.status(400).json({ error: "Token and new password are required" });
    }

    // Hash the token before comparing with DB (same as how we stored it)
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with this reset token and not expired
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      logger.warn('Reset password failed - invalid or expired token', { token: hashedToken });
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    logger.info('Valid reset token found', { userId: user.id, email: user.email });

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    logger.info('Password reset successfully', { userId: user.id, email: user.email });

    // Send confirmation email
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

    logger.debug('Password reset confirmation email sent', { userId: user.id });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    logger.error('Reset password operation failed', error, {
      tokenLength: req.body?.token?.length
    });
    res.status(500).json({ error: "Something went wrong" });
  }
};

module.exports = { signup, login, googleLogin, forgotPassword, resetPassword };