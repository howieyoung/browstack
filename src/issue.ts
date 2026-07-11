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

// 特殊刊名只保留給 №0（創刊預覽號）；正式期數以編號 №N 呈現——
// 進展由期數本身傳達，「創刊」字樣不跟著每期跑，也避免「№2 — 第 2 期」的同義重複
export function issueTitle(n: number): string {
  return n === 0 ? "創刊預覽號" : "";
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
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE issues SET sent_at = ? WHERE number = ?").run(Math.floor(Date.now() / 1000), n);
    // 封刊：本期選用的頁面標記為「已刊登」，之後任何一期都不再入選
    // （否則用戶回頭讀自己的週刊，內容會在下週再次被推薦，形成自我迴圈）
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

/**
 * 本期封面檔案：優先 issue-N.(png|jpg|svg) → 最近一期的封面（點陣圖優先）
 * → 隨庫附帶的預設封面（assets/cover-default.jpg，即創刊號封面）。
 * 全新 clone 尚未跑過 cover、或某週渲染失敗時，都能有一張完整封面，不擋出刊。
 * rasterOnly：email 的 CID 內嵌只吃點陣圖（png/jpg），svg 僅網頁版可用。
 */
export function findCover(n: number, opts: { rasterOnly?: boolean } = {}): string | null {
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
