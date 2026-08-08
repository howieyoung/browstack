import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { getDb } from "../db.js";
import { ui } from "../i18n.js";
import { findCover, getCurrentIssue, issueDigest, listIssues } from "../issue.js";
import { resolveContentLocale } from "../locale.js";
import { renderIssueDocument, type IssueStats } from "./issueView.js";
import { selectIssueItems } from "./select.js";

/**
 * Weekly web-version renderer: produces out/browstack-issue-N.html and the archive index out/index.html
 * (for opening directly via file:// and for npm run preview; the server has its own live-rendered /archive).
 * The single-issue layout shares issueView with archive to keep the look consistent.
 */

const CHROME_EPOCH_OFFSET_SEC = 11_644_473_600;
const toChromeTime = (unixSec: number) => (unixSec + CHROME_EPOCH_OFFSET_SEC) * 1_000_000;

const db = getDb();
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - 7 * 86400;
const weekChrome = toChromeTime(weekAgo);

const { articles, socialPosts } = selectIssueItems(weekAgo);
const footprint = db
  .prepare("SELECT COUNT(*) AS visits FROM visits_log WHERE visit_time > ?")
  .get(weekChrome) as { visits: number };
const reading = db
  .prepare(
    `SELECT COUNT(DISTINCT p.id) AS pages, ROUND(SUM(v.duration_sec) / 60.0) AS minutes
       FROM visits_log v JOIN pages p ON p.id = v.page_id
      WHERE v.visit_time > ? AND p.kind IN ('article', 'social')`,
  )
  .get(weekChrome) as { pages: number; minutes: number };
const deviceSplit = db
  .prepare("SELECT v.device, COUNT(*) AS n FROM visits_log v WHERE v.visit_time > ? GROUP BY v.device")
  .all(weekChrome) as Array<{ device: string; n: number }>;
const mobileVisits = deviceSplit.find((d) => d.device === "mobile")?.n ?? 0;
const totalVisits = deviceSplit.reduce((a, d) => a + d.n, 0);

const issue = getCurrentIssue();
const locale = resolveContentLocale();
const t = ui(locale.code);

// Cover: this issue's png/jpg (base64 data-URI) / svg (inline) → most recent issue → default (a render failure never blocks publishing)
const coverPath = findCover(issue.number);
let coverHtml = "";
if (coverPath?.endsWith(".png") || coverPath?.endsWith(".jpg")) {
  const mime = coverPath.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const b64 = fs.readFileSync(coverPath).toString("base64");
  coverHtml = `<img src="data:${mime};base64,${b64}" alt="${t.coverAlt(issue.number)}" />`;
} else if (coverPath?.endsWith(".svg")) {
  coverHtml = fs.readFileSync(coverPath, "utf8");
}

const stats: IssueStats = {
  footprintVisits: footprint.visits,
  mobileVisits,
  totalVisits,
  readingPages: reading.pages,
  readingMinutes: Math.round(reading.minutes ?? 0),
};
const html = renderIssueDocument({
  issue,
  articles,
  socialPosts,
  stats,
  coverHtml,
  digest: issueDigest(issue.number),
  localeCode: locale.code,
});

const outDir = path.join(CONFIG.dataDir, "..", "out");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `browstack-issue-${issue.number}.html`);
fs.writeFileSync(outPath, html);

// Archive index: out/index.html lists all past issues (file:// version; the server has its own live /archive)
const zh = locale.code.startsWith("zh");
const archiveRows = listIssues()
  .map((i) => {
    const cover = findCover(i.number);
    const coverLink = cover ? ` · <a href="../assets/covers/${path.basename(cover)}">${zh ? "封面" : "cover"}</a>` : "";
    const emailFile = `browstack-issue-${i.number}.email.html`;
    const emailLink = fs.existsSync(path.join(outDir, emailFile)) ? ` · <a href="${emailFile}">${zh ? "email 版" : "email"}</a>` : "";
    const status = i.sent_at ? t.statusSent(t.date(i.sent_at)) : t.statusEditing;
    const dt = i.number === 0 ? t.inauguralTitle : i.title;
    return `<li><a href="browstack-issue-${i.number}.html"><b>№${i.number}${dt ? " · " + dt : ""}</b></a>
      <span>${t.date(i.week_start)} — ${t.date(i.week_end)} · ${status}${coverLink}${emailLink}</span></li>`;
  })
  .join("\n");
const indexHtml = `<!doctype html>
<html lang="${locale.code}"><head><meta charset="utf-8" /><title>Browstack ${zh ? "典藏" : "Archive"}</title>
<style>
  body { background:#e6e1d5; font-family:"PingFang TC",sans-serif; color:#211c15; }
  .sheet { max-width:640px; margin:40px auto; background:#faf6ee; padding:48px 56px; box-shadow:0 2px 40px rgba(60,50,30,.18); }
  h1 { font-family:"Noto Serif TC",serif; font-style:italic; font-weight:900; font-size:40px; }
  p.tag { font-size:11px; letter-spacing:.4em; color:#8d8474; text-transform:uppercase; margin:6px 0 28px; }
  ul { list-style:none; padding:0; } li { padding:14px 0; border-top:1px dotted #d9d2c2; }
  li a { color:#211c15; text-decoration:none; font-family:"Noto Serif TC",serif; font-size:18px; }
  li a:hover { color:#b5361c; } li span { display:block; margin-top:4px; font-size:12px; color:#8d8474; }
  li span a { font-size:12px; color:#b5361c; }
</style></head>
<body><div class="sheet"><h1>Browstack</h1><p class="tag">${t.archiveTagline}</p>
<ul>${archiveRows}</ul></div></body></html>`;
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml);

console.log(`Generated: ${outPath}`);
