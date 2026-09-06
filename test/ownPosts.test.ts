import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnSocialPost, socialAuthorsOf } from "../src/classify/ownPosts.js";

/**
 * Your own posts must never come back as "this week's reading" — you re-read what you publish,
 * so dwell time alone would rank them at the top. These assertions lock the two properties that
 * matter: an own post is caught on every platform whose permalink carries the author, and a post
 * that merely mentions you is NOT caught (exact identifier match, never a substring).
 */

const MINE = ["janedoe", "jane.doe.42", "Jane Doe"];
const isMine = (url: string, title?: string | null) => isOwnSocialPost(url, title, MINE);

test("catches own posts across platforms", () => {
  assert.ok(isMine("https://www.threads.com/@janedoe/post/DaS_RfWD1G9"));
  assert.ok(isMine("https://www.threads.net/@janedoe/post/Dc2lcmJD7xA/media"));
  assert.ok(isMine("https://www.facebook.com/jane.doe.42/posts/pfbid02sspBzp"));
  assert.ok(isMine("https://x.com/janedoe/status/2074208949205881033"));
  assert.ok(isMine("https://www.instagram.com/janedoe/p/DXwBm4fE0AT/"));
  // Platforms that hide the author in the URL still resolve through the page title
  assert.ok(isMine("https://www.facebook.com/", "Jane Doe | Facebook"));
  assert.ok(isMine("https://www.instagram.com/p/DXwBm4fE0AT/", "Jane Doe (@janedoe) • Instagram"));
});

test("leaves other people's posts alone", () => {
  assert.ok(!isMine("https://www.threads.com/@changssui/post/Dc2ZlcrjlOQ"));
  assert.ok(!isMine("https://www.facebook.com/someone.else/posts/pfbid0VQpz"));
  assert.ok(!isMine("https://x.com/ClaudeDevs/status/2074208949205881033"));
  // A post that merely mentions you is someone else's writing — and still worth reading
  assert.ok(!isMine("https://www.threads.com/@othereditor/post/Dc46GnSEyD3", "Jane Doe 說的這段很有道理"));
  // Substrings must not match: a different account that merely starts the same way
  assert.ok(!isMine("https://www.threads.com/@janedoewannabe/post/Dc46GnSEyD3"));
});

test("ordinary articles yield no author and are never treated as own posts", () => {
  assert.deepEqual(socialAuthorsOf("https://www.cna.com.tw/news/acul/202607020152.aspx"), []);
  assert.ok(!isMine("https://www.cna.com.tw/news/acul/202607020152.aspx", "立院審查文化部預算"));
  // A bare Instagram post URL genuinely has no author to extract — it must not throw
  assert.deepEqual(socialAuthorsOf("https://www.instagram.com/p/DXwBm4fE0AT/", "(1) Instagram"), []);
});

test("no configured handles means the filter is inert", () => {
  assert.ok(!isOwnSocialPost("https://www.threads.com/@janedoe/post/DaS_RfWD1G9", null, []));
});
