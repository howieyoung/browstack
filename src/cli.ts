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
  console.log(`Processed ${s.visitsProcessed} visits (incremental)`);
  console.log(`Pages: ${s.pagesNew} added, ${s.pagesUpdated} updated; ${s.sensitiveSkipped} sensitive pages skipped (not stored)`);
  const kinds = Object.entries(s.kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join("、");
  if (kinds) console.log(`Visit classification: ${kinds}`);
}

function cmdStats(): void {
  const db = getDb();
  console.log("== Page classification stats ==");
  const byKind = db
    .prepare("SELECT kind, COUNT(*) AS n FROM pages GROUP BY kind ORDER BY n DESC")
    .all() as Array<{ kind: string; n: number }>;
  for (const r of byKind) console.log(`  ${r.kind.padEnd(8)} ${r.n}`);

  const byDevice = db
    .prepare("SELECT devices, COUNT(*) AS n FROM pages GROUP BY devices ORDER BY n DESC")
    .all() as Array<{ devices: string; n: number }>;
  console.log("== Device sources ==");
  for (const r of byDevice) console.log(`  ${r.devices.padEnd(8)} ${r.n}`);

  const captures = db
    .prepare("SELECT COUNT(*) AS n, SUM(content_text IS NOT NULL) AS with_text FROM captures")
    .get() as { n: number; with_text: number | null };
  console.log(`== Extension captures ==`);
  console.log(`  ${captures.n} total (${captures.with_text ?? 0} with body text)`);

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  // Real reading signal (the extension's active-reading seconds) takes priority; history dwell time is secondary
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
  console.log("== High-value content candidates, last 7 days ==");
  for (const r of top) {
    const host = new URL(r.url).hostname;
    const signal = r.active_min > 0 ? `⚡${r.active_min} min active read` : `${r.minutes} min dwell`;
    console.log(`  [${signal}] ${r.title ?? "(untitled)"} — ${host} (${r.total_visits} visits, ${r.devices})`);
  }
}

// After the classification rules change, re-run over existing pages: fix kind, purge stored sensitive pages
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
  console.log(`Reclassification complete: ${changed} pages updated, ${purged} sensitive pages purged (including their visit logs)`);
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
  // The following three are enrich's decomposed steps, for debugging and manual editing workflows
  case "candidates":
    console.log(JSON.stringify(getCandidates(), null, 1));
    break;
  case "fetch-content":
    await fetchMissingContent();
    break;
  case "apply": {
    const file = process.argv[3];
    if (!file) {
      console.error("Usage: apply <enrichment.json>");
      process.exit(1);
    }
    const records = JSON.parse(fs.readFileSync(file, "utf8")) as EnrichmentRecord[];
    const { updated, upgraded } = applyEnrichment(records);
    console.log(`Applied ${updated} records (${upgraded} unknowns upgraded to articles)`);
    break;
  }
  default:
    console.log("Usage: ingest | stats | reclassify | enrich | candidates | fetch-content | apply <file>");
    process.exit(1);
}
