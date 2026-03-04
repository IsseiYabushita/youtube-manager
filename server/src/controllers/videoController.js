const db = require('../db/index');

// 動画を保存
const saveVideo = async (req, res) => {
  const { youtube_id, title, thumbnail, channel_name, status } = req.body;
  const user_id = req.userId;
  try {
    const result = await db.query(
      'INSERT INTO videos (user_id, youtube_id, title, thumbnail, channel_name, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [user_id, youtube_id, title, thumbnail, channel_name, status || 'watch_later']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '動画の保存に失敗しました' });
  }
};

// 動画一覧を取得
const getVideos = async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await db.query(
      'SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '動画の取得に失敗しました' });
  }
};

// ステータス更新
const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user_id = req.userId;
  try {
    const result = await db.query(
      'UPDATE videos SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, user_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'ステータスの更新に失敗しました' });
  }
};

// 動画を削除
const deleteVideo = async (req, res) => {
  const { id } = req.params;
  const user_id = req.userId;
  try {
    await db.query('DELETE FROM videos WHERE id = $1 AND user_id = $2', [id, user_id]);
    res.json({ message: '削除しました' });
  } catch (err) {
    res.status(500).json({ error: '削除に失敗しました' });
  }
};

module.exports = { saveVideo, getVideos, updateStatus, deleteVideo };