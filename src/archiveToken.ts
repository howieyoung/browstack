import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { userInfo } from "node:os";

/**
 * The archive pages' capability token — the sole secret for the entire authentication scheme.
 * Open-source premise: the algorithm is fully public; security rests solely on this per-machine 256-bit random value (Kerckhoffs).
 * Stored in the macOS Keychain (service: browstack-archive), consistent with browstack-smtp / browstack-openai,
 * never landing in data/ or any file — publishing the source leaks no usable secret.
 *
 * Hard rules (enforced by CI and CODEOWNERS, see SECURITY.md):
 *   - CSPRNG only, never a hardcoded/default/derivable token
 *   - if it can't be read, fail closed (handler returns 403), never mint inside an HTTP handler
 *   - comparisons are always constant-time
 */

const SERVICE = "browstack-archive";
const TOKEN_RE = /^[0-9a-f]{64}$/; // 32 bytes hex

// Read the token from the Keychain; missing/malformed always returns null (fail closed).
export function getArchiveToken(): string | null {
  try {
    const t = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return TOKEN_RE.test(t) ? t : null;
  } catch {
    return null; // No such Keychain item, or not macOS
  }
}

// Short-TTL cached version: the server verifies the token on every archive request; forking `security` each time
// means one index page (1 page + N covers) synchronously spawns N+1 times, blocking the event loop, and could be
// abused by unauthenticated request floods to bog down /capture.
// Caching for a few seconds eliminates the subprocess on the hot path; after a rotate it takes effect within at most TTL seconds (rotate is rare anyway).
let tokenCache: { value: string | null; at: number } | null = null;
const TOKEN_CACHE_TTL_MS = 5000;
export function getArchiveTokenCached(nowMs: number = Date.now()): string | null {
  if (tokenCache && nowMs - tokenCache.at < TOKEN_CACHE_TTL_MS) return tokenCache.value;
  const value = getArchiveToken();
  tokenCache = { value, at: nowMs };
  return value;
}

// Generate a new token and write it to the Keychain. Called only by the render/rotate flows, never inside an HTTP handler.
export function rotateArchiveToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  execFileSync(
    "security",
    ["add-generic-password", "-s", SERVICE, "-a", userInfo().username, "-w", token, "-U"],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  return token;
}

// Get a usable token: use the existing one, or generate one (called by send/rotate; not a handler, so minting is allowed).
export function ensureArchiveToken(): string {
  return getArchiveToken() ?? rotateArchiveToken();
}

// First verify both are fixed-length, then compare in constant time after sha256 (timingSafeEqual throws on unequal lengths, so hash first).
function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Validate the ?k=<token> carried in by the email link. Missing/malformed stored → false (fail closed).
export function checkArchiveKey(presented: string | null | undefined, stored: string | null): boolean {
  if (!stored || !TOKEN_RE.test(stored)) return false;
  if (typeof presented !== "string" || presented.length === 0) return false;
  return constantTimeEqual(presented, stored);
}

// The session cookie value derived from the token: the sha256 of the token, not the token itself.
// Stateless and still valid after a KeepAlive restart; even if leaked to another loopback port on the same machine, it cannot be reversed back into the token.
export function sessionCookieValue(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Validate the cookie: compare the cookie value against the expected value derived from the stored token.
export function checkSessionCookie(cookieVal: string | null | undefined, stored: string | null): boolean {
  if (!stored || !TOKEN_RE.test(stored)) return false;
  if (typeof cookieVal !== "string" || cookieVal.length === 0) return false;
  return constantTimeEqual(cookieVal, sessionCookieValue(stored));
}
