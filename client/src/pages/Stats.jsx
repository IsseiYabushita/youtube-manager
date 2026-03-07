import { useState, useEffect } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#ff0000", "#ff6b6b", "#ffa500", "#ffff00", "#00ff00"];

// 秒数を「X時間Y分Z秒」形式で表示するヘルパー
const formatSeconds = (s) => {
  if (s === 0) return "0秒";
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${s % 60 > 0 ? (s % 60) + "秒" : ""}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}時間${rm > 0 ? rm + "分" : ""}`;
};

function Stats() {
  const { token } = useAuth();
  const [videos, setVideos] = useState([]);
  const [allTimeSeconds, setAllTimeSeconds] = useState(0);
  const [durationTab, setDurationTab] = useState("daily");
  const [dailyData, setDailyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [yearlyData, setYearlyData] = useState([]);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    const fetchVideos = async () => {
      try {
        const res = await api.get("/api/videos", { headers });
        setVideos(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    const fetchAllTime = async () => {
      try {
        const res = await api.get("/api/videos/all-time-duration", { headers });
        setAllTimeSeconds(res.data.seconds || 0);
      } catch (err) {
        console.error(err);
      }
    };
    const fetchDailyData = async () => {
      try {
        const res = await api.get("/api/videos/weekly-duration?days=30", { headers });
        setDailyData(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    const fetchMonthlyData = async () => {
      try {
        const res = await api.get("/api/videos/monthly-duration", { headers });
        setMonthlyData(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    const fetchYearlyData = async () => {
      try {
        const res = await api.get("/api/videos/yearly-duration", { headers });
        setYearlyData(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchVideos();
    fetchAllTime();
    fetchDailyData();
    fetchMonthlyData();
    fetchYearlyData();
  }, []);

  // ステータス別集計
  const statusData = [
    {
      name: "あとで見る",
      value: videos.filter((v) => v.status === "watch_later").length,
    },
    {
      name: "視聴済み",
      value: videos.filter((v) => v.status === "watched").length,
    },
    {
      name: "お気に入り",
      value: videos.filter((v) => v.status === "favorite").length,
    },
  ].filter((d) => d.value > 0);

  // チャンネル別集計（上位5件）
  const channelMap = {};
  videos.forEach((v) => {
    channelMap[v.channel_name] = (channelMap[v.channel_name] || 0) + 1;
  });
  const channelData = Object.entries(channelMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalMinutes = Math.floor(allTimeSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainMinutes = totalMinutes % 60;

  const durationTabConfig = {
    daily:    { label: "日別（30日）", data: dailyData },
    monthly:  { label: "月別（12ヶ月）", data: monthlyData },
    yearly:   { label: "年別", data: yearlyData },
    lifetime: { label: "生涯", data: null },
  };

  const currentTabData = durationTabConfig[durationTab].data;

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginBottom: "2rem" }}>統計</h2>

      {/* カード */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ fontSize: "2rem", fontWeight: "bold", color: "#ff0000" }}>{videos.length}</p>
          <p style={{ color: "#aaa" }}>保存済み動画</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ fontSize: "2rem", fontWeight: "bold", color: "#ff0000" }}>
            {videos.filter((v) => v.status === "watched").length}
          </p>
          <p style={{ color: "#aaa" }}>視聴済み</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ fontSize: "2rem", fontWeight: "bold", color: "#ff0000" }}>
            {videos.filter((v) => v.status === "favorite").length}
          </p>
          <p style={{ color: "#aaa" }}>お気に入り</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ fontSize: "2rem", fontWeight: "bold", color: "#ff0000" }}>
            {totalHours > 0 ? `${totalHours}h${remainMinutes}m` : `${totalMinutes}m`}
          </p>
          <p style={{ color: "#aaa" }}>合計再生時間</p>
        </div>
      </div>

      {/* 再生時間の記録（タブ切り替え） */}
      <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px", marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>再生時間の記録</h3>

        {/* タブ */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {Object.entries(durationTabConfig).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setDurationTab(key)}
              style={{
                padding: "0.4rem 1rem",
                borderRadius: "4px",
                border: "1px solid",
                borderColor: durationTab === key ? "#ff0000" : "#444",
                background: durationTab === key ? "#ff0000" : "none",
                color: durationTab === key ? "#fff" : "#aaa",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {/* 生涯タブ */}
        {durationTab === "lifetime" && (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <p style={{ fontSize: "3rem", fontWeight: "bold", color: "#ff0000" }}>
              {formatSeconds(allTimeSeconds)}
            </p>
            <p style={{ color: "#aaa", marginTop: "0.5rem" }}>
              合計 {totalHours}時間 {remainMinutes}分
            </p>
          </div>
        )}

        {/* 日別・月別・年別タブ（棒グラフ） */}
        {durationTab !== "lifetime" && currentTabData && (
          <>
            {currentTabData.every((d) => d.seconds === 0) ? (
              <p style={{ color: "#aaa" }}>
                まだ再生データがありません。動画を再生すると記録されます。
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={currentTabData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#aaa" }}
                    axisLine={false}
                    tickLine={false}
                    interval={durationTab === "daily" ? 6 : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#aaa" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(m) => m >= 60 ? `${Math.floor(m / 60)}h` : `${m}m`}
                  />
                  <Tooltip
                    formatter={(value, name, props) => [
                      formatSeconds(props.payload.seconds),
                      "再生時間",
                    ]}
                    contentStyle={{ background: "#0f0f0f", border: "1px solid #333", fontSize: "0.85rem" }}
                  />
                  <Bar dataKey="minutes" fill="#ff0000" radius={[4, 4, 0, 0]} minPointSize={3} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" }}>
        {/* ステータス別円グラフ */}
        <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ marginBottom: "1rem" }}>ステータス別</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "#aaa" }}>データがありません</p>
          )}
        </div>

        {/* チャンネル別棒グラフ */}
        <div style={{ background: "#1a1a1a", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ marginBottom: "1rem" }}>チャンネル別（上位5件）</h3>
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={channelData}>
                <XAxis dataKey="name" tick={{ fill: "#aaa", fontSize: 10 }} />
                <YAxis tick={{ fill: "#aaa" }} />
                <Tooltip />
                <Bar dataKey="count" fill="#ff0000" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "#aaa" }}>データがありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Stats;
