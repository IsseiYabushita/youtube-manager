const db = require("../db/index");
const https = require("https");

const fetchFromYouTube = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve(JSON.parse(body)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
};

// 動画を保存
const saveVideo = async (req, res) => {
  const { youtube_id, title, thumbnail, channel_name, status, published_at } =
    req.body;
  const user_id = req.userId;
  try {
    const result = await db.query(
      "INSERT INTO videos (user_id, youtube_id, title, thumbnail, channel_name, status, published_at, metadata_updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *",
      [
        user_id,
        youtube_id,
        title,
        thumbnail,
        channel_name,
        status || "watch_later",
        published_at || null,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "動画の保存に失敗しました" });
  }
};

// 動画一覧を取得（24時間以上古いメタデータは自動リフレッシュ）
const getVideos = async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await db.query(
      "SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC",
      [user_id],
    );
    const videos = result.rows;

    // 24時間以上経過したメタデータを検出
    const stale = videos.filter(
      (v) =>
        !v.metadata_updated_at ||
        Date.now() - new Date(v.metadata_updated_at).getTime() >
          24 * 60 * 60 * 1000,
    );

    if (stale.length > 0) {
      // videos.listは50本まとめて1ユニット（低クォータ）
      const ids = stale.map((v) => v.youtube_id).join(",");
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${process.env.YOUTUBE_API_KEY}`;
      const data = await fetchFromYouTube(url);
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await db.query(
            "UPDATE videos SET title = $1, thumbnail = $2, channel_name = $3, published_at = $4, metadata_updated_at = NOW() WHERE youtube_id = $5 AND user_id = $6",
            [
              item.snippet.title,
              item.snippet.thumbnails.maxres?.url ??
                item.snippet.thumbnails.standard?.url ??
                item.snippet.thumbnails.high?.url ??
                item.snippet.thumbnails.medium?.url ??
                item.snippet.thumbnails.default?.url ??
                "",
              item.snippet.channelTitle,
              item.snippet.publishedAt,
              item.id,
              user_id,
            ],
          );
        }
        const updated = await db.query(
          "SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC",
          [user_id],
        );
        return res.json(updated.rows);
      }
    }

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: "動画の取得に失敗しました" });
  }
};

// ステータス更新
const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user_id = req.userId;
  try {
    const result = await db.query(
      "UPDATE videos SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [status, id, user_id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "ステータスの更新に失敗しました" });
  }
};

// 動画を削除
const deleteVideo = async (req, res) => {
  const { id } = req.params;
  const user_id = req.userId;
  try {
    await db.query("DELETE FROM videos WHERE id = $1 AND user_id = $2", [
      id,
      user_id,
    ]);
    res.json({ message: "削除しました" });
  } catch (err) {
    res.status(500).json({ error: "削除に失敗しました" });
  }
};

// JST（UTC+9）の今日の日付を YYYY-MM-DD で返す（サーバーのタイムゾーン設定に依存しない）
const localDateStr = () => {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// 再生時間を更新
const updateWatchDuration = async (req, res) => {
  const { id } = req.params;
  const { seconds } = req.body;
  const user_id = req.userId;
  try {
    const result = await db.query(
      "UPDATE videos SET watch_duration = watch_duration + $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [seconds, id, user_id],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "動画が見つかりません" });
    }
    try {
      await db.query(
        "INSERT INTO daily_watch (user_id, date, seconds) VALUES ($1, $3, $2) ON CONFLICT (user_id, date) DO UPDATE SET seconds = daily_watch.seconds + $2",
        [user_id, seconds, localDateStr()],
      );
    } catch (dailyErr) {
      console.error("daily_watchの更新に失敗:", dailyErr.message);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("updateWatchDuration error:", err.message);
    res.status(500).json({ error: "再生時間の更新に失敗しました" });
  }
};

// 再生時間を記録（動画IDなし）
const trackDuration = async (req, res) => {
  const { seconds } = req.body;
  const user_id = req.userId;
  try {
    await db.query(
      "INSERT INTO daily_watch (user_id, date, seconds) VALUES ($1, $3, $2) ON CONFLICT (user_id, date) DO UPDATE SET seconds = daily_watch.seconds + $2",
      [user_id, seconds, localDateStr()],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("trackDuration error:", err.message);
    res.status(500).json({ error: "再生時間の記録に失敗しました" });
  }
};

// 全期間の合計再生時間を取得（daily_watchベース：全動画対象）
const getAllTimeDuration = async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await db.query(
      "SELECT COALESCE(SUM(seconds), 0) AS seconds FROM daily_watch WHERE user_id = $1",
      [user_id],
    );
    res.json({ seconds: parseInt(result.rows[0].seconds, 10) });
  } catch (err) {
    console.error("getAllTimeDuration error:", err.message);
    res.status(500).json({ error: "再生時間の取得に失敗しました" });
  }
};

// 今日の合計再生時間を取得
const getTodayDuration = async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await db.query(
      "SELECT COALESCE(seconds, 0) AS seconds FROM daily_watch WHERE user_id = $1 AND date = $2",
      [user_id, localDateStr()],
    );
    const seconds = result.rows.length > 0 ? result.rows[0].seconds : 0;
    res.json({ seconds });
  } catch (err) {
    res.status(500).json({ error: "再生時間の取得に失敗しました" });
  }
};

// 過去N日間の日別再生時間を取得（?days=N、デフォルト7）
const getWeeklyDuration = async (req, res) => {
  const user_id = req.userId;
  try {
    // days は 1〜365 の整数に限定。SQLインジェクション対策として
    // make_interval でパラメータ化することで文字列連結を避ける
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);
    const today = localDateStr();
    const result = await db.query(
      `SELECT
        gs.date::date AS date,
        COALESCE(dw.seconds, 0) AS seconds
       FROM generate_series(
         $2::date - make_interval(days => $3 - 1),
         $2::date,
         INTERVAL '1 day'
       ) AS gs(date)
       LEFT JOIN daily_watch dw
         ON dw.user_id = $1 AND dw.date = gs.date::date
       ORDER BY gs.date ASC`,
      [user_id, today, days],
    );

    const rows = result.rows.map((row) => {
      // postgres-dateはDATE型をローカルmidnightのDateオブジェクトとして返す
      // JST環境では new Date(2026,2,6) = 2026-03-05T15:00:00Zになるため
      // getUTC*() ではなく get*() (ローカル時刻) を使う必要がある
      const d = new Date(row.date);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const sec = parseInt(row.seconds, 10);
      return {
        date: `${d.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        label: `${month}/${day}`,
        minutes: Math.floor(sec / 60),
        seconds: sec,
      };
    });

    res.json(rows);
  } catch (err) {
    console.error("getWeeklyDuration error:", err.message);
    res.status(500).json({ error: "再生時間の取得に失敗しました" });
  }
};

