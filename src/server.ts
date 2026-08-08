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
 * Local receiver service: the landing endpoint for the extension, and in future also serves the archive pages.
 * Bound to 127.0.0.1 only — browsing data never leaves this machine.
 * Open-source premise: attackers fully know this file's contents; security rests solely on the per-machine random token, not on any secrecy mechanism.
 */

// The bind address is always the local loopback; it must never be changed to an externally reachable address or any configurable value (that would expose the history server to the LAN).
export const BIND_ADDRESS = "127.0.0.1";

// Only accept local Hosts (exact match) — blocks DNS rebinding: a rebinding attack page's Host is the attacker's domain, which is never in this set.
const ALLOWED_HOSTS = new Set([`127.0.0.1:${SHARED.serverPort}`, `localhost:${SHARED.serverPort}`]);

// Strict security headers shared by HTML/image responses (single choke point; every new route passes through it, never hand-written per route).
// Deliberately no script-source directive — default-src 'none' already blocks all scripts; img-src needs data: or embedded base64 covers render blank.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy":
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

// Normalize the Host, then exact-match against the frozen set. Missing/mismatch is always false.
// Uses only slice/charAt/Set.has, never includes/startsWith/endsWith/RegExp for the match decision (those are easily loosened into a rebinding hole).
function hostAllowed(rawHost: string | undefined): boolean {
  if (!rawHost) return false;
  const host = rawHost.toLowerCase();
  const colon = host.lastIndexOf(":");
  const name = colon >= 0 ? host.slice(0, colon) : host;
  const port = colon >= 0 ? host.slice(colon) : "";
  // Strip a single trailing "." from the hostname ("localhost.:8787" / "127.0.0.1.:8787" still point to the local machine)
  const cleanName = name.charAt(name.length - 1) === "." ? name.slice(0, -1) : name;
  return ALLOWED_HOSTS.has(cleanName + port);
}

// Session cookie for the archive pages. Its value is the sha256 of the token (see archiveToken.ts), not the token itself.
const COOKIE_NAME = "bs";
const COOKIE_MAX_AGE = 7 * 24 * 3600; // 7 days
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

// Extract the named cookie from the Cookie header (uses indexOf/slice, not includes/startsWith — same rationale as the Host check).
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

// Serve only images with known extensions, applying the same security headers (SVG is also neutralized by the CSP, even though cover.ts already sanitizes at generation time).
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

// On a valid ?k → issue the cookie and 302 to a clean path (Location uses the server-computed pathname, never echoing back the request string).
function sendRedirect(res: http.ServerResponse, location: string, cookieValue: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  // Include the security headers too (with referrer-policy: no-referrer) — this response's URL carries ?k=token
  // and must not become a Referer source anywhere.
  res.writeHead(302, {
    ...SECURITY_HEADERS,
    location,
    "set-cookie": `${COOKIE_NAME}=${cookieValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
  });
  res.end();
}

type AuthResult = "serve" | "deny" | { redirectTo: string; cookieValue: string };

// Authentication: valid ?k → issue cookie + 302 (SameSite=Lax ensures the top-level navigation after a cross-site click from Gmail still carries the cookie);
// otherwise check the cookie; if neither → deny. A missing stored token always fails closed.
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
      // Normalize + re-classify server-side: defense in depth, so sensitive pages are not persisted even if sent
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

// getToken is injectable (a fixed token for tests, avoiding the Keychain); defaults to reading from the Keychain.
export function createBrowstackServer(opts: { getToken?: () => string | null } = {}): http.Server {
  // Default to the short-TTL cached version: avoids forking `security` on every request (including each cover on the index page) and blocking the event loop.
  const getToken = opts.getToken ?? getArchiveTokenCached;
  return http.createServer(async (req, res) => {
    // headersSent guard: a streaming/already-responded request must not be written again (avoids a crash-loop).
    const sendJson = (code: number, body: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      // Host gate: every route (including /capture) passes this first, before any routing.
      if (!hostAllowed(req.headers.host)) return sendJson(403, { ok: false });

      // req.url is "path+query" and may be in absolute-form; parse uniformly as a URL and route on the pathname only.
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${SHARED.serverPort}`);
      const pathname = url.pathname;
      const method = req.method === "HEAD" ? "GET" : req.method;

      if (method === "GET" && pathname === "/health") {
        // Strip the product fingerprint: don't return the service name (otherwise any site could probe "this visitor uses Browstack").
        return sendJson(200, { ok: true });
      }

      // Archive routes (read-only GET, requiring a token or cookie). Integer routes build the path server-side, so no client-controlled filename.
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
        // Require application/json: forces cross-site writes through a CORS preflight (this server returns no CORS headers → blocked),
        // closing off any web page using no-cors text/plain to inject fake data into the local DB. The extension already sends application/json.
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
      // Log only the error code, never echoing request input (which may contain sensitive values like tokens) into the response or logs.
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code) console.error(`[server] 請求處理失敗：${code}`);
      sendJson(400, { ok: false });
    }
  });
}

// Only actually listen when run as the main program (tsx src/server.ts); when imported by tests, just expose the handler and don't hold a port.
// Both sides go through realpath: argv[1] may carry symlinks (e.g. macOS /tmp→/private/tmp), whereas import.meta.url is already the real path.
const isMain =
  !!argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(argv[1]);
if (isMain) {
  hardenPerms(); // Tighten permissions on existing data files at startup (no need to wait for the first DB access)
  createBrowstackServer().listen(SHARED.serverPort, BIND_ADDRESS, () => {
    console.log(`browstack 本機接收服務：http://${BIND_ADDRESS}:${SHARED.serverPort}（只綁本機，資料不出機器）`);
  });
}
