const express = require('express');
const router = express.Router();
const { saveVideo, getVideos, updateStatus, deleteVideo } = require('../controllers/videoController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', saveVideo);
router.get('/', getVideos);
router.put('/:id', updateStatus);
router.delete('/:id', deleteVideo);

module.exports = router;