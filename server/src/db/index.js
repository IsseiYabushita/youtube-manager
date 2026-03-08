const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  const client = await pool.connect();
  try {
    // daily_watch テーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_watch (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        seconds INTEGER NOT NULL DEFAULT 0,
        UNIQUE(user_id, date)
      )
    `);
    // latest_videos_cache テーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS latest_videos_cache (
        channel_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // videos テーブルに watch_duration カラムがなければ追加
    await client.query(`
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS watch_duration INTEGER NOT NULL DEFAULT 0
    `);
    // videos テーブルに metadata_updated_at カラムがなければ追加
    await client.query(`
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMPTZ
    `);
    // videos テーブルに published_at カラムがなければ追加
    await client.query(`
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
    `);
    // channels テーブルに metadata_updated_at カラムがなければ追加
    await client.query(`
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMPTZ
    `);
    // videos テーブルに channel_id カラムがなければ追加
    await client.query(`
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS channel_id TEXT
    `);
    console.log("DBスキーマを確認・更新しました");
  } catch (err) {
    console.error("DBスキーマ初期化エラー:", err.message);
  } finally {
    client.release();
  }
}

pool.connect((err) => {
  if (err) {
    console.error("DB接続エラー:", err);
  } else {
    console.log("PostgreSQLに接続しました");
    initDb();
  }
});

module.exports = pool;