// 過去12ヶ月の月別再生時間を取得
// TO_CHAR + FMMMで月の先頭ゼロを除去（2026/03 → 2026/3）
const getMonthlyDuration = async (req, res) => {
  const user_id = req.userId;
  try {
    const today = localDateStr();
    const result = await db.query(
      `SELECT
        TO_CHAR(gs.month, 'YYYY/FMMM') AS label,
        COALESCE(SUM(dw.seconds), 0)::int AS seconds
       FROM generate_series(
         DATE_TRUNC('month', $2::date - INTERVAL '11 months'),
         DATE_TRUNC('month', $2::date),
         INTERVAL '1 month'
       ) AS gs(month)
       LEFT JOIN daily_watch dw
         ON dw.user_id = $1
         AND DATE_TRUNC('month', dw.date) = gs.month
       GROUP BY gs.month, label
       ORDER BY gs.month ASC`,
      [user_id, today],
    );
    const months = result.rows.map((row) => ({
      label: row.label,
      minutes: Math.floor(row.seconds / 60),
      seconds: row.seconds,
    }));
    res.json(months);
  } catch (err) {
    console.error("getMonthlyDuration error:", err.message);
    res.status(500).json({ error: "再生時間の取得に失敗しました" });
  }
};

// 全年の年別再生時間を取得（データがある年のみ）
const getYearlyDuration = async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await db.query(
      `SELECT
        EXTRACT(YEAR FROM date)::int AS year,
        SUM(seconds)::int AS seconds
       FROM daily_watch
       WHERE user_id = $1
       GROUP BY year
       ORDER BY year ASC`,
      [user_id],
    );
    const years = result.rows.map((row) => ({
      label: String(row.year),
      minutes: Math.floor(row.seconds / 60),
      seconds: row.seconds,
    }));
    res.json(years);
  } catch (err) {
    console.error("getYearlyDuration error:", err.message);
    res.status(500).json({ error: "再生時間の取得に失敗しました" });
  }
};

module.exports = {
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
};
