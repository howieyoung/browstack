import fs from "node:fs";
import { ingestChromeHistory } from "./ingest/chrome.js";
import { classifyUrl } from "./classify/filter.js";
import { getDb } from "./db.js";
import {
  applyEnrichment,
  enrich,
  fetchMissingContent,
  getCandidates,
  type EnrichmentRecord,
} from "./pipeline/enrich.js";

function cmdIngest(): void {
  const s = ingestChromeHistory();
  console.log(`已處理 ${s.visitsProcessed} 筆造訪（增量）`);
  console.log(`頁面：新增 ${s.pagesNew}、更新 ${s.pagesUpdated}；敏感頁面略過不儲存 ${s.sensitiveSkipped} 筆`);
  const kinds = Object.entries(s.kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join("、");
  if (kinds) console.log(`造訪分類：${kinds}`);
}

function cmdStats(): void {
  const db = getDb();
  console.log("== 頁面分類統計 ==");
  const byKind = db
    .prepare("SELECT kind, COUNT(*) AS n FROM pages GROUP BY kind ORDER BY n DESC")
    .all() as Array<{ kind: string; n: number }>;
  for (const r of byKind) console.log(`  ${r.kind.padEnd(8)} ${r.n}`);

  const byDevice = db
    .prepare("SELECT devices, COUNT(*) AS n FROM pages GROUP BY devices ORDER BY n DESC")
    .all() as Array<{ devices: string; n: number }>;
  console.log("== 裝置來源 ==");
  for (const r of byDevice) console.log(`  ${r.devices.padEnd(8)} ${r.n}`);

  const captures = db
    .prepare("SELECT COUNT(*) AS n, SUM(content_text IS NOT NULL) AS with_text FROM captures")
    .get() as { n: number; with_text: number | null };
  console.log(`== Extension 擷取 ==`);
  console.log(`  共 ${captures.n} 筆（含正文 ${captures.with_text ?? 0} 筆）`);

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  // 真實閱讀訊號（extension 的主動閱讀秒數）優先，history 停留時間次之
  const top = db
    .prepare(
      `SELECT title, url, total_visits, ROUND(total_duration_sec / 60.0, 1) AS minutes,
              ROUND(active_seconds_total / 60.0, 1) AS active_min, devices
         FROM pages
        WHERE kind IN ('article', 'social') AND last_seen > ?
        ORDER BY active_seconds_total DESC, total_duration_sec DESC
        LIMIT 10`,
    )
    .all(weekAgo) as Array<{
    title: string | null;
    url: string;
    total_visits: number;
    minutes: number;
    active_min: number;
    devices: string;
  }>;
  console.log("== 近 7 天高價值內容候選 ==");
  for (const r of top) {
    const host = new URL(r.url).hostname;
    const signal = r.active_min > 0 ? `⚡${r.active_min} 分實讀` : `${r.minutes} 分停留`;
    console.log(`  [${signal}] ${r.title ?? "(無標題)"} — ${host}（${r.total_visits} 次造訪，${r.devices}）`);
  }
}

// 分類規則更新後，重跑既有頁面：修正 kind、清除已入庫的敏感頁
function cmdReclassify(): void {
  const db = getDb();
  const pages = db.prepare("SELECT id, url, kind FROM pages").all() as Array<{
    id: number;
    url: string;
    kind: string;
  }>;
  let changed = 0;
  let purged = 0;
  const updateKind = db.prepare("UPDATE pages SET kind = ? WHERE id = ?");
  const deleteVisits = db.prepare("DELETE FROM visits_log WHERE page_id = ?");
  const deletePage = db.prepare("DELETE FROM pages WHERE id = ?");
  db.transaction(() => {
    for (const p of pages) {
      const c = classifyUrl(p.url);
      if (c.sensitive) {
        deleteVisits.run(p.id);
        deletePage.run(p.id);
        purged++;
      } else if (c.kind !== p.kind) {
        updateKind.run(c.kind, p.id);
        changed++;
      }
    }
  })();
  console.log(`重新分類完成：更新 ${changed} 頁、清除敏感頁 ${purged} 頁（含其造訪紀錄）`);
}

const cmd = process.argv[2];
switch (cmd) {
  case "ingest":
    cmdIngest();
    break;
  case "stats":
    cmdStats();
    break;
  case "reclassify":
    cmdReclassify();
    break;
  case "enrich":
    await enrich();
    break;
  // 以下三個是 enrich 的分解步驟，供除錯與人工編輯流程使用
  case "candidates":
    console.log(JSON.stringify(getCandidates(), null, 1));
    break;
  case "fetch-content":
    await fetchMissingContent();
    break;
  case "apply": {
    const file = process.argv[3];
    if (!file) {
      console.error("用法：apply <enrichment.json>");
      process.exit(1);
    }
    const records = JSON.parse(fs.readFileSync(file, "utf8")) as EnrichmentRecord[];
    const { updated, upgraded } = applyEnrichment(records);
    console.log(`已套用 ${updated} 筆（unknown 升級為文章 ${upgraded} 筆）`);
    break;
  }
  default:
    console.log("用法：ingest | stats | reclassify | enrich | candidates | fetch-content | apply <file>");
    process.exit(1);
}
