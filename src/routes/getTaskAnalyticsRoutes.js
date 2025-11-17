const express = require('express');
const { getTaskAnalytics } = require("../controllers/getTaskAnalytics")
const authMiddleware = require("../middleware/authMiddleware")


const router = express.Router();

router.get('/analytics', authMiddleware, getTaskAnalytics);

module.exports = router