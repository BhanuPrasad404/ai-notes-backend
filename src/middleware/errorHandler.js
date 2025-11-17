const logger = require('../utils/logger');

const errorHandler = (error, req, res, next) => {
  // Log error with context
  logger.error('Unhandled Error', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    user: req.user ? { id: req.user.id, email: req.user.email } : 'unauthenticated',
    body: req.body,
    query: req.query,
    params: req.params
  });

  // Send appropriate response to client
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details
    });
  }

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      error: 'Database error'
    });
  }

  // Generic error (don't leak details in production)
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
};

module.exports = errorHandler;