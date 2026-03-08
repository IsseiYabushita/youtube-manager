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

// チャンネル登録
const subscribeChannel = async (req, res) => {
  const { channel_id } = req.body;
  const user_id = req.userId;
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channel_id}&key=${process.env.YOUTUBE_API_KEY}`;
    const data = await fetchFromYouTube(url);
    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: "チャンネルが見つかりません" });
    }
    const channel = data.items[0];
    const result = await db.query(
      "INSERT INTO channels (user_id, channel_id, channel_name, thumbnail, metadata_updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [
        user_id,
        channel_id,
        channel.snippet.title,
        channel.snippet.thumbnails.default.url,
      ],
    );
    // キャッシュを無効化
    await db.query("DELETE FROM latest_videos_cache WHERE user_id = $1", [
      user_id,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "チャンネル登録に失敗しました" });
  }
};

// 登録チャンネル一覧（24時間以上古いメタデータは自動リフレッシュ）
const getChannels = async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await db.query(
      "SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at DESC",
      [user_id],
    );
    const channels = result.rows;

    // 24時間以上経過したメタデータを検出
    const stale = channels.filter(
      (c) =>
        !c.metadata_updated_at ||
        Date.now() - new Date(c.metadata_updated_at).getTime() >
          24 * 60 * 60 * 1000,
    );

    if (stale.length > 0) {
      const ids = stale.map((c) => c.channel_id).join(",");
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ids}&key=${process.env.YOUTUBE_API_KEY}`;
      const data = await fetchFromYouTube(url);
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await db.query(
            "UPDATE channels SET channel_name = $1, thumbnail = $2, metadata_updated_at = NOW() WHERE channel_id = $3 AND user_id = $4",
            [
              item.snippet.title,
              item.snippet.thumbnails.default.url,
              item.id,
              user_id,
            ],
          );
        }
        const updated = await db.query(
          "SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at DESC",
          [user_id],
        );
        return res.json(updated.rows);
      }
    }

    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: "チャンネル取得に失敗しました" });
  }
};

// チャンネル登録解除
const unsubscribeChannel = async (req, res) => {
  const { id } = req.params;
  const user_id = req.userId;
  try {
    await db.query("DELETE FROM channels WHERE id = $1 AND user_id = $2", [
      id,
      user_id,
    ]);
    // キャッシュを無効化
    await db.query("DELETE FROM latest_videos_cache WHERE user_id = $1", [
      user_id,
    ]);
    res.json({ message: "登録解除しました" });
  } catch (err) {
    res.status(500).json({ error: "登録解除に失敗しました" });
  }
};

// 新着動画取得（3時間キャッシュ）
const CACHE_TTL_HOURS = 3;

const getLatestVideos = async (req, res) => {
  const user_id = req.userId;
  const force = req.query.force === "true";
  try {
    // キャッシュ確認
    if (!force) {
      const cacheResult = await db.query(
        "SELECT videos, cached_at FROM latest_videos_cache WHERE user_id = $1",
        [user_id],
      );
      if (cacheResult.rows.length > 0) {
        const cachedAt = new Date(cacheResult.rows[0].cached_at);
        const diffHours = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
        if (diffHours < CACHE_TTL_HOURS) {
          return res.json({
            videos: cacheResult.rows[0].videos,
            cached_at: cacheResult.rows[0].cached_at,
            from_cache: true,
          });
        }
      }
    }

    const channelsResult = await db.query(
      "SELECT * FROM channels WHERE user_id = $1",
      [user_id],
    );
    const channels = channelsResult.rows;
    if (channels.length === 0)
      return res.json({ videos: [], from_cache: false });

    const PER_CHANNEL = 5;

    const allVideos = [];
    for (const channel of channels) {
      const playlistId = channel.channel_id.replace(/^UC/, "UU");
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${PER_CHANNEL}&key=${process.env.YOUTUBE_API_KEY}`;
      const data = await fetchFromYouTube(url);
      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }
      if (data.items) {
        const videos = data.items.map((item) => ({
          youtube_id: item.contentDetails.videoId,
          title: item.snippet.title,
          thumbnail:
            item.snippet.thumbnails?.maxres?.url ??
            item.snippet.thumbnails?.standard?.url ??
            item.snippet.thumbnails?.high?.url ??
            item.snippet.thumbnails?.medium?.url ??
            item.snippet.thumbnails?.default?.url ??
            "",
          channel_name: item.snippet.videoOwnerChannelTitle,
          channel_id: channel.channel_id,
          published_at: item.contentDetails.videoPublishedAt,
        }));
        allVideos.push(...videos);
      }
    }
    allVideos.sort(
      (a, b) => new Date(b.published_at) - new Date(a.published_at),
    );

    // キャッシュに保存（YouTube API規約 Section 6.C: 24時間を超えるデータは削除）
    const now = new Date();
    await db.query(
      "DELETE FROM latest_videos_cache WHERE cached_at < NOW() - INTERVAL '24 hours'",
    );
    await db.query(
      "INSERT INTO latest_videos_cache (user_id, videos, cached_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET videos = $2, cached_at = $3",
      [user_id, JSON.stringify(allVideos), now],
    );

    res.json({ videos: allVideos, cached_at: now, from_cache: false });
  } catch (err) {
    res.status(500).json({ error: "新着動画の取得に失敗しました" });
  }
};

// チャンネル検索
const searchChannels = async (req, res) => {
  const { q } = req.query;
  if (!q)
    return res.status(400).json({ error: "検索キーワードを入力してください" });
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=5&key=${process.env.YOUTUBE_API_KEY}`;
    const data = await fetchFromYouTube(url);
    if (data.error) return res.status(400).json({ error: data.error.message });
    const channels = data.items.map((item) => ({
      channel_id: item.id.channelId,
      channel_name: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.default.url,
      description: item.snippet.description,
    }));
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: "チャンネル検索に失敗しました" });
  }
};

