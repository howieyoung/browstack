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
  hardenPerms();
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

    -- Which pages were selected for this issue (written when rendering the email; used at close-out to mark published_in)
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

// Lightweight migration: add columns to existing DBs
function migrate(db: Database.Database): void {
  const cols = db.pragma("table_info(pages)") as Array<{ name: string }>;
  const addColumn = (name: string, ddl: string) => {
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE pages ADD COLUMN ${ddl}`);
  };
  addColumn("active_seconds_total", "active_seconds_total REAL NOT NULL DEFAULT 0");
  // Knowledge-content flag (NULL = unclassified): non-knowledge content is never included regardless of dwell time
  addColumn("is_knowledge", "is_knowledge INTEGER");
  addColumn("topic", "topic TEXT");
  // Published in issue N (marked at close-out): once published, content is never selected again,
  // avoiding the self-loop of "read your own newsletter → content gets recommended again next week"
  addColumn("published_in", "published_in INTEGER");
}

/**
 * Idempotently tighten local data-file permissions — run not only at creation but on every DB open,
 * so it also fixes older files from existing installs (mostly 0644 left by umask 022, readable by other OS accounts on the machine).
 * data/, out/, assets/covers/ → 0700; the DB (including -wal/-shm) and logs → 0600. Best-effort, failures don't block.
 */
export function hardenPerms(): void {
  const root = path.join(CONFIG.dataDir, "..");
  const chmodSafe = (p: string, mode: number) => {
    try {
      if (fs.existsSync(p)) fs.chmodSync(p, mode);
    } catch {
      // Don't block the flow when permissions can't be changed (read-only volume, etc.)
    }
  };
  for (const dir of [CONFIG.dataDir, path.join(root, "out"), path.join(root, "assets", "covers")]) {
    chmodSafe(dir, 0o700);
  }
  const dbFile = path.join(CONFIG.dataDir, "browstack.db");
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) chmodSafe(f, 0o600);
  const logsDir = path.join(CONFIG.dataDir, "logs");
  chmodSafe(logsDir, 0o700);
  try {
    for (const f of fs.readdirSync(logsDir)) chmodSafe(path.join(logsDir, f), 0o600);
  } catch {
    // logs/ not yet created
  }
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
