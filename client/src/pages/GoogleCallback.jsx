import { useEffect } from "react";

// Google OAuth のコールバックを受け取るページ。
// バックエンドがここにリダイレクトしてきたら、親ウィンドウに postMessage して自動クローズする。
function GoogleCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const detail = params.get("detail");

    if (window.opener) {
      window.opener.postMessage(
        {
          type: "GOOGLE_OAUTH_CALLBACK",
          error: error || null,
          detail: detail || null,
        },
        window.location.origin,
      );
      window.close();
    }
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#111",
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      <p>Google認証完了。このウィンドウを閉じてください。</p>
    </div>
  );
}

export default GoogleCallback;
