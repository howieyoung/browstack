/**
 * HTML output escaping — shared by the email and preview/archive renderers.
 * Content mostly comes from arbitrary web pages the user has browsed (titles, summaries, URLs),
 * treated as attacker-influenceable strings.
 * Pure string operations, no Node dependency.
 */

// Handles both text and attribute contexts: beyond & < >, it also escapes " and ',
// so attribute interpolations like href="${esc(...)}" can't be broken out of via quotes.
export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// href allows only http/https; everything else (javascript:, data:, etc.) collapses to "#".
// The return value is already escaped, so it can go straight into href="${safeHref(url)}".
export function safeHref(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return esc(url);
  } catch {
    // A string that can't be parsed isn't treated as a link
  }
  return "#";
}
