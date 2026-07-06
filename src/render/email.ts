import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { getDb } from "../db.js";

/**
 * Email 版渲染器：讓週刊像一封真正的電子報寄進收件匣。
 * Email client 的限制：只用 inline style、不用 <style>/SVG/data-URI 圖片。
 * 封面圖在正式寄送管道（自建 email service）上線後改以 hosted URL 置入。
 */

const DAYS = 7;
const db = getDb();
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - DAYS * 86400;

interface PageItem {
  title: string;
  url: string;
  topic: string | null;
  summary: string | null;
}

const articles = db
  .prepare(
    `SELECT title, url, topic, summary FROM pages
      WHERE kind = 'article' AND is_knowledge = 1 AND summary IS NOT NULL AND last_seen > ?
      ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 10`,
  )
  .all(weekAgo) as PageItem[];
const socialPosts = db
  .prepare(
    `SELECT title, url, topic, summary FROM pages
      WHERE kind = 'social' AND is_knowledge = 1 AND summary IS NOT NULL AND last_seen > ?
      ORDER BY total_duration_sec DESC LIMIT 6`,
  )
  .all(weekAgo) as PageItem[];

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const cleanTitle = (s: string) => esc(s.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim());
const fmtDate = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

const ink = "#211c15";
const muted = "#8d8474";
const accent = "#b5361c";
const rule = "#d9d2c2";
const serif = `'Noto Serif TC','Songti TC',Georgia,serif`;
const sans = `'PingFang TC','Noto Sans TC',sans-serif`;

const groups = new Map<string, PageItem[]>();
for (const a of articles) {
  const key = a.topic ?? "其他";
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
      <a href="${esc(a.url)}" style="font-family:${serif};font-size:19px;font-weight:700;color:${ink};text-decoration:none;line-height:1.55;display:block;margin-top:2px">${cleanTitle(a.title)}</a>
      <ul style="margin:10px 0 0;padding-left:18px">${bullets}</ul>
      ${s.takeaway ? `<div style="margin-top:8px;font-family:${serif};font-size:14px;color:${accent};line-height:1.7">◈ ${esc(s.takeaway)}</div>` : ""}
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
      <div style="margin-top:10px;font-size:12px"><a href="${esc(p.url)}" style="color:${accent}">查看原文 →</a></div>
    </div>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;padding:0;background:#e6e1d5">
  <div style="max-width:600px;margin:0 auto;background:#faf6ee;font-family:${sans};color:${ink}">
    <div style="padding:32px 40px 20px;text-align:center">
      <div style="font-family:${serif};font-size:13px;font-weight:700;color:${accent};letter-spacing:.12em">№0 · 創刊預覽號 · ${fmtDate(weekAgo)} — ${fmtDate(now)}</div>
      <div style="font-family:${serif};font-style:italic;font-weight:900;font-size:46px;line-height:1.1;margin-top:4px">Browstack</div>
      <div style="margin-top:8px;font-size:10px;letter-spacing:.45em;color:${muted};text-transform:uppercase">Your Personal Weekly Digest</div>
    </div>
    <!--COVER-->
    <div style="padding:20px 40px 24px;text-align:center;border-bottom:3px double ${rule}">
      <div style="font-size:13px;line-height:1.9;color:${ink}">本期選輯自你過去七天的瀏覽足跡——${articles.length} 篇深讀與 ${socialPosts.length} 則社群迴響，附編輯摘要。</div>
    </div>
    <div style="padding:32px 40px">
      <div style="font-size:12px;letter-spacing:.4em;color:${accent};font-weight:600">01 · 本週深讀</div>
      ${articleHtml}
    </div>
    <div style="padding:32px 40px;border-top:1px solid ${rule}">
      <div style="font-size:12px;letter-spacing:.4em;color:${accent};font-weight:600;margin-bottom:18px">02 · 社群迴響</div>
      ${socialHtml}
    </div>
    <div style="padding:28px 40px 36px;border-top:3px double ${rule};text-align:center;font-size:11px;letter-spacing:.3em;color:${muted};line-height:2.2">
      BROWSTACK №0 · 由你的瀏覽紀錄自動編輯<br/>資料未離開你的機器 · PUBLISHED FOR AN AUDIENCE OF ONE
    </div>
  </div>
</body>
</html>`;

const outDir = path.join(CONFIG.dataDir, "..", "out");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "browstack-issue-0.email.html");
fs.writeFileSync(outPath, html);
console.log(`已產出 email 版：${outPath}（${articles.length} 篇深讀、${socialPosts.length} 則迴響）`);
