import { SHARED } from "../shared/settings.js";

/**
 * Your own social posts must never come back to you as "this week's reading".
 *
 * You spend a lot of time looking at what you just published — re-reading it, watching the
 * replies — so raw dwell time makes your own posts look like your most-engaged content of the
 * week. They are output, not input: a digest of your own writing tells you nothing you didn't
 * already know.
 *
 * The matcher works off the author identity that a permalink already carries (threads.com/@handle,
 * facebook.com/<username>, x.com/<handle>, the numeric id= on Facebook's permalink.php), plus a
 * few tight title shapes for the platforms whose post URLs carry no author at all (Instagram's
 * /p/<id>). Matching is exact against the configured identifiers — never a loose substring — so a
 * post that merely mentions or tags you still counts as someone else's writing, and still qualifies.
 */

// Path segments that are route names, not usernames.
const RESERVED_FB = new Set([
  "photo", "photo.php", "story.php", "permalink.php", "profile.php", "video.php", "watch",
  "reel", "reels", "groups", "share", "events", "marketplace", "pages", "media", "people",
  "hashtag", "login", "notifications", "search", "messages", "bookmarks",
]);
const RESERVED_IG = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "direct", "accounts", "challenge",
]);

const clean = (s: string): string => s.trim().replace(/^@/, "").toLowerCase();

/**
 * Every author identifier a social URL/title can yield. Returns [] for non-social pages,
 * and for post URLs whose platform hides the author (a bare instagram.com/p/<id> with a
 * generic "(1) Instagram" title) — those simply can't be attributed and fall through.
 */
export function socialAuthorsOf(rawUrl: string, title?: string | null): string[] {
  const found: string[] = [];
  let u: URL | null = null;
  try {
    u = new URL(rawUrl);
  } catch {
    u = null;
  }

  if (u) {
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const seg = u.pathname.split("/").filter(Boolean);
    const first = seg[0] ? decodeURIComponent(seg[0]) : "";

    if (/(^|\.)threads\.(net|com)$/.test(host)) {
      // /@handle/post/<id>
      if (first.startsWith("@")) found.push(clean(first));
    } else if (/(^|\.)facebook\.com$/.test(host)) {
      // /<username>/posts/<id> — but not /photo.php, /groups/…, and friends
      if (first && !RESERVED_FB.has(first.toLowerCase()) && !first.includes(".php")) found.push(clean(first));
      // story.php?id= / permalink.php?id= / profile.php?id= carry a numeric account id instead
      const id = u.searchParams.get("id");
      if (id && /^\d+$/.test(id)) found.push(id);
    } else if (/(^|\.)instagram\.com$/.test(host)) {
      // /<handle>/p/<id> and /<handle>/ — the canonical /p/<id> form has no author at all
      if (first && !RESERVED_IG.has(first.toLowerCase())) found.push(clean(first));
      if (first.toLowerCase() === "stories" && seg[1]) found.push(clean(decodeURIComponent(seg[1])));
    } else if (/(^|\.)(twitter|x)\.com$/.test(host)) {
      if (first && seg[1] === "status") found.push(clean(first));
    } else if (/(^|\.)linkedin\.com$/.test(host)) {
      if (first.toLowerCase() === "in" && seg[1]) found.push(clean(decodeURIComponent(seg[1])));
      // /posts/<public-id>_<slug>-activity-<id>
      if (first.toLowerCase() === "posts" && seg[1]) found.push(clean(decodeURIComponent(seg[1]).split("_")[0] ?? ""));
    } else if (/(^|\.)reddit\.com$/.test(host)) {
      if ((first.toLowerCase() === "user" || first.toLowerCase() === "u") && seg[1]) found.push(clean(seg[1]));
    } else if (/(^|\.)youtube\.com$/.test(host)) {
      if (first.startsWith("@")) found.push(clean(first));
    }
  }

  if (title) {
    // "Howie Young | Facebook" — a profile or own-post page
    const fb = title.match(/^(.{1,60}?)\s*[|｜]\s*Facebook\s*$/i);
    if (fb?.[1]) found.push(clean(fb[1].replace(/^\(\d+\)\s*/, "")));
    // "Jane Doe (@janedoe) • Instagram photos and videos"
    const paren = title.match(/\(@([A-Za-z0-9._]{1,30})\)/);
    if (paren?.[1]) found.push(clean(paren[1]));
    // "@janedoe on Threads" / "janedoe on Instagram: …"
    const on = title.match(/(?:^|\s)@?([A-Za-z0-9._]{1,30})\s+on\s+(Threads|Instagram|X|Twitter)\b/i);
    if (on?.[1]) found.push(clean(on[1]));
  }

  return [...new Set(found.filter(Boolean))];
}

/** True when this page is the user's own social post/profile (exact identifier match). */
export function isOwnSocialPost(
  rawUrl: string,
  title?: string | null,
  handles: readonly string[] = SHARED.ownSocialHandles,
): boolean {
  if (handles.length === 0) return false;
  const mine = new Set(handles.map(clean).filter(Boolean));
  return socialAuthorsOf(rawUrl, title).some((a) => mine.has(a));
}
