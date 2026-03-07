const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db/index");
const { google } = require("googleapis");

// Google OAuth セッションの一時ストア (userId -> { subscriptions, expiresAt })
const importSessions = new Map();

const getOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3000/api/auth/google/callback",
  );

// ユーザー登録
const register = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword],
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(400).json({ error: "ユーザー登録に失敗しました" });
  }
};

// ログイン
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];
    if (!user)
      return res.status(401).json({ error: "メールアドレスが存在しません" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "パスワードが間違っています" });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "ログインに失敗しました" });
  }
};

module.exports = {
  register,
  login,
  getGoogleAuthUrl,
  handleGoogleCallback,
  getGoogleSubscriptions,
};

// Google OAuth: 認可 URL を生成（JWT 認証済みユーザー用）
function getGoogleAuthUrl(req, res) {
  const oauth2Client = getOAuth2Client();
  // CSRF対策: state に短命JWTでuserIdを埋め込む
  const state = jwt.sign({ userId: req.userId }, process.env.JWT_SECRET, {
    expiresIn: "10m",
  });
  const url = oauth2Client.generateAuthUrl({
    access_type: "online",
    scope: ["https://www.googleapis.com/auth/youtube.readonly"],
    state,
  });
  res.json({ url });
}

// Google OAuth: コールバック（Googleからのリダイレクト先）
async function handleGoogleCallback(req, res) {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(`${clientUrl}/google-callback?error=missing_params`);
  }
  let userId;
  try {
    ({ userId } = jwt.verify(state, process.env.JWT_SECRET));
  } catch {
    return res.redirect(`${clientUrl}/google-callback?error=invalid_state`);
  }
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // subscriptions.list を全ページ取得
    const subscriptions = [];
    let pageToken;
    do {
      const response = await youtube.subscriptions.list({
        part: "snippet",
        mine: true,
        maxResults: 50,
        pageToken,
      });
      for (const item of response.data.items || []) {
        subscriptions.push({
          channel_id: item.snippet.resourceId.channelId,
          channel_name: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.default?.url || "",
        });
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    // 10分間だけメモリに保持
    importSessions.set(String(userId), {
      subscriptions,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.redirect(`${clientUrl}/google-callback`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    const detail = encodeURIComponent(err.message || "unknown");
    res.redirect(
      `${clientUrl}/google-callback?error=fetch_failed&detail=${detail}`,
    );
  }
}

// サブスクリプション一覧を返す（JWT認証済みユーザー、一度だけ読み取り可）
function getGoogleSubscriptions(req, res) {
  const key = String(req.userId);
  const session = importSessions.get(key);
  if (!session) {
    return res.status(404).json({
      error:
        "インポートセッションが見つかりません。再度Googleに接続してください。",
    });
  }
  if (Date.now() > session.expiresAt) {
    importSessions.delete(key);
    return res.status(410).json({
      error: "セッションが期限切れです。再度Googleに接続してください。",
    });
  }
  const { subscriptions } = session;
  importSessions.delete(key); // ワンタイム読み取り
  res.json({ subscriptions });
}
