const express = require("express");
const router = express.Router();
const {
  searchVideos,
  getChannelVideosByChannelId,
} = require("../controllers/youtubeController");
const authMiddleware = require("../middleware/auth");

router.get("/search", authMiddleware, searchVideos);
router.get(
  "/channel/:channelId/videos",
  authMiddleware,
  getChannelVideosByChannelId,
);

module.exports = router;
