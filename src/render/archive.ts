import { getDb } from "../db.js";
import { type Issue, issueDigest, listIssues } from "../issue.js";
import { esc } from "../shared/html.js";
import { renderIssueDocument, type IssueStats } from "./issueView.js";
import type { IssueItem } from "./select.js";

/**
 * 典藏頁的即時渲染（server 端）：整個櫥窗與每一期都由當前 DB 重建,不落地檔案。
 * 過刊（含只寄過 email、沒網頁版的期數）由 issues 週期 + issue_items + 已持久化的 pages.summary
 * 忠實重建;訊號（分鐘/實讀）以該期 stored 週窗重算,封面走同源 /covers/N。
 */

const CHROME_EPOCH_OFFSET_SEC = 11_644_473_600;
const toChromeTime = (unixSec: number) => (unixSec + CHROME_EPOCH_OFFSET_SEC) * 1_000_000;
const fmtDate = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

// 依 stored 週窗 [start,end] 重算某期某類的入選項目（訊號以窗內造訪計算,與當初出刊一致）。
function reconstructItems(n: number, kind: "article" | "social", order: string): IssueItem[] {
  const db = getDb();
  const issue = db.prepare("SELECT week_start, week_end FROM issues WHERE number = ?").get(n) as
    | { week_start: number; week_end: number }
    | undefined;
  if (!issue) return [];
  const sc = toChromeTime(issue.week_start);
  const ec = toChromeTime(issue.week_end);
  return db
    .prepare(
      `SELECT p.id, p.title, p.url, p.topic, p.summary, p.devices, p.total_visits,
        ROUND(COALESCE((SELECT SUM(v.duration_sec) FROM visits_log v
                         WHERE v.page_id = p.id AND v.visit_time > ? AND v.visit_time <= ?), 0) / 60.0, 1) AS minutes,
        COALESCE((SELECT MAX(v.duration_sec) FROM visits_log v
                   WHERE v.page_id = p.id AND v.visit_time > ? AND v.visit_time <= ?), 0) >= 1200 AS capped,
        ROUND(COALESCE((SELECT SUM(c.active_seconds) FROM captures c
                         WHERE c.url = p.url AND c.captured_at > ? AND c.captured_at <= ?), 0) / 60.0, 1) AS active_min
      FROM pages p JOIN issue_items ii ON ii.page_id = p.id
      WHERE ii.issue_number = ? AND p.kind = ? AND p.summary IS NOT NULL AND p.title IS NOT NULL
      ORDER BY ${order}`,
    )
    .all(sc, ec, sc, ec, issue.week_start, issue.week_end, n, kind) as IssueItem[];
}

function statsForWindow(startUnix: number, endUnix: number): IssueStats {
  const db = getDb();
  const sc = toChromeTime(startUnix);
  const ec = toChromeTime(endUnix);
  const footprint = db
    .prepare("SELECT COUNT(*) AS visits FROM visits_log WHERE visit_time > ? AND visit_time <= ?")
    .get(sc, ec) as { visits: number };
  const reading = db
    .prepare(
      `SELECT COUNT(DISTINCT p.id) AS pages, ROUND(COALESCE(SUM(v.duration_sec), 0) / 60.0) AS minutes
         FROM visits_log v JOIN pages p ON p.id = v.page_id
        WHERE v.visit_time > ? AND v.visit_time <= ? AND p.kind IN ('article', 'social')`,
    )
    .get(sc, ec) as { pages: number; minutes: number };
  const deviceSplit = db
    .prepare("SELECT v.device, COUNT(*) AS n FROM visits_log v WHERE v.visit_time > ? AND v.visit_time <= ? GROUP BY v.device")
    .all(sc, ec) as Array<{ device: string; n: number }>;
  const mobileVisits = deviceSplit.find((d) => d.device === "mobile")?.n ?? 0;
  const totalVisits = deviceSplit.reduce((a, d) => a + d.n, 0);
  return {
    footprintVisits: footprint.visits,
    mobileVisits,
    totalVisits,
    readingPages: reading.pages,
    readingMinutes: Math.round(reading.minutes ?? 0),
  };
}

// 該期入選則數（櫥窗副標用）。№0 等無 issue_items 者回 0/0。
function issueCounts(n: number): { articles: number; social: number } {
  const row = getDb()
    .prepare(
      `SELECT
         SUM(CASE WHEN p.kind = 'article' THEN 1 ELSE 0 END) AS articles,
         SUM(CASE WHEN p.kind = 'social'  THEN 1 ELSE 0 END) AS social
       FROM issue_items ii JOIN pages p ON p.id = ii.page_id
      WHERE ii.issue_number = ?`,
    )
    .get(n) as { articles: number | null; social: number | null };
  return { articles: row.articles ?? 0, social: row.social ?? 0 };
}

