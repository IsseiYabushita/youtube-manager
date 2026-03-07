const express = require("express");
const router = express.Router();
const {
  subscribeChannel,
  getChannels,
  unsubscribeChannel,
  getLatestVideos,
  searchChannels,
  bulkSubscribeChannels,
  getChannelVideos,
} = require("../controllers/channelController");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

router.get("/search", searchChannels);
router.get("/latest", getLatestVideos);
router.post("/bulk", bulkSubscribeChannels);
router.post("/", subscribeChannel);
router.get("/", getChannels);
router.get("/:id/videos", getChannelVideos);
router.delete("/:id", unsubscribeChannel);

module.exports = router;
