import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { classifyUrl } from "../classify/filter.js";
import { getDb, getMeta, setMeta, type Device } from "../db.js";

// Chrome 時間軸：自 1601-01-01 起算的微秒
const CHROME_EPOCH_OFFSET_SEC = 11_644_473_600;
const chromeToUnixSec = (t: number) => Math.floor(t / 1_000_000 - CHROME_EPOCH_OFFSET_SEC);

interface ChromeVisitRow {
  visit_time: number;
  visit_duration: number;
  originator_cache_guid: string | null;
  url: string;
  title: string | null;
  page_language: string | null;
}

export interface IngestSummary {
  visitsProcessed: number;
  pagesNew: number;
  pagesUpdated: number;
  sensitiveSkipped: number;
  kinds: Record<string, number>;
}

// Chrome 執行中會鎖住 History DB，一律先複製一份再讀
function copyHistoryDb(): string {
  const src = path.join(CONFIG.chromeProfileDir, "History");
  const tmpDir = path.join(CONFIG.dataDir, "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const dst = path.join(tmpDir, "History-copy");
  fs.copyFileSync(src, dst);
  return dst;
}

export function ingestChromeHistory(): IngestSummary {
  const historyPath = copyHistoryDb();
  const chrome = new Database(historyPath, { readonly: true });
  const db = getDb();

  const cursor = Number(getMeta("chrome_cursor") ?? 0);
  const rows = chrome
    .prepare(
      `SELECT v.visit_time, v.visit_duration, v.originator_cache_guid,
              u.url, u.title, ca.page_language
         FROM visits v
         JOIN urls u ON u.id = v.url
         LEFT JOIN content_annotations ca ON ca.visit_id = v.id
        WHERE v.visit_time > ?
        ORDER BY v.visit_time ASC`,
    )
    .all(cursor) as ChromeVisitRow[];
  chrome.close();

  const summary: IngestSummary = {
    visitsProcessed: rows.length,
    pagesNew: 0,
    pagesUpdated: 0,
    sensitiveSkipped: 0,
    kinds: {},
  };
  if (rows.length === 0) return summary;

  const selectPage = db.prepare("SELECT id, devices FROM pages WHERE url = ?");
  const insertPage = db.prepare(
    `INSERT INTO pages (url, title, kind, lang, first_seen, last_seen, total_visits, total_duration_sec, devices)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
  );
  const updatePage = db.prepare(
    `UPDATE pages SET title = COALESCE(?, title), kind = ?, lang = COALESCE(?, lang),
            last_seen = MAX(last_seen, ?), devices = ?
      WHERE id = ?`,
  );
  const insertVisit = db.prepare(
    "INSERT OR IGNORE INTO visits_log (page_id, visit_time, duration_sec, device) VALUES (?, ?, ?, ?)",
  );
  const bumpAggregates = db.prepare(
    "UPDATE pages SET total_visits = total_visits + 1, total_duration_sec = total_duration_sec + ? WHERE id = ?",
  );

  const mergeDevices = (prev: Device, incoming: Device): Device =>
    prev === incoming ? prev : "both";

  db.transaction(() => {
    for (const row of rows) {
      const { kind, sensitive } = classifyUrl(row.url);
      if (sensitive) {
        summary.sensitiveSkipped++;
        continue;
      }
      summary.kinds[kind] = (summary.kinds[kind] ?? 0) + 1;

      const unixSec = chromeToUnixSec(row.visit_time);
      const device: Device = row.originator_cache_guid ? "mobile" : "desktop";
      const durationSec = Math.min(row.visit_duration / 1_000_000, CONFIG.maxVisitDurationSec);
      const title = row.title?.trim() || null;

      const existing = selectPage.get(row.url) as { id: number; devices: Device } | undefined;
      let pageId: number;
      if (existing) {
        updatePage.run(title, kind, row.page_language, unixSec, mergeDevices(existing.devices, device), existing.id);
        pageId = existing.id;
        summary.pagesUpdated++;
      } else {
        const res = insertPage.run(row.url, title, kind, row.page_language, unixSec, unixSec, device);
        pageId = Number(res.lastInsertRowid);
        summary.pagesNew++;
      }
      const inserted = insertVisit.run(pageId, row.visit_time, durationSec, device);
      if (inserted.changes > 0) bumpAggregates.run(durationSec, pageId);
    }
    setMeta("chrome_cursor", String(rows[rows.length - 1]!.visit_time));
  })();

  return summary;
}
