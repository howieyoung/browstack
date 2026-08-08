import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { userInfo } from "node:os";

/**
 * 典藏頁的 capability token——整套認證的唯一密鑰。
 * 開源前提:演算法全公開,安全只押在這顆每台各異的 256-bit 亂數上（Kerckhoffs）。
 * 存 macOS Keychain（service: browstack-archive）,與 browstack-smtp / browstack-openai 一致,
 * 不落在 data/ 或任何檔案裡——公開原始碼不會洩漏任何可用密鑰。
 *
 * 鐵則（CI 與 CODEOWNERS 把關,見 SECURITY.md）:
 *   - 只用 CSPRNG,絕無 hardcoded／預設／可推導的 token
 *   - 讀不到就 fail closed（handler 回 403）,絕不在 HTTP handler 內 mint
 *   - 比對一律常數時間
 */

const SERVICE = "browstack-archive";
const TOKEN_RE = /^[0-9a-f]{64}$/; // 32 bytes hex

// 從 Keychain 讀 token;不存在／格式不符一律回 null（fail closed）。
export function getArchiveToken(): string | null {
  try {
    const t = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return TOKEN_RE.test(t) ? t : null;
  } catch {
    return null; // Keychain 無此項或非 macOS
  }
}

// 短 TTL 快取版:server 每個 archive 請求都要驗 token,若每次都 fork `security`,
// 一次索引頁（1 頁 + N 張封面）就同步 spawn N+1 次、阻塞事件迴圈,還會被未認證的洪水請求濫用來拖垮 /capture。
// 快取數秒即可消除熱路徑上的子行程;rotate 後最多 TTL 秒生效（rotate 本就少見）。
let tokenCache: { value: string | null; at: number } | null = null;
const TOKEN_CACHE_TTL_MS = 5000;
export function getArchiveTokenCached(nowMs: number = Date.now()): string | null {
  if (tokenCache && nowMs - tokenCache.at < TOKEN_CACHE_TTL_MS) return tokenCache.value;
  const value = getArchiveToken();
  tokenCache = { value, at: nowMs };
  return value;
}

// 產生新 token 並寫入 Keychain。只由 render／rotate 流程呼叫,永遠不在 HTTP handler 內。
export function rotateArchiveToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  execFileSync(
    "security",
    ["add-generic-password", "-s", SERVICE, "-a", userInfo().username, "-w", token, "-U"],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  return token;
}

// 取得可用 token:有就用,沒有就產生（供 send／rotate 呼叫;非 handler,故允許 mint）。
export function ensureArchiveToken(): string {
  return getArchiveToken() ?? rotateArchiveToken();
}

// 先驗兩者格式為固定長度,再 sha256 後常數時間比對（timingSafeEqual 長度不等會 throw,故先 hash）。
function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// 驗證信件連結帶來的 ?k=<token>。stored 缺失／格式錯 → false（fail closed）。
export function checkArchiveKey(presented: string | null | undefined, stored: string | null): boolean {
  if (!stored || !TOKEN_RE.test(stored)) return false;
  if (typeof presented !== "string" || presented.length === 0) return false;
  return constantTimeEqual(presented, stored);
}

// 由 token 衍生的 session cookie 值:是 token 的 sha256,不是 token 本身。
// 無狀態、KeepAlive 重啟後仍有效;萬一外洩到同機其他 loopback port,它也不能還原成 token。
export function sessionCookieValue(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// 驗證 cookie:比對「cookie 值」與「由 stored token 衍生的期望值」。
export function checkSessionCookie(cookieVal: string | null | undefined, stored: string | null): boolean {
  if (!stored || !TOKEN_RE.test(stored)) return false;
  if (typeof cookieVal !== "string" || cookieVal.length === 0) return false;
  return constantTimeEqual(cookieVal, sessionCookieValue(stored));
}
