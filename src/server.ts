import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { checkArchiveKey, checkSessionCookie, getArchiveTokenCached, sessionCookieValue } from "./archiveToken.js";
import { classifyUrl } from "./classify/filter.js";
import { getDb, hardenPerms } from "./db.js";
import { findCover } from "./issue.js";
import { renderArchiveIndex, renderIssuePage } from "./render/archive.js";
import { SHARED } from "./shared/settings.js";
import { normalizeUrl } from "./shared/urls.js";

/**
 * 本機接收服務：extension 的落地端,未來也端出典藏頁。
 * 只綁 127.0.0.1——瀏覽資料永遠不出這台機器。
 * 開源前提:攻擊者完全知道本檔內容,安全只押在每台各異的隨機 token,不押在保密機制。
 */

// 綁定位址永遠是本機迴環,絕不可改成對外可達位址或任何可設定值（會把歷史 server 曝露到區網）。
export const BIND_ADDRESS = "127.0.0.1";

// 只接受本機 Host（精確比對）——擋 DNS rebinding:rebinding 攻擊頁送的 Host 是攻擊者網域,永不在此集合。
const ALLOWED_HOSTS = new Set([`127.0.0.1:${SHARED.serverPort}`, `localhost:${SHARED.serverPort}`]);

// HTML／圖片回應共用的嚴格安全標頭（單一 choke point;新路由一律經過它,不逐路由手寫）。
// 刻意不設腳本來源指令——default-src 'none' 已封殺所有腳本;img-src 需含 data: 否則內嵌 base64 封面全空白。
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy":
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

// Host 正規化後精確比對凍結集合。缺失/不符一律 false。
// 只用 slice/charAt/Set.has,不用 includes/startsWith/endsWith/RegExp 做比對決策（那些容易被放寬成 rebinding 破口）。
function hostAllowed(rawHost: string | undefined): boolean {
  if (!rawHost) return false;
  const host = rawHost.toLowerCase();
  const colon = host.lastIndexOf(":");
  const name = colon >= 0 ? host.slice(0, colon) : host;
  const port = colon >= 0 ? host.slice(colon) : "";
  // 去掉主機名尾端單一個「.」（"localhost.:8787" / "127.0.0.1.:8787" 仍指向本機）
  const cleanName = name.charAt(name.length - 1) === "." ? name.slice(0, -1) : name;
  return ALLOWED_HOSTS.has(cleanName + port);
}

// 典藏頁的 session cookie。值是 token 的 sha256（見 archiveToken.ts）,非 token 本身。
const COOKIE_NAME = "bs";
const COOKIE_MAX_AGE = 7 * 24 * 3600; // 7 天
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

