const rateLimit = require('express-rate-limit');

// GENERAL API LIMIT - for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit headers
});
//  STRICT AUTH LIMIT - for login/signup (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many login attempts, please try again after 15 minutes.'
  },
  skipSuccessfulRequests: true, // Don't count successful logins
});

// AI SERVICE LIMIT - AI calls are expensive
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // Limit each IP to 20 AI requests per windowMs
  message: {
    error: 'Too many AI requests, please try again later.'
  },
});

//  NOTE CREATION LIMIT - prevent spam
const noteCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 50 note creations per windowMs
  message: {
    error: 'Too many notes created, please slow down.'
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  aiLimiter,
  noteCreationLimiter
};