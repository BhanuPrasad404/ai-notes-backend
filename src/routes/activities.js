// routes/activities.js
const express = require('express');
const router = express.Router();
const { getRecentActivities, markAsRead, markAllAsRead } = require('../controllers/activityController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', authMiddleware, getRecentActivities);
router.patch('/:activityId/read', authMiddleware, markAsRead);
router.patch('/mark-all-read', authMiddleware, markAllAsRead);

module.exports = router;