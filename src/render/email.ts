import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { getDb } from "../db.js";
import { ui } from "../i18n.js";
import { getCurrentIssue, issueDigest } from "../issue.js";
import { resolveContentLocale } from "../locale.js";
import { esc, safeHref } from "../shared/html.js";
import { selectIssueItems, type IssueItem } from "./select.js";

/**
 * Email renderer: makes the weekly read like a real newsletter landing in your inbox.
 * Email-client constraints: use only inline styles, no <style>/SVG/data-URI images.
 * The cover image will switch to a hosted URL once the real send channel (self-hosted email service) is live.
 */

const DAYS = 7;
const db = getDb();
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - DAYS * 86400;
const issue = getCurrentIssue();
const digest = issueDigest(issue.number); // This week's intro line (not shown if absent)
const locale = resolveContentLocale();
const t = ui(locale.code);

const { articles, socialPosts } = selectIssueItems(weekAgo);

// Safety: never send an empty issue (if enrich fully fails, skip this week rather than send a blank email)
if (articles.length + socialPosts.length === 0) {
  console.error("This issue has no enriched content; refusing to produce an empty issue. Run npm run enrich first.");
  process.exit(2);
}

// Record this issue's selection: on publish (successful send) these pages get marked as published so they're never re-selected
db.transaction(() => {
  db.prepare("DELETE FROM issue_items WHERE issue_number = ?").run(issue.number);
  const ins = db.prepare("INSERT OR IGNORE INTO issue_items (issue_number, page_id) VALUES (?, ?)");
  for (const item of [...articles, ...socialPosts]) ins.run(issue.number, item.id);
})();

const cleanTitle = (s: string) => esc(s.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim());
const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "");

const ink = "#211c15";
const muted = "#8d8474";
const accent = "#b5361c";
const rule = "#d9d2c2";
const serif = `'Noto Serif TC','Songti TC',Georgia,serif`;
const sans = `'PingFang TC','Noto Sans TC',sans-serif`;

const groups = new Map<string, IssueItem[]>();
for (const a of articles) {
  const key = a.topic ?? t.otherTopic;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(a);
}

let rank = 0;
const articleHtml = [...groups.entries()]
  .map(([topic, items]) => {
    const cards = items
      .map((a) => {
        rank++;
        const s = JSON.parse(a.summary!) as { bullets?: string[]; takeaway?: string };
        const bullets = (s.bullets ?? [])
          .map(
            (b) =>
              `<li style="font-size:14px;line-height:1.9;margin:0 0 4px;color:${ink}">${esc(b)}</li>`,
          )
          .join("");
        return `
    <div style="padding:18px 0;border-top:1px dotted ${rule}">
      <div style="font-family:${serif};font-size:15px;font-weight:700;color:${accent}">${String(rank).padStart(2, "0")}</div>
      <a href="${safeHref(a.url)}" style="font-family:${serif};font-size:19px;font-weight:700;color:${ink};text-decoration:none;line-height:1.55;display:block;margin-top:2px">${cleanTitle(a.title)}</a>
      <ul style="margin:10px 0 0;padding-left:18px">${bullets}</ul>
      ${s.takeaway ? `<div style="margin-top:8px;font-family:${serif};font-size:14px;color:${accent};line-height:1.7">◈ ${esc(s.takeaway)}</div>` : ""}
      <div style="margin-top:8px;font-size:12px;color:${muted}">${hostOf(a.url)} · ${t.signal(a.active_min, a.minutes, !!a.capped)}</div>
    </div>`;
      })
      .join("\n");
    return `<div style="font-family:${serif};font-size:14px;letter-spacing:.2em;color:${ink};margin:24px 0 2px;font-weight:700;border-bottom:2px solid ${ink};display:inline-block;padding-bottom:4px">${esc(topic)}</div>${cards}`;
  })
  .join("\n");

const socialHtml = socialPosts
  .map((p) => {
    const s = JSON.parse(p.summary!) as { context?: string };
    return `
    <div style="background:#f1ebdd;border-left:3px solid ${accent};padding:16px 20px;margin:0 0 16px">
      ${s.context ? `<div style="font-size:13px;font-weight:600;color:${accent};line-height:1.7;margin-bottom:8px">${esc(s.context)}</div>` : ""}
      <div style="font-family:${serif};font-size:14px;line-height:1.9;color:${ink}">${esc(p.title.replace(/^\(\d+\)\s*/, "").trim().slice(0, 220))}${p.title.length > 220 ? "…" : ""}</div>
      <div style="margin-top:10px;font-size:12px;color:${muted}">${t.signal(p.active_min, p.minutes, !!p.capped)} · <a href="${safeHref(p.url)}" style="color:${accent}">${t.viewOriginal} →</a></div>
    </div>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="${locale.code}">
<body style="margin:0;padding:0;background:#e6e1d5">
  <div style="max-width:600px;margin:0 auto;background:#faf6ee;font-family:${sans};color:${ink}">
    <div style="padding:32px 40px 20px;text-align:center">
      <div style="font-family:${serif};font-size:13px;font-weight:700;color:${accent};letter-spacing:.12em">№${issue.number}${issue.title ? " · " + issue.title : ""} · ${t.date(weekAgo)} — ${t.date(now)}</div>
      <div style="font-family:${serif};font-style:italic;font-weight:900;font-size:46px;line-height:1.1;margin-top:4px">Browstack</div>
      <div style="margin-top:8px;font-size:10px;letter-spacing:.45em;color:${muted};text-transform:uppercase">Your Personal Weekly Digest</div>
    </div>
    <!--COVER-->
    <div style="padding:22px 40px 24px;text-align:center;border-bottom:3px double ${rule}">
      ${digest ? `<div style="font-family:${serif};font-style:italic;font-size:16px;line-height:1.7;color:${ink};margin-bottom:10px">${esc(digest)}</div>` : ""}
      <div style="font-size:13px;line-height:1.9;color:${muted}">${t.issueNote(null, articles.length, socialPosts.length)}</div>
    </div>
    <div style="padding:32px 40px">
      <div style="font-size:12px;letter-spacing:.4em;color:${accent};font-weight:600">01 · ${t.deepReads}</div>
      ${articleHtml}
    </div>
    <div style="padding:32px 40px;border-top:1px solid ${rule}">
      <div style="font-size:12px;letter-spacing:.4em;color:${accent};font-weight:600;margin-bottom:18px">02 · ${t.socialEchoes}</div>
      ${socialHtml}
    </div>
    <!--ARCHIVE_LINK-->
    <div style="padding:28px 40px 36px;border-top:3px double ${rule};text-align:center;font-size:11px;letter-spacing:.3em;color:${muted};line-height:2.2">
      BROWSTACK №${issue.number} · ${t.colophonAuto}<br/>${t.colophonAudience}
    </div>
  </div>
</body>
</html>`;

const outDir = path.join(CONFIG.dataDir, "..", "out");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `browstack-issue-${issue.number}.email.html`);
fs.writeFileSync(outPath, html);
console.log(`Generated email version: ${outPath} (${articles.length} deep reads, ${socialPosts.length} social echoes)`);