// 從 Cookie 標頭取出指定 cookie（用 indexOf/slice,不用 includes/startsWith——見 Host 檢查的同理）。
function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function sendHtml(res: http.ServerResponse, code: number, html: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(code, { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

// 只端已知副檔名的圖片,且套同一組安全標頭（SVG 也被 CSP 中和,縱使 cover.ts 已於生成時淨化）。
function sendCover(res: http.ServerResponse, filePath: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const type = IMAGE_TYPES[path.extname(filePath).toLowerCase()];
  if (!type) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": type });
  res.end(buf);
}

// 驗 ?k 通過 → 發 cookie 並 302 到乾淨路徑（Location 用 server 端算出的 pathname,絕不回填請求字串）。
function sendRedirect(res: http.ServerResponse, location: string, cookieValue: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  // 一併帶上安全標頭（含 referrer-policy: no-referrer）——這個回應的 URL 帶著 ?k=token,
  // 不能成為任何 Referer 來源。
  res.writeHead(302, {
    ...SECURITY_HEADERS,
    location,
    "set-cookie": `${COOKIE_NAME}=${cookieValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
  });
  res.end();
}

type AuthResult = "serve" | "deny" | { redirectTo: string; cookieValue: string };

// 認證:合法 ?k → 發 cookie + 302（SameSite=Lax 確保 Gmail 跨站點擊後的頂層導航仍帶 cookie）;
// 否則看 cookie;都沒有 → deny。stored 缺失一律 fail closed。
function authorize(req: http.IncomingMessage, url: URL, stored: string | null): AuthResult {
  const k = url.searchParams.get("k");
  if (k && checkArchiveKey(k, stored)) {
    return { redirectTo: url.pathname, cookieValue: sessionCookieValue(stored as string) };
  }
  if (checkSessionCookie(parseCookie(req.headers.cookie, COOKIE_NAME), stored)) return "serve";
  return "deny";
}

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

// getToken 可注入（測試用固定 token,免動 Keychain）;預設從 Keychain 讀。
export function createBrowstackServer(opts: { getToken?: () => string | null } = {}): http.Server {
  // 預設用短 TTL 快取版:避免每個請求（含索引頁每張封面）都 fork `security` 阻塞事件迴圈。
  const getToken = opts.getToken ?? getArchiveTokenCached;
  return http.createServer(async (req, res) => {
    // headersSent 防護:串流／已回應的請求不得再寫一次（避免 crash-loop）。
    const sendJson = (code: number, body: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      // Host 閘:所有路由（含 /capture）都先過,再談路由。
      if (!hostAllowed(req.headers.host)) return sendJson(403, { ok: false });

      // req.url 是「路徑+query」,且可能是 absolute-form;統一以 URL 解析,只取 pathname 做路由。
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${SHARED.serverPort}`);
      const pathname = url.pathname;
      const method = req.method === "HEAD" ? "GET" : req.method;

      if (method === "GET" && pathname === "/health") {
        // 去產品指紋:不回傳 service 名（否則任何網站可探測「此訪客在用 Browstack」）。
        return sendJson(200, { ok: true });
      }

      // 典藏路由（唯讀 GET,需 token 或 cookie）。整數路由 server 端組路徑,無 client 可控檔名。
      if (method === "GET") {
        const isIndex = pathname === "/" || pathname === "/archive";
        const issuesMatch = /^\/issues\/(0|[1-9]\d{0,5})$/.exec(pathname);
        const coversMatch = /^\/covers\/(0|[1-9]\d{0,5})$/.exec(pathname);
        if (isIndex || issuesMatch || coversMatch) {
          const auth = authorize(req, url, getToken());
          if (auth === "deny") return sendJson(403, { ok: false });
          if (typeof auth === "object") return sendRedirect(res, auth.redirectTo, auth.cookieValue);
          if (isIndex) return sendHtml(res, 200, renderArchiveIndex());
          if (issuesMatch) {
            const page = renderIssuePage(Number(issuesMatch[1]));
            return page ? sendHtml(res, 200, page) : sendJson(404, { ok: false });
          }
          const cover = findCover(Number(coversMatch![1]), { exactOnly: true });
          return cover ? sendCover(res, cover) : sendJson(404, { ok: false });
        }
      }

      if (req.method === "POST" && pathname === "/capture") {
        // 要求 application/json:逼跨站寫入走 CORS preflight（本 server 不回 CORS 標頭 → 被擋),
        // 封掉任何網頁用 no-cors text/plain 灌假資料進本機 DB 的路。extension 本就送 application/json。
        const ctype = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (ctype !== "application/json") {
          return sendJson(415, { ok: false, error: "content-type must be application/json" });
        }
        const raw = await readBody(req, 10 * 1024 * 1024);
        const parsed = JSON.parse(raw) as { items?: CaptureItem[] };
        if (!Array.isArray(parsed.items)) return sendJson(400, { ok: false, error: "items required" });
        const result = handleBatch(parsed.items);
        console.log(`[capture] 收到 ${parsed.items.length} 筆：落地 ${result.accepted}、略過 ${result.skipped}`);
        return sendJson(200, { ok: true, ...result });
      }
      sendJson(404, { ok: false });
    } catch (e) {
      // 只記 error code,絕不把請求輸入（可能含 token 等敏感值）回填進回應或日誌。
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code) console.error(`[server] 請求處理失敗：${code}`);
      sendJson(400, { ok: false });
    }
  });
}

// 作為主程式（tsx src/server.ts）執行時才實際 listen;被測試 import 時只拿 handler,不佔 port。
// 兩邊都過 realpath:argv[1] 可能帶符號連結（如 macOS /tmp→/private/tmp）,而 import.meta.url 已是實路徑。
const isMain =
  !!argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(argv[1]);
if (isMain) {
  hardenPerms(); // 開機即收緊既有資料檔權限（不必等第一次 DB 存取）
  createBrowstackServer().listen(SHARED.serverPort, BIND_ADDRESS, () => {
    console.log(`browstack 本機接收服務：http://${BIND_ADDRESS}:${SHARED.serverPort}（只綁本機，資料不出機器）`);
  });
}
