/**
 * URL and title normalization — different "aliases" of the same content must be
 * treated as one. Common cause: Facebook/IG/Google click-tracking params (unique
 * per click) turn one article into multiple URLs in Chrome history → multiple
 * pages → duplicates within the issue.
 */

// Pure tracking query params (don't affect page content); always stripped during normalization.
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "twclid", "ttclid",
  "igshid", "igsh", "mibextid",
  "mc_cid", "mc_eid", "mkt_tok", "vero_id",
  "spm", "xtor", "share_id", "_hsenc", "_hsmi",
]);

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const drop: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (TRACKING_PARAMS.has(k.toLowerCase()) || /^utm_/i.test(k)) drop.push(k);
    });
    for (const k of drop) u.searchParams.delete(k);
    let s = u.toString();
    if (s.endsWith("?")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

// Title normalization: strip the notification-count prefix "(3) " and the site-name suffix "｜UDN", take the first 60 chars as the identity key.
export function normalizeTitle(t: string): string {
  return t.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim().slice(0, 60);
}