// 單期網頁（由 DB 重建）。查無此期回 null（→ server 404）。
export function renderIssuePage(n: number): string | null {
  const db = getDb();
  const issue = db.prepare("SELECT * FROM issues WHERE number = ?").get(n) as Issue | undefined;
  if (!issue) return null;
  const articles = reconstructItems(n, "article", "active_min DESC, minutes DESC");
  const socialPosts = reconstructItems(n, "social", "minutes DESC");
  const stats = statsForWindow(issue.week_start, issue.week_end);
  // 封面走同源路由（findCover exactOnly:本期封面或預設,絕不借用他期）
  const coverHtml = `<img src="/covers/${n}" alt="第 ${n} 期封面插畫" />`;
  return renderIssueDocument({ issue, articles, socialPosts, stats, coverHtml, digest: issueDigest(n) });
}

// 典藏櫥窗索引（由 listIssues 即時生成,連結走 /issues/N、封面走 /covers/N）。
export function renderArchiveIndex(): string {
  const cards = listIssues()
    .map((i) => {
      const label = i.title ? `№${i.number} · ${esc(i.title)}` : `№${i.number}`;
      const status = i.sent_at ? `已寄出 ${fmtDate(i.sent_at)}` : "編輯中";
      const { articles, social } = issueCounts(i.number);
      const digest = issueDigest(i.number);
      // 當週閱讀速寫：這一期「你在讀什麼、在想什麼」的一句編輯理解
      const digestHtml = digest ? `<span class="digest">${esc(digest)}</span>` : "";
      // 統計副標：幾篇深讀、幾則社群迴響
      const statsHtml =
        articles + social > 0 ? `<span class="stats">${articles} 篇深讀 · ${social} 則社群迴響</span>` : "";
      return `<a class="card" href="/issues/${i.number}">
      <div class="thumb"><img src="/covers/${i.number}" alt="${esc(label)} 封面" loading="lazy" /></div>
      <div class="meta"><b>${label}</b>${digestHtml}${statsHtml}<span class="date">${fmtDate(i.week_start)} — ${fmtDate(i.week_end)} · ${status}</span></div>
    </a>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Browstack 典藏</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #e6e1d5; font-family: "PingFang TC", "Noto Sans TC", sans-serif; color: #211c15; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 48px 24px 64px; }
  header { text-align: center; margin-bottom: 40px; }
  h1 { font-family: "Noto Serif TC", "Songti TC", serif; font-style: italic; font-weight: 900; font-size: 52px; }
  .tag { font-size: 11px; letter-spacing: .45em; color: #8d8474; text-transform: uppercase; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 28px; }
  .card { text-decoration: none; color: inherit; background: #faf6ee; box-shadow: 0 2px 24px rgba(60,50,30,.14);
    display: block; transition: transform .15s ease, box-shadow .15s ease; }
  .card:hover { transform: translateY(-3px); box-shadow: 0 6px 32px rgba(60,50,30,.22); }
  .thumb { line-height: 0; border-bottom: 3px double #d9d2c2; background: #f1ebdd; }
  .thumb img { width: 100%; height: auto; display: block; aspect-ratio: 2 / 3; object-fit: cover; }
  .meta { padding: 14px 18px 18px; }
  .meta b { font-family: "Noto Serif TC", serif; font-size: 18px; display: block; }
  .meta span { display: block; }
  .meta .digest { font-family: "Noto Serif TC", "Songti TC", serif; font-style: italic; font-size: 13.5px;
    line-height: 1.65; color: #4a4033; margin-top: 8px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .meta .stats { font-size: 12px; font-weight: 600; color: #b5361c; margin-top: 8px; }
  .meta .date { font-size: 12px; color: #8d8474; margin-top: 5px; }
  footer { text-align: center; margin-top: 48px; font-size: 11px; letter-spacing: .3em; color: #8d8474; }
</style>
</head>
<body>
  <div class="wrap">
    <header><h1>Browstack</h1><div class="tag">典藏 · Your Personal Weekly Digest</div></header>
    <div class="grid">
${cards}
    </div>
    <footer>資料未離開這台機器 · PUBLISHED FOR AN AUDIENCE OF ONE</footer>
  </div>
</body>
</html>`;
}
