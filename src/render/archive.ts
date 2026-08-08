import { getDb } from "../db.js";
import { ui } from "../i18n.js";
import { type Issue, issueDigest, listIssues } from "../issue.js";
import { resolveContentLocale } from "../locale.js";
import { esc } from "../shared/html.js";
import { renderIssueDocument, type IssueStats } from "./issueView.js";
import type { IssueItem } from "./select.js";

/**
 * Live rendering of the archive (server-side): the whole showcase and every issue are rebuilt
 * from the current DB, never written to disk. Past issues (including ones only sent by email,
 * with no web version) are faithfully rebuilt from the issues cycle + issue_items + persisted
 * pages.summary; signals (minutes/active reading) are recomputed over that issue's stored week
 * window, and covers use same-origin /covers/N.
 */

const CHROME_EPOCH_OFFSET_SEC = 11_644_473_600;
const toChromeTime = (unixSec: number) => (unixSec + CHROME_EPOCH_OFFSET_SEC) * 1_000_000;

// Recompute an issue's selected items of a given kind over the stored week window [start,end] (signals computed from in-window visits, consistent with the original publication).
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

// Count of selected items for an issue (used in the showcase subheading). Issues with no issue_items (e.g. №0) return 0/0.
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

// Single-issue web page (rebuilt from DB). Returns null if the issue isn't found (→ server 404).
export function renderIssuePage(n: number): string | null {
  const db = getDb();
  const issue = db.prepare("SELECT * FROM issues WHERE number = ?").get(n) as Issue | undefined;
  if (!issue) return null;
  const articles = reconstructItems(n, "article", "active_min DESC, minutes DESC");
  const socialPosts = reconstructItems(n, "social", "minutes DESC");
  const stats = statsForWindow(issue.week_start, issue.week_end);
  const locale = resolveContentLocale();
  // Cover uses the same-origin route (findCover exactOnly: this issue's cover or the default, never borrow another issue's)
  const coverHtml = `<img src="/covers/${n}" alt="${ui(locale.code).coverAlt(n)}" />`;
  return renderIssueDocument({
    issue,
    articles,
    socialPosts,
    stats,
    coverHtml,
    digest: issueDigest(n),
    localeCode: locale.code,
  });
}

// Archive showcase index (generated live from listIssues; links go to /issues/N, covers to /covers/N).
export function renderArchiveIndex(): string {
  const locale = resolveContentLocale();
  const t = ui(locale.code);
  const cards = listIssues()
    .map((i) => {
      const dt = i.number === 0 ? t.inauguralTitle : i.title;
      const label = dt ? `№${i.number} · ${esc(dt)}` : `№${i.number}`;
      const status = i.sent_at ? t.statusSent(t.date(i.sent_at)) : t.statusEditing;
      const { articles, social } = issueCounts(i.number);
      const digest = issueDigest(i.number);
      // Reading sketch for the week: a one-line editorial take on "what you were reading and thinking" this issue
      const digestHtml = digest ? `<span class="digest">${esc(digest)}</span>` : "";
      // Stats subheading: how many deep reads, how many social echoes
      const statsHtml = articles + social > 0 ? `<span class="stats">${t.counts(articles, social)}</span>` : "";
      return `<a class="card" href="/issues/${i.number}">
      <div class="thumb"><img src="/covers/${i.number}" alt="${esc(t.coverAlt(i.number))}" loading="lazy" /></div>
      <div class="meta"><b>${label}</b>${digestHtml}${statsHtml}<span class="date">${t.date(i.week_start)} — ${t.date(i.week_end)} · ${status}</span></div>
    </a>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${locale.code}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Browstack ${locale.code.startsWith("zh") ? "典藏" : "Archive"}</title>
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
    <header><h1>Browstack</h1><div class="tag">${t.archiveTagline}</div></header>
    <div class="grid">
${cards}
    </div>
    <footer>${t.archiveFooter}</footer>
  </div>
</body>
</html>`;
}
