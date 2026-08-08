import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { userInfo } from "node:os";

/**
 * Per-install shared secret for POST /capture. The extension holds it (baked in at
 * `npm run build:ext`) and sends it as the X-Browstack-Token header; the server validates.
 *
 * Why: the Host + Content-Type gates block a cross-origin webpage drive-by, but that rests
 * entirely on the browser's CORS behaviour, and it does NOT stop a non-browser local process
 * (e.g. another OS user on a shared Mac) from POSTing fabricated captures. A per-install secret
 * turns "every browser must behave" into "the attacker must also steal this machine's secret".
 * Stored in the Keychain (`browstack-capture`), consistent with the other secrets; open source
 * safe (Kerckhoffs) — the mechanism is public, only the per-install value matters.
 */

const SERVICE = "browstack-capture";
const RE = /^[0-9a-f]{64}$/;

export function getCaptureSecret(): string | null {
  try {
    const t = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return RE.test(t) ? t : null;
  } catch {
    return null; // no Keychain item, or non-macOS
  }
}

// Generate + store once. Called by the extension build (and any provisioning step), never by the HTTP handler.
export function ensureCaptureSecret(): string {
  const existing = getCaptureSecret();
  if (existing) return existing;
  const secret = crypto.randomBytes(32).toString("hex");
  execFileSync(
    "security",
    ["add-generic-password", "-s", SERVICE, "-a", userInfo().username, "-w", secret, "-U"],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  return secret;
}

// Short-TTL cache so validating each /capture batch doesn't fork `security` every time.
let cache: { value: string | null; at: number } | null = null;
const TTL_MS = 5000;
export function getCaptureSecretCached(nowMs: number = Date.now()): string | null {
  if (cache && nowMs - cache.at < TTL_MS) return cache.value;
  const value = getCaptureSecret();
  cache = { value, at: nowMs };
  return value;
}

// Constant-time check; fail closed when no secret is provisioned.
export function checkCaptureSecret(presented: string | null | undefined, stored: string | null): boolean {
  if (!stored || !RE.test(stored)) return false;
  if (typeof presented !== "string" || presented.length === 0) return false;
  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}
