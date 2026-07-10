import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

export type Device = "desktop" | "mobile" | "both";

export interface PageRow {
  id: number;
  url: string;
  title: string | null;
  kind: string;
  lang: string | null;
  first_seen: number;
  last_seen: number;
  total_visits: number;
  total_duration_sec: number;
  devices: Device;
  content_text: string | null;
  summary: string | null;
  score: number | null;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });
  db = new Database(path.join(CONFIG.dataDir, "browstack.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      kind TEXT NOT NULL DEFAULT 'unknown',
      lang TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      total_visits INTEGER NOT NULL DEFAULT 0,
      total_duration_sec REAL NOT NULL DEFAULT 0,
      devices TEXT NOT NULL DEFAULT 'desktop',
      content_text TEXT,
      summary TEXT,
      score REAL
    );
    CREATE INDEX IF NOT EXISTS idx_pages_kind_seen ON pages(kind, last_seen);

    CREATE TABLE IF NOT EXISTS visits_log (
      id INTEGER PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pages(id),
      visit_time INTEGER NOT NULL,
      duration_sec REAL NOT NULL,
      device TEXT NOT NULL,
      UNIQUE(page_id, visit_time, device)
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      number INTEGER PRIMARY KEY,
      week_start INTEGER NOT NULL,
      week_end INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );

    -- 本期選用了哪些頁面（email 渲染時寫入；封刊時據此標記 published_in）
    CREATE TABLE IF NOT EXISTS issue_items (
      issue_number INTEGER NOT NULL,
      page_id INTEGER NOT NULL REFERENCES pages(id),
      PRIMARY KEY (issue_number, page_id)
    );

    CREATE TABLE IF NOT EXISTS captures (
      id INTEGER PRIMARY KEY,
      capture_id TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      kind TEXT NOT NULL,
      lang TEXT,
      captured_at INTEGER NOT NULL,
      active_seconds REAL NOT NULL,
      max_scroll_pct REAL,
      excerpt TEXT,
      content_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_captures_url ON captures(url);
  `);
  migrate(db);
  return db;
}

// 輕量 migration：既有 DB 補欄位
function migrate(db: Database.Database): void {
  const cols = db.pragma("table_info(pages)") as Array<{ name: string }>;
  const addColumn = (name: string, ddl: string) => {
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE pages ADD COLUMN ${ddl}`);
  };
  addColumn("active_seconds_total", "active_seconds_total REAL NOT NULL DEFAULT 0");
  // 知識型內容判定（NULL=未分類）：非知識型內容無論停留多久都不入刊
  addColumn("is_knowledge", "is_knowledge INTEGER");
  addColumn("topic", "topic TEXT");
  // 已刊登於第 N 期（封刊時標記）：刊登過的內容永不再入選，
  // 避免「讀了自己的週刊 → 內容下週又被推薦」的自我迴圈
  addColumn("published_in", "published_in INTEGER");
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}
