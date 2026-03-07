import { useState, useEffect, useRef } from "react";

/**
 * スクロールに応じて表示件数を増やすフック
 * @param {Array} items - 全アイテム配列
 * @param {number} pageSize - 一度に表示する件数（デフォルト12）
 * @returns {{ visibleItems, sentinelRef, reset }}
 */
function useInfiniteScroll(items, pageSize = 12) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef(null);

  // items が変わったら表示件数をリセット
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, pageSize]);

  return {
    visibleItems: items.slice(0, visibleCount),
    sentinelRef,
    hasMore: visibleCount < items.length,
  };
}

export default useInfiniteScroll;
