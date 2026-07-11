import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { getDb } from "../db.js";
import { getCurrentIssue } from "../issue.js";
import { selectIssueItems, type IssueItem } from "./select.js";

/**
 * Email 版渲染器：讓週刊像一封真正的電子報寄進收件匣。
 * Email client 的限制：只用 inline style、不用 <style>/SVG/data-URI 圖片。
 * 封面圖在正式寄送管道（自建 email service）上線後改以 hosted URL 置入。
 */

const DAYS = 7;
const db = getDb();
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - DAYS * 86400;
const issue = getCurrentIssue();

const { articles, socialPosts } = selectIssueItems(weekAgo);

// 保險：空刊物絕不寄出（enrich 全掛時寧可這週停刊，也不寄一封空信）
if (articles.length + socialPosts.length === 0) {
  console.error("本期沒有任何已增潤的內容，拒絕產出空刊物。請先跑 npm run enrich。");
  process.exit(2);
}

// 記錄本期選材：封刊（send 成功）時據此把這些頁面標記為已刊登，永不重複入選
db.transaction(() => {
  db.prepare("DELETE FROM issue_items WHERE issue_number = ?").run(issue.number);
  const ins = db.prepare("INSERT OR IGNORE INTO issue_items (issue_number, page_id) VALUES (?, ?)");
  for (const item of [...articles, ...socialPosts]) ins.run(issue.number, item.id);
})();

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const cleanTitle = (s: string) => esc(s.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim());
const fmtDate = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};
// 你當時讀了多久——這就是它被選進本期的原因（capped＝掛置分頁撞到 20 分上限，顯示為 20+）
const signalLabel = (i: IssueItem) =>
  i.active_min > 0
    ? `本週你實讀了 ${i.active_min} 分鐘`
    : `本週你停留了 ${i.minutes}${i.capped ? "+" : ""} 分鐘`;
const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "");

const ink = "#211c15";
const muted = "#8d8474";
const accent = "#b5361c";
const rule = "#d9d2c2";
const serif = `'Noto Serif TC','Songti TC',Georgia,serif`;
const sans = `'PingFang TC','Noto Sans TC',sans-serif`;

const groups = new Map<string, IssueItem[]>();
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
      <div style="margin-top:8px;font-size:12px;color:${muted}">${hostOf(a.url)} · ${signalLabel(a)}</div>
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
      <div style="margin-top:10px;font-size:12px;color:${muted}">${signalLabel(p)} · <a href="${esc(p.url)}" style="color:${accent}">查看原文 →</a></div>
    </div>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;padding:0;background:#e6e1d5">
  <div style="max-width:600px;margin:0 auto;background:#faf6ee;font-family:${sans};color:${ink}">
    <div style="padding:32px 40px 20px;text-align:center">
      <div style="font-family:${serif};font-size:13px;font-weight:700;color:${accent};letter-spacing:.12em">№${issue.number} · ${issue.title} · ${fmtDate(weekAgo)} — ${fmtDate(now)}</div>
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
      BROWSTACK №${issue.number} · 由你的瀏覽紀錄自動編輯<br/>資料未離開你的機器 · PUBLISHED FOR AN AUDIENCE OF ONE
    </div>
  </div>
</body>
</html>`;

const outDir = path.join(CONFIG.dataDir, "..", "out");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `browstack-issue-${issue.number}.email.html`);
fs.writeFileSync(outPath, html);
console.log(`已產出 email 版：${outPath}（${articles.length} 篇深讀、${socialPosts.length} 則迴響）`);
