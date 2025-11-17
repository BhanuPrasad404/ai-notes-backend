// routes/profileRoutes.js
const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateName,
  updateEmail,
  changePassword,
  deleteAccount
} = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', getProfile);
router.patch('/name', updateName);
router.patch('/email', updateEmail);
router.patch('/password', changePassword);
router.delete('/account', deleteAccount);

module.exports = router;