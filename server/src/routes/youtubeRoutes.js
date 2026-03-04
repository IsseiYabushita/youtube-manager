const express = require('express');
const router = express.Router();
const { searchVideos } = require('../controllers/youtubeController');
const authMiddleware = require('../middleware/auth');

router.get('/search', authMiddleware, searchVideos);

module.exports = router;