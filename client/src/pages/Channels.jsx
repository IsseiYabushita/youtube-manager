import { useState, useEffect, useRef } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import timeAgo from "../utils/timeAgo";
import useInfiniteScroll from "../utils/useInfiniteScroll";

function Channels({ onPlay }) {
  const { token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [latestVideos, setLatestVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState("latest");
  const [cachedAt, setCachedAt] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  // チャンネル詳細
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelVideos, setChannelVideos] = useState([]);
  const [channelVideosNextPageToken, setChannelVideosNextPageToken] =
    useState(null);
  const [channelVideosLoading, setChannelVideosLoading] = useState(false);

  // YouTube 一括インポート用 state
  const [importSubscriptions, setImportSubscriptions] = useState(null); // null = 未取得
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importConnecting, setImportConnecting] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  // 新着動画の無限スクロール
  const {
    visibleItems: visibleLatestVideos,
    sentinelRef: latestSentinelRef,
    hasMore: latestHasMore,
  } = useInfiniteScroll(latestVideos, 12);

  useEffect(() => {
    fetchChannels();
    fetchLatestVideos();
  }, []);

  const fetchChannels = async () => {
    try {
      const res = await api.get("/api/channels", {
        headers,
      });
      setChannels(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLatestVideos = async (force = false) => {
    setLoading(true);
    try {
      const url = force
        ? "/api/channels/latest?force=true"
        : "/api/channels/latest";
      const res = await api.get(url, { headers });
      setLatestVideos(res.data.videos || []);
      setCachedAt(res.data.cached_at ? new Date(res.data.cached_at) : null);
      setFromCache(res.data.from_cache || false);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Google OAuth ポップアップを開いてサブスクリプション一覧を取得
  const handleConnectGoogle = async () => {
    setImportConnecting(true);
    try {
      const res = await api.get("/api/auth/google/url", { headers });
      const popup = window.open(
        res.data.url,
        "google_oauth",
        "width=500,height=650",
      );
      if (!popup) {
        alert(
          "ポップアップがブロックされました。ポップアップを許可してください。",
        );
        setImportConnecting(false);
        return;
      }
      // コールバックページからの postMessage を待つ
      const onMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "GOOGLE_OAUTH_CALLBACK") return;
        window.removeEventListener("message", onMessage);
        if (event.data.error) {
          alert(
            `Google認証に失敗しました: ${event.data.error}\n詳細: ${event.data.detail || "不明"}`,
          );
          setImportConnecting(false);
          return;
        }
        // サブスクリプション一覧を取得
        try {
          const subRes = await api.get("/api/auth/google/subscriptions", {
            headers,
          });
          const subs = subRes.data.subscriptions;
          setImportSubscriptions(subs);
          // 未登録のものをデフォルトで全選択
          const registeredSet = new Set(channels.map((c) => c.channel_id));
          setSelectedIds(
            new Set(
              subs
                .filter((s) => !registeredSet.has(s.channel_id))
                .map((s) => s.channel_id),
            ),
          );
        } catch (err) {
          alert("サブスクリプションの取得に失敗しました");
        }
        setImportConnecting(false);
      };
      window.addEventListener("message", onMessage);
    } catch (err) {
      alert("Google認証URLの取得に失敗しました");
      setImportConnecting(false);
    }
  };

  const handleToggleSelect = (channel_id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(channel_id) ? next.delete(channel_id) : next.add(channel_id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!importSubscriptions) return;
    const registeredSet = new Set(channels.map((c) => c.channel_id));
    setSelectedIds(
      new Set(
        importSubscriptions
          .filter((s) => !registeredSet.has(s.channel_id))
          .map((s) => s.channel_id),
      ),
    );
  };

  const handleDeselectAll = () => setSelectedIds(new Set());

  const handleBulkImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const res = await api.post(
        "/api/channels/bulk",
        { channel_ids: Array.from(selectedIds) },
        { headers },
      );
      alert(res.data.message);
      await fetchChannels();
      setImportSubscriptions(null);
      setSelectedIds(new Set());
    } catch (err) {
      alert("一括登録に失敗しました");
    }
    setImporting(false);
  };

  const handleUnsubscribe = async (id) => {
    try {
      await api.delete(`/api/channels/${id}`, { headers });
      fetchChannels();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenChannel = async (channel) => {
    setSelectedChannel(channel);
    setChannelVideos([]);
    setChannelVideosNextPageToken(null);
    setChannelVideosLoading(true);
    try {
      const res = await api.get(`/api/channels/${channel.id}/videos`, {
        headers,
      });
      setChannelVideos(res.data.videos || []);
      setChannelVideosNextPageToken(res.data.nextPageToken || null);
    } catch (err) {
      console.error(err);
    }
    setChannelVideosLoading(false);
  };

  const handleLoadMoreChannelVideos = async () => {
    if (!channelVideosNextPageToken || !selectedChannel) return;
    setChannelVideosLoading(true);
    try {
      const res = await api.get(
        `/api/channels/${selectedChannel.id}/videos?pageToken=${encodeURIComponent(channelVideosNextPageToken)}`,
        { headers },
      );
      setChannelVideos((prev) => [...prev, ...(res.data.videos || [])]);
      setChannelVideosNextPageToken(res.data.nextPageToken || null);
    } catch (err) {
      console.error(err);
    }
    setChannelVideosLoading(false);
  };

  const handleSave = async (video) => {
    try {
      await api.post(
        "/api/videos",
        { ...video, status: "watch_later" },
        { headers },
      );
      alert("保存しました！");
    } catch (err) {
      alert("保存に失敗しました");
    }
  };

  return (
    <div>
      {/* チャンネル詳細ビュー */}
      {selectedChannel && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <button
              onClick={() => setSelectedChannel(null)}
              style={{
                padding: "0.4rem 1rem",
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              ← 戻る
            </button>
            <img
              src={selectedChannel.thumbnail}
              alt={selectedChannel.channel_name}
              style={{ width: "40px", height: "40px", borderRadius: "50%" }}
            />
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
              {selectedChannel.channel_name}
            </h2>
          </div>
          {channelVideosLoading && channelVideos.length === 0 && (
            <p style={{ color: "#aaa" }}>読み込み中...</p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {channelVideos.map((video) => (
              <div
                key={video.youtube_id}
                style={{
                  background: "#1a1a1a",
                  borderRadius: "8px",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  loading="lazy"
                  style={{ width: "100%", cursor: "pointer", display: "block" }}
                  onClick={() =>
                    onPlay({ youtubeId: video.youtube_id, dbId: null })
                  }
                />
                <div
                  style={{
                    padding: "0.75rem",
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.9rem",
                      marginBottom: "0.5rem",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {video.title}
                  </p>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#666",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {video.published_at
                      ? `${new Date(video.published_at).toLocaleDateString("ja-JP")} · ${timeAgo(video.published_at)}`
                      : ""}
                  </p>
                  <button
                    onClick={() => handleSave(video)}
                    style={{
                      marginTop: "auto",
                      padding: "0.4rem",
                      background: "#333",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    あとで見る
                  </button>
                </div>
              </div>
            ))}
          </div>
          {channelVideosNextPageToken && (
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <button
                onClick={handleLoadMoreChannelVideos}
                disabled={channelVideosLoading}
                style={{
                  padding: "0.6rem 2rem",
                  background: channelVideosLoading ? "#333" : "#555",
                  color: channelVideosLoading ? "#777" : "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: channelVideosLoading ? "not-allowed" : "pointer",
                }}
              >
                {channelVideosLoading ? "読み込み中..." : "もっと見る"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* メインビュー（チャンネル詳細表示中は非表示） */}
      {!selectedChannel && (
        <div>
          {/* タブ */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
            <button
              onClick={() => setActiveView("latest")}
              style={{
                padding: "0.5rem 1.5rem",
                background: activeView === "latest" ? "#ff0000" : "#333",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
              }}
            >
              新着動画
            </button>
            <button
              onClick={() => setActiveView("channels")}
              style={{
                padding: "0.5rem 1.5rem",
                background: activeView === "channels" ? "#ff0000" : "#333",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
              }}
            >
              登録チャンネル（{channels.length}）
            </button>
          </div>

          {/* 新着動画 */}
          {activeView === "latest" && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <button
                  onClick={() => fetchLatestVideos(true)}
                  disabled={loading}
                  style={{
                    padding: "0.4rem 1rem",
                    background: "#333",
                    color: loading ? "#777" : "#fff",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "取得中..." : "↻ 更新"}
                </button>
                {cachedAt && (
                  <span style={{ fontSize: "0.75rem", color: "#666" }}>
                    {fromCache ? "キャッシュ" : "取得完了"}:{" "}
                    {cachedAt.toLocaleString("ja-JP")}（3時間キャッシュ）
                  </span>
                )}
              </div>
              {!loading && latestVideos.length === 0 && (
                <p style={{ color: "#aaa" }}>
                  チャンネルを登録すると新着動画が表示されます
                </p>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "1rem",
                }}
              >
                {visibleLatestVideos.map((video) => (
                  <div
                    key={video.youtube_id}
                    style={{
                      background: "#1a1a1a",
                      borderRadius: "8px",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      loading="lazy"
                      style={{
                        width: "100%",
                        cursor: "pointer",
                        display: "block",
                      }}
                      onClick={() =>
                        onPlay({ youtubeId: video.youtube_id, dbId: null })
                      }
                    />
                    <div
                      style={{
                        padding: "0.75rem",
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "0.9rem",
                          marginBottom: "0.5rem",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {video.title}
                      </p>
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "#1a8cd8",
                          marginBottom: "0.25rem",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                        onClick={() => {
                          const ch = channels.find(
                            (c) => c.channel_id === video.channel_id,
                          );
                          if (ch) handleOpenChannel(ch);
                        }}
                      >
                        {video.channel_name}
                      </p>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "#666",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {video.published_at
                          ? `${new Date(video.published_at).toLocaleDateString("ja-JP")} · ${timeAgo(video.published_at)}`
                          : ""}
                      </p>
                      <button
                        onClick={() => handleSave(video)}
                        style={{
                          marginTop: "auto",
                          padding: "0.4rem",
                          background: "#333",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        あとで見る
                      </button>
                    </div>
                  </div>
                ))}{" "}
              </div>
              {latestHasMore && (
                <div ref={latestSentinelRef} style={{ height: "1px" }} />
              )}
            </div>
          )}

          {/* 登録チャンネル一覧 */}
          {activeView === "channels" && (
            <div>
              {/* 一括インポートボタン */}
              {!importSubscriptions && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <button
                    onClick={handleConnectGoogle}
                    disabled={importConnecting}
                    style={{
                      padding: "0.6rem 1.2rem",
                      background: importConnecting ? "#333" : "#1a73e8",
                      color: importConnecting ? "#777" : "#fff",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "0.9rem",
                      cursor: importConnecting ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    {importConnecting
                      ? "接続中..."
                      : "YouTubeの登録チャンネルを一括インポート"}
                  </button>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#666",
                      marginTop: "0.4rem",
                    }}
                  >
                    Googleアカウントに接続して、YouTubeで登録済みのチャンネルを一括追加できます
                  </p>
                </div>
              )}
              {/* サブスクリプション選択UI */}
              {importSubscriptions && (
                <div
                  style={{
                    background: "#1a1a1a",
                    borderRadius: "8px",
                    padding: "1rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <p style={{ fontWeight: "bold" }}>
                      YouTube登録チャンネル（{importSubscriptions.length}件）
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={handleSelectAll}
                        style={{
                          padding: "0.3rem 0.8rem",
                          background: "#333",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        未登録を全選択
                      </button>
                      <button
                        onClick={handleDeselectAll}
                        style={{
                          padding: "0.3rem 0.8rem",
                          background: "#333",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        全解除
                      </button>
                      <button
                        onClick={() => {
                          setImportSubscriptions(null);
                          setSelectedIds(new Set());
                        }}
                        style={{
                          padding: "0.3rem 0.8rem",
                          background: "#444",
                          color: "#aaa",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      maxHeight: "320px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {importSubscriptions.map((sub) => {
                      const alreadyRegistered = channels.some(
                        (c) => c.channel_id === sub.channel_id,
                      );
                      const checked = selectedIds.has(sub.channel_id);
                      return (
                        <label
                          key={sub.channel_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            background: alreadyRegistered
                              ? "#222"
                              : checked
                                ? "#1a2a1a"
                                : "#111",
                            cursor: alreadyRegistered ? "default" : "pointer",
                            opacity: alreadyRegistered ? 0.5 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={alreadyRegistered}
                            onChange={() => handleToggleSelect(sub.channel_id)}
                            style={{
                              width: "16px",
                              height: "16px",
                              flexShrink: 0,
                            }}
                          />
                          <img
                            src={sub.thumbnail}
                            alt={sub.channel_name}
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, fontSize: "0.9rem" }}>
                            {sub.channel_name}
                          </span>
                          {alreadyRegistered && (
                            <span
                              style={{ fontSize: "0.75rem", color: "#888" }}
                            >
                              登録済み
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleBulkImport}
                    disabled={importing || selectedIds.size === 0}
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      background:
                        importing || selectedIds.size === 0
                          ? "#333"
                          : "#ff0000",
                      color:
                        importing || selectedIds.size === 0 ? "#777" : "#fff",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "0.95rem",
                      cursor:
                        importing || selectedIds.size === 0
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {importing
                      ? "登録中..."
                      : `選択した ${selectedIds.size} 件を登録`}
                  </button>
                </div>
              )}
              {/* 登録済みチャンネル一覧 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {channels.length === 0 && (
                  <p style={{ color: "#aaa" }}>登録チャンネルがありません</p>
                )}
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    style={{
                      background: "#1a1a1a",
                      padding: "1rem",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    <img
                      src={channel.thumbnail}
                      alt={channel.channel_name}
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        cursor: "pointer",
                      }}
                      onClick={() => handleOpenChannel(channel)}
                    />
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontWeight: "bold",
                          cursor: "pointer",
                          color: "#fff",
                        }}
                        onClick={() => handleOpenChannel(channel)}
                      >
                        {channel.channel_name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnsubscribe(channel.id)}
                      style={{
                        padding: "0.5rem 1rem",
                        background: "#ff4444",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                      }}
                    >
                      登録解除
                    </button>
                  </div>
                ))}{" "}
              </div>{" "}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Channels;
