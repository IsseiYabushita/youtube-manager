const express = require("express");
const router = express.Router();
const {
  saveVideo,
  getVideos,
  updateStatus,
  deleteVideo,
  updateWatchDuration,
  trackDuration,
  getAllTimeDuration,
  getTodayDuration,
  getWeeklyDuration,
  getMonthlyDuration,
  getYearlyDuration,
} = require("../controllers/videoController");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

router.post("/", saveVideo);
router.post("/track-duration", trackDuration);
router.get("/", getVideos);
router.get("/all-time-duration", getAllTimeDuration);
router.get("/today-duration", getTodayDuration);
router.get("/weekly-duration", getWeeklyDuration);
router.get("/monthly-duration", getMonthlyDuration);
router.get("/yearly-duration", getYearlyDuration);
router.put("/:id/duration", updateWatchDuration);
router.put("/:id", updateStatus);
router.delete("/:id", deleteVideo);

module.exports = router;
