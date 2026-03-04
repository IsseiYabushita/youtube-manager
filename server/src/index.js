const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./db/index');
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/youtube', youtubeRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'サーバー起動中！' });
});

app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});