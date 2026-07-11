import { getDb } from "../db.js";
import { normalizeTitle, normalizeUrl } from "../shared/urls.js";

/**
 * 本期選材（preview 與 email 共用同一套邏輯，確保兩個版本內容一致）：
 * 1. 同期去重：以正規化 URL ＋正規化標題為識別鍵，同一篇內容只入選一次
 *    （追蹤參數分身、同文多連結一律合併，取訊號最強的那筆）
 * 2. 跨期去重：識別鍵與任何已刊登（published_in 非空）頁面相同者，永不再入選
 * 3. 誠實的「本週」訊號：分鐘數只加總本期窗口內的造訪（visits_log／captures），
 *    不再用終身累計值；單次造訪撞到 20 分鐘上限者標記 capped（顯示為「20+」）
 */

const CHROME_EPOCH_OFFSET_SEC = 11_644_473_600;

export interface IssueItem {
  id: number;
  title: string;
  url: string;
  topic: string | null;
  summary: string | null;
  devices: string;
  total_visits: number;
  minutes: number;
  active_min: number;
  capped: number; // sqlite boolean（0/1）
}

export function selectIssueItems(weekAgo: number): { articles: IssueItem[]; socialPosts: IssueItem[] } {
  const db = getDb();
  const weekChrome = (weekAgo + CHROME_EPOCH_OFFSET_SEC) * 1_000_000;

  const candidates = (kind: string, order: string, limit: number) =>
    db
      .prepare(
        `SELECT p.id, p.title, p.url, p.topic, p.summary, p.devices, p.total_visits,
          ROUND(COALESCE((SELECT SUM(v.duration_sec) FROM visits_log v
                           WHERE v.page_id = p.id AND v.visit_time > ?), 0) / 60.0, 1) AS minutes,
          COALESCE((SELECT MAX(v.duration_sec) FROM visits_log v
                     WHERE v.page_id = p.id AND v.visit_time > ?), 0) >= 1200 AS capped,
          ROUND(COALESCE((SELECT SUM(c.active_seconds) FROM captures c
                           WHERE c.url = p.url AND c.captured_at > ?), 0) / 60.0, 1) AS active_min
        FROM pages p
        WHERE p.kind = ? AND p.is_knowledge = 1 AND p.summary IS NOT NULL
          AND p.published_in IS NULL AND p.last_seen > ? AND p.title IS NOT NULL
        ORDER BY ${order}
        LIMIT ?`,
      )
      .all(weekChrome, weekChrome, weekAgo, kind, weekAgo, limit) as IssueItem[];

  // 已刊登內容的識別鍵——同鍵者永不再入選（涵蓋歷史上未合併的追蹤參數分身）
  const seen = new Set<string>();
  const published = db
    .prepare("SELECT url, title FROM pages WHERE published_in IS NOT NULL")
    .all() as Array<{ url: string; title: string | null }>;
  for (const row of published) {
    seen.add(normalizeUrl(row.url));
    if (row.title) seen.add(normalizeTitle(row.title));
  }

  const dedupe = (items: IssueItem[], limit: number) => {
    const out: IssueItem[] = [];
    for (const item of items) {
      const keys = [normalizeUrl(item.url), normalizeTitle(item.title)];
      if (keys.some((k) => seen.has(k))) continue;
      for (const k of keys) seen.add(k);
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  };

  // 排序以本週真實訊號為準：實讀（extension）優先，其次窗口內停留
  const articles = dedupe(candidates("article", "active_min DESC, minutes DESC", 30), 10);
  const socialPosts = dedupe(candidates("social", "minutes DESC", 15), 6);
  return { articles, socialPosts };
}
