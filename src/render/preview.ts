import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { getDb } from "../db.js";
import { findCover, getCurrentIssue, listIssues } from "../issue.js";

/**
 * 週刊渲染器 v2：知識型內容 ＋ 編輯摘要 ＋ 主題分組 ＋ 封面插畫。
 * 只收 is_knowledge=1 的內容——非知識型內容無論停留多久都不入刊。
 */

const CHROME_EPOCH_OFFSET_SEC = 11_644_473_600;
const toChromeTime = (unixSec: number) => (unixSec + CHROME_EPOCH_OFFSET_SEC) * 1_000_000;

const db = getDb();
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - 7 * 86400;

interface PageItem {
  title: string;
  url: string;
  topic: string | null;
  summary: string | null;
  total_visits: number;
  minutes: number;
  active_min: number;
  devices: string;
}

const articles = db
  .prepare(
    `SELECT title, url, topic, summary, total_visits,
            ROUND(total_duration_sec / 60.0, 1) AS minutes,
            ROUND(active_seconds_total / 60.0, 1) AS active_min, devices
       FROM pages
      WHERE kind = 'article' AND is_knowledge = 1 AND summary IS NOT NULL AND last_seen > ?
      ORDER BY active_seconds_total DESC, total_duration_sec DESC
      LIMIT 10`,
  )
  .all(weekAgo) as PageItem[];

const socialPosts = db
  .prepare(
    `SELECT title, url, topic, summary, total_visits,
            ROUND(total_duration_sec / 60.0, 1) AS minutes,
            ROUND(active_seconds_total / 60.0, 1) AS active_min, devices
       FROM pages
      WHERE kind = 'social' AND is_knowledge = 1 AND summary IS NOT NULL AND last_seen > ?
      ORDER BY total_duration_sec DESC
      LIMIT 6`,
  )
  .all(weekAgo) as PageItem[];

const weekChrome = toChromeTime(weekAgo);
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

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const cleanTitle = (s: string) => esc(s.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim());
const deviceLabel = (d: string) => (d === "both" ? "桌機＋手機" : d === "mobile" ? "手機" : "桌機");
const signalLabel = (i: PageItem) =>
  i.active_min > 0 ? `⚡ ${i.active_min} 分實讀` : `${i.minutes} 分停留`;
const fmtDate = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

const mobileVisits = deviceSplit.find((d) => d.device === "mobile")?.n ?? 0;
const totalVisits = deviceSplit.reduce((a, d) => a + d.n, 0);

// 主題分組：依組內最強訊號排序
const topicGroups = new Map<string, PageItem[]>();
for (const a of articles) {
  const key = a.topic ?? "其他";
  if (!topicGroups.has(key)) topicGroups.set(key, []);
  topicGroups.get(key)!.push(a);
}

