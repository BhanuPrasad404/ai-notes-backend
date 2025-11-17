const { body, param, query, validationResult } = require('express-validator');

// Validation rules for each endpoint
const validateSignup = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2-50 characters')
    .escape(),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase, one uppercase, and one number')
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const validateNote = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1-255 characters')
    .escape(),

  body('content')
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage('Content too long (max 10000 characters)')
    .escape(),

  body('contentType')
    .optional()
    .isIn(['text', 'richText'])
    .withMessage('Content type must be text or richText')
];

const validateTask = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1-255 characters')
    .escape(),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description too long (max 1000 characters)')
    .escape(),

  body('status')
    .optional()
    .isIn(['TODO', 'IN_PROGRESS', 'DONE'])
    .withMessage('Status must be TODO, IN_PROGRESS, or DONE'),

  body('deadline')
    .optional()
    .isISO8601()
    .withMessage('Invalid deadline format')
];

const validateShare = [
  body('sharedWithEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),

  body('permission')
    .isIn(['VIEW', 'EDIT'])
    .withMessage('Permission must be VIEW or EDIT')
];

const validateAIRequest = [
  body('content')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Content must be between 10-5000 characters')
    .escape(),

  body('noteId')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Invalid note ID')
];

// Middleware to check validation results
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};
module.exports = {
  validateSignup,
  validateLogin,
  validateNote,
  validateTask,
  validateShare,
  validateAIRequest,
  handleValidationErrors
};