// チャンネルの動画一覧（ページネーション付き）
const getChannelVideos = async (req, res) => {
  const { id } = req.params;
  const { pageToken } = req.query;
  const user_id = req.userId;
  try {
    const result = await db.query(
      "SELECT channel_id FROM channels WHERE id = $1 AND user_id = $2",
      [id, user_id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "チャンネルが見つかりません" });
    }
    const channel_id = result.rows[0].channel_id;
    const playlistId = channel_id.replace(/^UC/, "UU");
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${process.env.YOUTUBE_API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }
    const data = await fetchFromYouTube(url);
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    const videos = (data.items || []).map((item) => ({
      youtube_id: item.contentDetails.videoId,
      title: item.snippet.title,
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ??
        item.snippet.thumbnails?.standard?.url ??
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url ??
        "",
      channel_name: item.snippet.videoOwnerChannelTitle,
      published_at: item.contentDetails.videoPublishedAt,
    }));
    res.json({ videos, nextPageToken: data.nextPageToken || null });
  } catch (err) {
    res.status(500).json({ error: "動画の取得に失敗しました" });
  }
};

module.exports = {
  subscribeChannel,
  getChannels,
  unsubscribeChannel,
  getLatestVideos,
  searchChannels,
  bulkSubscribeChannels,
  getChannelVideos,
};

// チャンネル一括登録（YouTube登録チャンネルのインポート用）
async function bulkSubscribeChannels(req, res) {
  const { channel_ids } = req.body;
  const user_id = req.userId;
  if (!Array.isArray(channel_ids) || channel_ids.length === 0) {
    return res.status(400).json({ error: "channel_ids が必要です" });
  }
  try {
    // 既存登録済みを除外
    const existing = await db.query(
      "SELECT channel_id FROM channels WHERE user_id = $1",
      [user_id],
    );
    const existingSet = new Set(existing.rows.map((r) => r.channel_id));
    const newIds = channel_ids.filter((id) => !existingSet.has(id));

    if (newIds.length === 0) {
      return res.json({ added: 0, message: "すべて登録済みです" });
    }

    // YouTube API でメタデータを 50 件ずつ取得してインサート
    let added = 0;
    for (let i = 0; i < newIds.length; i += 50) {
      const batch = newIds.slice(i, i + 50).join(",");
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${batch}&key=${process.env.YOUTUBE_API_KEY}`;
      const data = await fetchFromYouTube(url);
      if (data.error) continue; // バッチのエラーはスキップして続行
      for (const item of data.items || []) {
        await db.query(
          "INSERT INTO channels (user_id, channel_id, channel_name, thumbnail, metadata_updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING",
          [
            user_id,
            item.id,
            item.snippet.title,
            item.snippet.thumbnails?.default?.url || "",
          ],
        );
        added++;
      }
    }

    // キャッシュを無効化
    await db.query("DELETE FROM latest_videos_cache WHERE user_id = $1", [
      user_id,
    ]);

    res.json({ added, message: `${added}件のチャンネルを登録しました` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "一括登録に失敗しました" });
  }
}
