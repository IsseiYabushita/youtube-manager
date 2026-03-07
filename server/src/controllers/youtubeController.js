const https = require("https");

const searchVideos = async (req, res) => {
  const { q } = req.query;
  if (!q)
    return res.status(400).json({ error: "検索キーワードを入力してください" });

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=12&key=${process.env.YOUTUBE_API_KEY}`;

    const data = await new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => resolve(JSON.parse(body)));
          response.on("error", reject);
        })
        .on("error", reject);
    });

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const videos = data.items.map((item) => ({
      youtube_id: item.id.videoId,
      title: item.snippet.title,
      thumbnail:
        item.snippet.thumbnails.maxres?.url ??
        item.snippet.thumbnails.standard?.url ??
        item.snippet.thumbnails.high?.url ??
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        "",
      channel_name: item.snippet.channelTitle,
      channel_id: item.snippet.channelId,
      published_at: item.snippet.publishedAt,
    }));

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: "検索に失敗しました" });
  }
};

const getChannelVideosByChannelId = async (req, res) => {
  const { channelId } = req.params;
  const { pageToken } = req.query;
  try {
    const playlistId = channelId.replace(/^UC/, "UU");
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${process.env.YOUTUBE_API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }
    const data = await new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => resolve(JSON.parse(body)));
          response.on("error", reject);
        })
        .on("error", reject);
    });
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
    res.status(500).json({ error: "チャンネル動画の取得に失敗しました" });
  }
};

module.exports = { searchVideos, getChannelVideosByChannelId };
