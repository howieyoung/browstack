import { getDb } from "../db.js";
import { fetchArticle } from "../fetch/extract.js";
import { getProvider, parseJsonReply } from "../llm/provider.js";
import { resolveContentLanguage } from "../locale.js";
import { normalizeTitle } from "../shared/urls.js";

/**
 * M2 enrich pipeline: knowledge classification → body backfill → summarization.
 * Core editorial principle (product decision): non-knowledge content never gets published, no matter how long it was viewed.
 */

export interface Candidate {
  id: number;
  kind: string;
  title: string;
  url: string;
  active_min: number;
  minutes: number;
}

export interface EnrichmentRecord {
  id: number;
  is_knowledge: boolean;
  topic?: string | null;
  summary?: { bullets: string[]; takeaway: string } | { context: string } | null;
}

const DAYS = 7;

export function getCandidates(): Candidate[] {
  const weekAgo = Math.floor(Date.now() / 1000) - DAYS * 86400;
  const db = getDb();
  const baseSelect = `SELECT id, kind, SUBSTR(title, 1, 280) AS title, url,
              ROUND(active_seconds_total / 60.0, 1) AS active_min,
              ROUND(total_duration_sec / 60.0, 1) AS minutes
         FROM pages
        WHERE last_seen > ? AND is_knowledge IS NULL AND published_in IS NULL
          AND title IS NOT NULL AND LENGTH(title) > 8`;

  // Articles and social posts go into the pool first, so high-dwell unknown noise can't crowd them out
  const articleSocial = db
    .prepare(`${baseSelect} AND kind IN ('article', 'social') ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 30`)
    .all(weekAgo) as Candidate[];
  const unknowns = (
    db
      .prepare(`${baseSelect} AND kind = 'unknown' ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 60`)
      .all(weekAgo) as Candidate[]
  )
    // The root path is a landing page, not a single piece of content (an unclosed homepage tab often racks up huge dwell time)
    .filter((c) => new URL(c.url).pathname !== "/")
    .slice(0, 20);
  return [...articleSocial, ...unknowns];
}

export function applyEnrichment(records: EnrichmentRecord[]): { updated: number; upgraded: number } {
  const db = getDb();
  const update = db.prepare(
    "UPDATE pages SET is_knowledge = ?, topic = COALESCE(?, topic), summary = COALESCE(?, summary) WHERE id = ?",
  );
  // Unknown pages the LLM judges to be knowledge-type get upgraded to article
  const upgrade = db.prepare("UPDATE pages SET kind = 'article' WHERE id = ? AND kind = 'unknown'");
  let updated = 0;
  let upgraded = 0;
  db.transaction(() => {
    for (const r of records) {
      update.run(r.is_knowledge ? 1 : 0, r.topic ?? null, r.summary ? JSON.stringify(r.summary) : null, r.id);
      updated++;
      if (r.is_knowledge) upgraded += upgrade.run(r.id).changes;
    }
  })();
  return { updated, upgraded };
}

export async function classifyCandidates(candidates: Candidate[]): Promise<EnrichmentRecord[]> {
  if (candidates.length === 0) return [];
  const provider = getProvider();
  const lang = resolveContentLanguage();
  const list = candidates.map((c) => ({ id: c.id, kind: c.kind, title: c.title, host: new URL(c.url).hostname }));
  const reply = await provider.complete({
    system:
      "You are the commissioning editor of the Browstack personal weekly digest. Knowledge is a HARD gate: keep " +
      "only a piece that teaches, explains, analyzes, or argues something with real substance worth remembering — " +
      "technology, AI, industry analysis, business insight, substantive public-affairs pieces, professional " +
      "knowledge, and social posts with a genuine point of view or informational value. " +
      "Everything else is is_knowledge:false, no matter how long it was viewed. Always exclude: " +
      "entertainment gossip; lotteries and prize checks; shopping promos, product/store pages and menus; " +
      "membership drives and ads/marketing; movie showtimes, cinema/ticketing/booking/reservation and event " +
      "signup pages; schedules, timetables and any transactional or logistics page (checkout, order status, " +
      "seat selection); site sections or list/index pages (not a single piece); pure chatter or venting; and " +
      "all 'quick lookup' behavior — encyclopedia entries, dictionary/word lookups, weather. If a page is about " +
      "DOING or BUYING something (attending, booking, ordering, watching) rather than UNDERSTANDING something, " +
      "it is not knowledge.",
    prompt:
      `Classify the candidates below. Return a JSON array; each item ` +
      `{"id": number, "is_knowledge": boolean, "topic": "a short topic label in ${lang} (2–4 words, or 2–6 characters for CJK)"} ` +
      `(topic null when not knowledge-type). Output only JSON.\n\n` +
      JSON.stringify(list, null, 1),
    maxTokens: 4096,
  });
  return parseJsonReply<Array<{ id: number; is_knowledge: boolean; topic: string | null }>>(reply).map((r) => ({
    id: r.id,
    is_knowledge: r.is_knowledge,
    topic: r.topic,
  }));
}

