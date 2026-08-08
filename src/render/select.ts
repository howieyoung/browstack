import { getDb } from "../db.js";
import { normalizeTitle, normalizeUrl } from "../shared/urls.js";

/**
 * Issue item selection (preview and email share the same logic, so both versions stay consistent):
 * 1. Within-issue dedup: keyed on normalized URL + normalized title, each piece is selected only once
 *    (tracking-param duplicates and multiple links to the same content are merged, keeping the strongest-signal row)
 * 2. Cross-issue dedup: any row whose key matches an already-published page (published_in non-null) is never selected again
 * 3. Honest "this week" signal: minutes only sum visits within the issue window (visits_log/captures),
 *    no longer lifetime totals; a single visit hitting the 20-minute cap is marked capped (displayed as "20+")
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
  capped: number; // sqlite boolean (0/1)
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

  // Keys of already-published content — matching keys are never selected again (covers historically unmerged tracking-param duplicates)
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

  // Ordering is based on real signal for the week: actual reading (extension) first, then in-window dwell time
  const articles = dedupe(candidates("article", "active_min DESC, minutes DESC", 30), 10);
  const socialPosts = dedupe(candidates("social", "minutes DESC", 15), 6);
  return { articles, socialPosts };
}
