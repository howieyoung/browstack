import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CONFIG } from "./config.js";
import { getDb } from "./db.js";

/**
 * 期數與典藏：每一期有自己的編號、刊名、週期區間與封面。
 * 語義：寄出（send 成功）即封刊；下一次產出自動開新的一期。
 */

export interface Issue {
  number: number;
  week_start: number;
  week_end: number;
  title: string;
  created_at: number;
  sent_at: number | null;
}

export function issueTitle(n: number): string {
  if (n === 0) return "創刊預覽號";
  if (n === 1) return "創刊號";
  return `第 ${n} 期`;
}

// 目前這一期：沿用尚未寄出的最新一期；上一期已寄出則開新的一期
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
  getDb().prepare("UPDATE issues SET sent_at = ? WHERE number = ?").run(Math.floor(Date.now() / 1000), n);
}

export function listIssues(): Issue[] {
  const db = getDb();
  seedLegacy(db);
  return db.prepare("SELECT * FROM issues ORDER BY number DESC").all() as Issue[];
}

/**
 * 本期封面檔案：優先 issue-N.png → issue-N.svg → 最近一期的封面（png 優先）。
 * 封面渲染失敗時沿用上一張，不擋出刊。
 */
export function findCover(n: number): string | null {
  const dir = path.join(CONFIG.dataDir, "..", "assets", "covers");
  for (const ext of ["png", "svg"]) {
    const exact = path.join(dir, `issue-${n}.${ext}`);
    if (fs.existsSync(exact)) return exact;
  }
  if (!fs.existsSync(dir)) return null;
  const num = (f: string) => Number(f.match(/^issue-(\d+)\./)?.[1] ?? -1);
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => /^issue-\d+\.(png|svg)$/.test(f))
    .sort((a, b) => num(b) - num(a) || (a.endsWith(".png") ? -1 : 1));
  const png = candidates.find((f) => f.endsWith(".png"));
  const pick = png ?? candidates[0];
  return pick ? path.join(dir, pick) : null;
}

// 單期時代的存量登記：issue-0 已產出並寄出過 → 記為已封刊，下一期從 №1 開始
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