export async function fetchMissingContent(limit = 12): Promise<{ fetched: number; failed: number }> {
  const db = getDb();
  const weekAgo = Math.floor(Date.now() / 1000) - DAYS * 86400;
  const targets = db
    .prepare(
      `SELECT id, url FROM pages
        WHERE kind = 'article' AND is_knowledge = 1 AND content_text IS NULL AND last_seen > ?
        ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT ?`,
    )
    .all(weekAgo, limit) as Array<{ id: number; url: string }>;
  const save = db.prepare("UPDATE pages SET content_text = ?, title = COALESCE(title, ?) WHERE id = ?");
  let fetched = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      const article = await fetchArticle(t.url);
      save.run(article.text, article.title, t.id);
      fetched++;
      console.log(`  ✓ ${new URL(t.url).hostname} (${article.text.length} chars)`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${new URL(t.url).hostname}：${String(e).slice(0, 80)}`);
    }
  }
  return { fetched, failed };
}

export async function summarizeKnowledgePages(): Promise<number> {
  const db = getDb();
  const provider = getProvider();
  const lang = resolveContentLanguage();
  const weekAgo = Math.floor(Date.now() / 1000) - DAYS * 86400;

  // Articles: body (or the title as a fallback) → three bullets + one takeaway line
  const articles = db
    .prepare(
      `SELECT id, title, content_text FROM pages
        WHERE kind = 'article' AND is_knowledge = 1 AND summary IS NULL
          AND published_in IS NULL AND last_seen > ?
        ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 10`,
    )
    .all(weekAgo) as Array<{ id: number; title: string; content_text: string | null }>;
  const saveSummary = db.prepare("UPDATE pages SET summary = ? WHERE id = ?");
  const demote = db.prepare("UPDATE pages SET is_knowledge = 0 WHERE id = ?");
  // Avoid duplicate work: set of titles of already-summarized knowledge articles; a key collision gets demoted instead of spending another LLM summary
  const knownArticles = new Set(
    (
      db
        .prepare(
          "SELECT title FROM pages WHERE kind = 'article' AND is_knowledge = 1 AND summary IS NOT NULL AND title IS NOT NULL",
        )
        .all() as Array<{ title: string }>
    ).map((r) => normalizeTitle(r.title)),
  );
  let done = 0;
  for (const a of articles) {
    // Quality control: a too-short body is an empty shell from a failed extraction; better to drop it than publish it, so demote
    if (!a.content_text || a.content_text.length < 300) {
      demote.run(a.id);
      continue;
    }
    const titleKey = normalizeTitle(a.title);
    if (knownArticles.has(titleKey)) {
      demote.run(a.id); // tracking-param duplicate: same title already summarized
      continue;
    }
    knownArticles.add(titleKey);
    const reply = await provider.complete({
      system: `You are a weekly-digest editor. Condense the article into a summary written in ${lang} that can replace reading the original.`,
      prompt:
        `Output JSON: {"bullets": ["…", "…", "…"], "takeaway": "…"}, written in ${lang}. ` +
        `Three bullets, each a single tight line (≈ ≤ 14 words, or ≤ 42 characters for CJK); ` +
        `the takeaway is one line on "why this is worth remembering" (≈ ≤ 11 words, or ≤ 32 characters for CJK). ` +
        `Output only JSON.\n\n` +
        `Title: ${a.title}\nBody excerpt: ${a.content_text.slice(0, 6000)}`,
      maxTokens: 1024,
    });
    saveSummary.run(JSON.stringify(parseJsonReply(reply)), a.id);
    done++;
  }

  // Social posts: the title already carries the full text → one line of context
  const normalizePost = normalizeTitle;
  const existingPosts = new Set(
    (
      db
        .prepare(
          "SELECT title FROM pages WHERE kind = 'social' AND is_knowledge = 1 AND summary IS NOT NULL AND last_seen > ?",
        )
        .all(weekAgo) as Array<{ title: string }>
    ).map((p) => normalizePost(p.title)),
  );
  const posts = (
    db
      .prepare(
        `SELECT id, title FROM pages
        WHERE kind = 'social' AND is_knowledge = 1 AND summary IS NULL
          AND published_in IS NULL AND last_seen > ? AND LENGTH(title) >= 40
        LIMIT 8`,
      )
      .all(weekAgo) as Array<{ id: number; title: string }>
  ).filter((p) => {
    // Quality control: the same post often has multiple URLs (different share paths); demote on duplicate content
    const key = normalizePost(p.title);
    if (existingPosts.has(key)) {
      demote.run(p.id);
      return false;
    }
    existingPosts.add(key);
    return true;
  });
  if (posts.length > 0) {
    const reply = await provider.complete({
      system: "You are a weekly-digest editor.",
      prompt:
        `For each social post, write one line of editorial context in ${lang} ` +
        `(≈ ≤ 12 words, or ≤ 36 characters for CJK; what it is about and why it is worth remembering). ` +
        `Return a JSON array: [{"id": number, "context": "…"}]. Output only JSON.\n\n` +
        JSON.stringify(posts.map((p) => ({ id: p.id, text: p.title.slice(0, 500) }))),
      maxTokens: 2048,
    });
    for (const r of parseJsonReply<Array<{ id: number; context: string }>>(reply)) {
      saveSummary.run(JSON.stringify({ context: r.context }), r.id);
      done++;
    }
  }
  return done;
}

// Fully automated enrich: called weekly by the scheduler
export async function enrich(): Promise<void> {
  const candidates = getCandidates();
  console.log(`${candidates.length} candidates, handing off to ${getProvider().name} for classification…`);
  if (candidates.length > 0) {
    let records: EnrichmentRecord[];
    try {
      records = await classifyCandidates(candidates);
    } catch (e) {
      console.log(`Classification failed (${String(e).slice(0, 120)}), retrying once…`);
      records = await classifyCandidates(candidates);
    }
    const { updated, upgraded } = applyEnrichment(records);
    console.log(`Classified ${updated} items (${upgraded} unknowns upgraded to articles)`);
  }
  console.log("Fetching body text for knowledge articles…");
  const { fetched, failed } = await fetchMissingContent();
  console.log(`Fetched ${fetched}, failed ${failed}`);
  const summarized = await summarizeKnowledgePages();
  console.log(`Completed ${summarized} summaries`);
}