let rank = 0;
const articleHtml = [...topicGroups.entries()]
  .map(([topic, items]) => {
    const cards = items
      .map((a) => {
        rank++;
        const s = JSON.parse(a.summary!) as { bullets?: string[]; takeaway?: string };
        const bullets = (s.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join("");
        return `
      <div class="item">
        <div class="rank">${String(rank).padStart(2, "0")}</div>
        <div class="item-body">
          <a class="item-title" href="${esc(a.url)}">${cleanTitle(a.title)}</a>
          <ul class="sum">${bullets}</ul>
          ${s.takeaway ? `<div class="takeaway">◈ ${esc(s.takeaway)}</div>` : ""}
          <div class="item-meta">${new URL(a.url).hostname.replace(/^www\./, "")} · ${signalLabel(a)} · ${deviceLabel(a.devices)}</div>
        </div>
      </div>`;
      })
      .join("\n");
    return `<h3 class="topic">${esc(topic)}</h3>\n${cards}`;
  })
  .join("\n");

const socialHtml = socialPosts
  .map((p) => {
    const s = JSON.parse(p.summary!) as { context?: string };
    const source = /threads\./.test(p.url) ? "Threads" : /facebook\./.test(p.url) ? "Facebook" : /linkedin\./.test(p.url) ? "LinkedIn" : "社群";
    return `
      <div class="quote">
        ${s.context ? `<div class="quote-context">${esc(s.context)}</div>` : ""}
        <div class="quote-text">${esc(p.title.replace(/^\(\d+\)\s*/, "").trim())}</div>
        <div class="quote-meta"><span class="badge">${source}</span> ${signalLabel(p)} · <a href="${esc(p.url)}">查看原文</a></div>
      </div>`;
  })
  .join("\n");

const issue = getCurrentIssue();
const issueLabel = `№${issue.number} · ${issue.title}`;

// 封面：本期 PNG → 本期 SVG → 最近一期封面（渲染失敗不擋出刊）
const coverPath = findCover(issue.number);
let coverSvg = "";
if (coverPath?.endsWith(".png")) {
  const b64 = fs.readFileSync(coverPath).toString("base64");
  coverSvg = `<img src="data:image/png;base64,${b64}" alt="本期封面插畫" style="width:100%;display:block" />`;
} else if (coverPath?.endsWith(".svg")) {
  coverSvg = fs.readFileSync(coverPath, "utf8");
}

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Browstack ${issueLabel}</title>
<style>
  :root {
    --paper: #faf6ee; --paper-deep: #f1ebdd; --ink: #211c15; --muted: #8d8474;
    --accent: #b5361c; --rule: #d9d2c2;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: #e6e1d5; font-family: "PingFang TC", "Noto Sans TC", sans-serif; color: var(--ink); }
  .sheet { max-width: 760px; margin: 40px auto; background: var(--paper); box-shadow: 0 2px 40px rgba(60,50,30,.18); }

  .nameplate { padding: 30px 48px 22px; text-align: center; }
  .np-row { display: flex; justify-content: space-between; align-items: baseline;
    font-family: "Noto Serif TC", serif; font-size: 14px; font-weight: 700;
    color: var(--accent); letter-spacing: .12em; }
  .np-title { font-family: "Noto Serif TC", "Songti TC", serif; font-style: italic;
    font-weight: 900; font-size: 60px; line-height: 1.05; color: var(--ink); margin-top: 4px; }
  .np-tagline { margin-top: 10px; font-size: 11px; letter-spacing: .48em;
    color: var(--muted); text-transform: uppercase; }
  .cover-art { line-height: 0; border-top: 3px double var(--rule); border-bottom: 3px double var(--rule); }
  .cover-art svg { width: 100%; height: auto; display: block; }
  .cover-info { padding: 26px 64px 34px; border-bottom: 3px double var(--rule); }
  .issue-note { margin-top: 18px; font-size: 14px; line-height: 1.9; max-width: 34em; }
  .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 24px;
    border-top: 1px solid var(--rule); padding-top: 18px; gap: 12px; }
  .stat b { display: block; font-family: "Noto Serif TC", serif; font-size: 28px; font-weight: 700; }
  .stat span { font-size: 12px; color: var(--muted); letter-spacing: .15em; }

  section { padding: 44px 64px; }
  section + section { border-top: 1px solid var(--rule); }
  h2 { font-size: 13px; letter-spacing: .4em; color: var(--accent); font-weight: 600; margin-bottom: 6px; }
  .section-note { font-size: 12px; color: var(--muted); margin-bottom: 24px; line-height: 1.8; }
  .topic { font-family: "Noto Serif TC", serif; font-size: 15px; letter-spacing: .25em;
    color: var(--ink); margin: 26px 0 4px; padding-bottom: 6px; border-bottom: 2px solid var(--ink); display: inline-block; }

  .item { display: grid; grid-template-columns: 56px 1fr; gap: 14px; padding: 18px 0; }
  .item + .item { border-top: 1px dotted var(--rule); }
  .rank { font-family: "Noto Serif TC", serif; font-size: 26px; font-weight: 700; color: var(--accent); opacity: .85; }
  .item-title { font-family: "Noto Serif TC", "Songti TC", serif; font-size: 20px; font-weight: 700;
    color: var(--ink); text-decoration: none; line-height: 1.55; display: block; }
  .item-title:hover { color: var(--accent); }
  .sum { margin: 12px 0 0; padding-left: 18px; }
  .sum li { font-size: 14px; line-height: 1.9; margin-bottom: 4px; }
  .takeaway { margin-top: 10px; font-family: "Noto Serif TC", serif; font-size: 14px;
    color: var(--accent); line-height: 1.7; }
  .item-meta { margin-top: 10px; font-size: 12px; color: var(--muted); }

  .quote { background: var(--paper-deep); border-left: 3px solid var(--accent);
    padding: 18px 24px 16px 22px; margin: 0 0 18px; }
  .quote-context { font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 10px; line-height: 1.7; }
  .quote-text { font-family: "Noto Serif TC", "Songti TC", serif; font-size: 15px; line-height: 2;
    display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .quote-meta { margin-top: 12px; font-size: 12px; color: var(--muted); }
  .quote-meta a { color: var(--accent); }
  .badge { border: 1px solid var(--rule); padding: 1px 8px; border-radius: 10px; margin-right: 6px; }

  .figures { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; font-size: 14px; line-height: 2.1; }
  .figures b { font-family: "Noto Serif TC", serif; }

  .colophon { text-align: center; padding: 36px 64px 44px; border-top: 3px double var(--rule);
    font-size: 11px; letter-spacing: .3em; color: var(--muted); line-height: 2.4; }
</style>
</head>
<body>
<div class="sheet">
  <div class="nameplate">
    <div class="np-row"><span>${issueLabel}</span><span>${fmtDate(weekAgo)} — ${fmtDate(now)}</span></div>
    <div class="np-title">Browstack</div>
    <div class="np-tagline">Your Personal Weekly Digest</div>
  </div>
  <div class="cover-art">${coverSvg}</div>
  <div class="cover-info">
    <p class="issue-note">本期選輯自你過去七天的 ${footprint.visits.toLocaleString()} 次瀏覽足跡——
      ${articles.length} 篇深讀與 ${socialPosts.length} 則社群迴響，附編輯摘要。</p>
    <div class="stat-strip">
      <div class="stat"><b>${articles.length}</b><span>本週深讀</span></div>
      <div class="stat"><b>${socialPosts.length}</b><span>社群迴響</span></div>
      <div class="stat"><b>${Math.round(reading.minutes ?? 0)}</b><span>內容分鐘</span></div>
    </div>
  </div>

  <section>
    <h2>01 · 本週深讀</h2>
    ${articleHtml}
  </section>

  <section>
    <h2>02 · 社群迴響</h2>
    ${socialHtml}
  </section>

  <section>
    <h2>03 · 一週圖譜</h2>
    <div class="figures">
      <div>瀏覽足跡 <b>${footprint.visits.toLocaleString()}</b> 次</div>
      <div>手機佔比 <b>${totalVisits > 0 ? Math.round((100 * mobileVisits) / totalVisits) : 0}%</b></div>
      <div>內容頁造訪 <b>${reading.pages}</b> 頁</div>
      <div>內容停留 <b>${Math.round(reading.minutes ?? 0)}</b> 分鐘</div>
    </div>
  </section>

  <div class="colophon">
    BROWSTACK №${issue.number} · 由你的瀏覽紀錄自動編輯<br />
    資料未離開這台機器 · PUBLISHED FOR AN AUDIENCE OF ONE
  </div>
</div>
</body>
</html>`;

const outDir = path.join(CONFIG.dataDir, "..", "out");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `browstack-issue-${issue.number}.html`);
fs.writeFileSync(outPath, html);

// 典藏索引：out/index.html 列出歷來各期
const archiveRows = listIssues()
  .map((i) => {
    const cover = findCover(i.number);
    const coverLink = cover ? ` · <a href="../assets/covers/${path.basename(cover)}">封面</a>` : "";
    const emailFile = `browstack-issue-${i.number}.email.html`;
    const emailLink = fs.existsSync(path.join(outDir, emailFile)) ? ` · <a href="${emailFile}">email 版</a>` : "";
    const status = i.sent_at ? `已寄出 ${new Date(i.sent_at * 1000).toLocaleDateString("zh-TW")}` : "編輯中";
    return `<li><a href="browstack-issue-${i.number}.html"><b>№${i.number} · ${i.title}</b></a>
      <span>${fmtDate(i.week_start)} — ${fmtDate(i.week_end)} · ${status}${coverLink}${emailLink}</span></li>`;
  })
  .join("\n");
const indexHtml = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8" /><title>Browstack 典藏</title>
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
<body><div class="sheet"><h1>Browstack</h1><p class="tag">Archive · Your Personal Weekly Digest</p>
<ul>${archiveRows}</ul></div></body></html>`;
fs.writeFileSync(path.join(outDir, "index.html"), indexHtml);

console.log(`已產出：${outPath}`);
console.log(`本期 ${issueLabel}：文章 ${articles.length} 篇（${topicGroups.size} 個主題）、社群貼文 ${socialPosts.length} 則`);
console.log(`典藏索引：${path.join(outDir, "index.html")}`);
