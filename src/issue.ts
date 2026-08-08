import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CONFIG } from "./config.js";
import { getDb, getMeta } from "./db.js";

/**
 * Issues and archive: each issue has its own number, title, week range, and cover.
 * Semantics: a successful send closes the issue; the next generation automatically opens a new one.
 */

export interface Issue {
  number: number;
  week_start: number;
  week_end: number;
  title: string;
  created_at: number;
  sent_at: number | null;
}

// A special title is reserved only for №0 (the launch preview issue); regular issues are shown by number as №N —
// progression is conveyed by the number itself, so the "launch" wording doesn't tag along every issue, avoiding the redundant "№2 — issue 2"
export function issueTitle(n: number): string {
  return n === 0 ? "創刊預覽號" : "";
}

// The current issue: reuse the latest unsent issue; if the previous one was already sent, open a new one
export function getCurrentIssue(): Issue {
  const db = getDb();
  seedLegacy(db);
  const now = Math.floor(Date.now() / 1000);
  const weekStart = now - 7 * 86400;
  const latest = db
    .prepare("SELECT * FROM issues ORDER BY number DESC LIMIT 1")
    .get() as Issue | undefined;
  if (latest && latest.sent_at == null) {
    db.prepare("UPDATE issues SET week_start = ?, week_end = ? WHERE number = ?").run(
      weekStart,
      now,
      latest.number,
    );
    return { ...latest, week_start: weekStart, week_end: now };
  }
  const number = latest ? latest.number + 1 : 0;
  const issue: Issue = {
    number,
    week_start: weekStart,
    week_end: now,
    title: issueTitle(number),
    created_at: now,
    sent_at: null,
  };
  db.prepare(
    "INSERT INTO issues (number, week_start, week_end, title, created_at, sent_at) VALUES (?, ?, ?, ?, ?, NULL)",
  ).run(issue.number, issue.week_start, issue.week_end, issue.title, issue.created_at);
  return issue;
}

export function markIssueSent(n: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE issues SET sent_at = ? WHERE number = ?").run(Math.floor(Date.now() / 1000), n);
    // Close-out: mark this issue's selected pages as "published" so they're never selected in any future issue
    // (otherwise, when the user rereads their own newsletter, the content gets recommended again next week, forming a self-loop)
    db.prepare(
      `UPDATE pages SET published_in = ?
        WHERE id IN (SELECT page_id FROM issue_items WHERE issue_number = ?)`,
    ).run(n, n);
  })();
}

export function listIssues(): Issue[] {
  const db = getDb();
  seedLegacy(db);
  return db.prepare("SELECT * FROM issues ORDER BY number DESC").all() as Issue[];
}

// The week's reading sketch: a one-line editorial understanding of this week's reading, produced before the cover prompt is generated (created by render/digest.ts, stored in meta).
// Shared by the masthead (issueView), the archive showcase, and the email intro. Returns null if absent.
export function issueDigest(n: number): string | null {
  const d = getMeta(`issue_digest:${n}`);
  return d && d.trim().length > 0 ? d.trim() : null;
}

/**
 * This issue's cover file: prefer issue-N.(png|jpg|svg) → the most recent issue's cover (raster preferred)
 * → the default cover bundled with the repo (assets/cover-default.jpg, i.e. the launch-issue cover).
 * A brand-new clone that hasn't run cover yet, or a week whose render failed, still gets a complete cover and doesn't block publishing.
 * rasterOnly: the email's CID embedding only accepts raster images (png/jpg); svg is available only in the web version.
 */
export function findCover(n: number, opts: { rasterOnly?: boolean; exactOnly?: boolean } = {}): string | null {
  const exts = opts.rasterOnly ? (["png", "jpg"] as const) : (["png", "jpg", "svg"] as const);
  const assetsRoot = path.join(CONFIG.dataDir, "..", "assets");
  const dir = path.join(assetsRoot, "covers");
  const defaultCover =
    exts.map((e) => path.join(assetsRoot, `cover-default.${e}`)).find((p) => fs.existsSync(p)) ?? null;
  const orDefault = (p: string | null) => p ?? defaultCover;

  for (const ext of exts) {
    const exact = path.join(dir, `issue-${n}.${ext}`);
    if (fs.existsSync(exact)) return exact;
  }
  // exactOnly: the archive page must render faithfully — with no cover for this issue, fall back to the default cover, never borrowing another issue's illustration and mislabeling it
  if (opts.exactOnly) return defaultCover;
  if (!fs.existsSync(dir)) return orDefault(null);
  const pattern = opts.rasterOnly ? /^issue-\d+\.(png|jpg)$/ : /^issue-\d+\.(png|jpg|svg)$/;
  const num = (f: string) => Number(f.match(/^issue-(\d+)\./)?.[1] ?? -1);
  const isRaster = (f: string) => f.endsWith(".png") || f.endsWith(".jpg");
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort((a, b) => num(b) - num(a) || (isRaster(a) ? -1 : 1));
  const raster = candidates.find(isRaster);
  const pick = raster ?? candidates[0];
  return orDefault(pick ? path.join(dir, pick) : null);
}

// Backfill for the single-issue era: issue-0 was already generated and sent → record it as closed, so the next issue starts from №1
function seedLegacy(db: Database.Database): void {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM issues").get() as { n: number };
  if (n > 0) return;
  const legacyEmail = path.join(CONFIG.dataDir, "..", "out", "browstack-issue-0.email.html");
  if (fs.existsSync(legacyEmail)) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      "INSERT INTO issues (number, week_start, week_end, title, created_at, sent_at) VALUES (0, ?, ?, ?, ?, ?)",
    ).run(now - 7 * 86400, now, issueTitle(0), now, now);
  }
}
