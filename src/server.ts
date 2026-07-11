import http from "node:http";
import { classifyUrl } from "./classify/filter.js";
import { getDb } from "./db.js";
import { SHARED } from "./shared/settings.js";
import { normalizeUrl } from "./shared/urls.js";

/**
 * 本機接收服務：extension 唯一的通訊對象。
 * 只綁 127.0.0.1——瀏覽資料永遠不出這台機器。
 */

interface CaptureItem {
  event: "capture" | "final";
  captureId: string;
  url?: string;
  title?: string | null;
  lang?: string | null;
  capturedAt?: number;
  activeSeconds?: number;
  maxScrollPct?: number;
  excerpt?: string | null;
  contentText?: string | null;
}

function handleBatch(items: CaptureItem[]): { accepted: number; skipped: number } {
  const db = getDb();
  let accepted = 0;
  let skipped = 0;
  const affectedUrls = new Set<string>();

  const insertCapture = db.prepare(
    `INSERT OR IGNORE INTO captures
       (capture_id, url, title, kind, lang, captured_at, active_seconds, max_scroll_pct, excerpt, content_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const finalizeCapture = db.prepare(
    "UPDATE captures SET active_seconds = ?, max_scroll_pct = ? WHERE capture_id = ?",
  );
  const captureUrl = db.prepare("SELECT url FROM captures WHERE capture_id = ?");
  const selectPage = db.prepare("SELECT id, LENGTH(COALESCE(content_text, '')) AS len FROM pages WHERE url = ?");
  const insertPage = db.prepare(
    `INSERT INTO pages (url, title, kind, lang, first_seen, last_seen, total_visits, total_duration_sec, devices, content_text)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'desktop', ?)`,
  );
  const updatePage = db.prepare(
    `UPDATE pages SET title = COALESCE(?, title), kind = ?, lang = COALESCE(?, lang),
            last_seen = MAX(last_seen, ?),
            content_text = CASE WHEN LENGTH(COALESCE(?, '')) > LENGTH(COALESCE(content_text, '')) THEN ? ELSE content_text END
      WHERE id = ?`,
  );
  const refreshActiveTotal = db.prepare(
    `UPDATE pages SET active_seconds_total =
       (SELECT COALESCE(SUM(active_seconds), 0) FROM captures c WHERE c.url = pages.url)
      WHERE url = ?`,
  );

  db.transaction(() => {
    for (const item of items) {
      if (item.event === "final") {
        if (typeof item.activeSeconds !== "number") continue;
        finalizeCapture.run(item.activeSeconds, item.maxScrollPct ?? null, item.captureId);
        const row = captureUrl.get(item.captureId) as { url: string } | undefined;
        if (row) affectedUrls.add(row.url);
        continue;
      }
      if (!item.url || typeof item.activeSeconds !== "number") {
        skipped++;
        continue;
      }
      // 正規化 + 伺服器端重新分類：縱深防禦，敏感頁即使被送來也不落地
      item.url = normalizeUrl(item.url);
      const { kind, sensitive } = classifyUrl(item.url);
      if (sensitive || kind === "noise") {
        skipped++;
        continue;
      }
      const text = item.contentText?.slice(0, SHARED.capture.maxTextLength) ?? null;
      const now = item.capturedAt ?? Math.floor(Date.now() / 1000);
      insertCapture.run(
        item.captureId, item.url, item.title ?? null, kind, item.lang ?? null,
        now, item.activeSeconds, item.maxScrollPct ?? null, item.excerpt ?? null, text,
      );
      const existing = selectPage.get(item.url) as { id: number } | undefined;
      if (existing) {
        updatePage.run(item.title ?? null, kind, item.lang ?? null, now, text, text, existing.id);
      } else {
        insertPage.run(item.url, item.title ?? null, kind, item.lang ?? null, now, now, text);
      }
      affectedUrls.add(item.url);
      accepted++;
    }
    for (const url of affectedUrls) refreshActiveTotal.run(url);
  })();

  return { accepted, skipped };
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(200, { ok: true, service: "browstack" });
    }
    if (req.method === "POST" && req.url === "/capture") {
      const raw = await readBody(req, 10 * 1024 * 1024);
      const parsed = JSON.parse(raw) as { items?: CaptureItem[] };
      if (!Array.isArray(parsed.items)) return send(400, { ok: false, error: "items required" });
      const result = handleBatch(parsed.items);
      console.log(`[capture] 收到 ${parsed.items.length} 筆：落地 ${result.accepted}、略過 ${result.skipped}`);
      return send(200, { ok: true, ...result });
    }
    send(404, { ok: false });
  } catch (e) {
    send(400, { ok: false, error: String(e) });
  }
});

server.listen(SHARED.serverPort, "127.0.0.1", () => {
  console.log(`browstack 本機接收服務：http://127.0.0.1:${SHARED.serverPort}（只綁本機，資料不出機器）`);
});
