const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getGoogleAuthUrl,
  handleGoogleCallback,
  getGoogleSubscriptions,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);

// Google OAuth (URL生成・サブスク取得はJWT認証必須、コールバックはGoogleからのリダイレクトなので認証不要)
router.get("/google/url", authMiddleware, getGoogleAuthUrl);
router.get("/google/callback", handleGoogleCallback);
router.get("/google/subscriptions", authMiddleware, getGoogleSubscriptions);

module.exports = router;
