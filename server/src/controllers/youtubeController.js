const https = require('https');

const searchVideos = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: '検索キーワードを入力してください' });

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=12&key=${process.env.YOUTUBE_API_KEY}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => resolve(JSON.parse(body)));
        response.on('error', reject);
      }).on('error', reject);
    });

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const videos = data.items.map(item => ({
      youtube_id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      channel_name: item.snippet.channelTitle,
    }));

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: '検索に失敗しました' });
  }
};

module.exports = { searchVideos };