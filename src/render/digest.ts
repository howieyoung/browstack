import { getDb, setMeta } from "../db.js";
import { getCurrentIssue } from "../issue.js";
import { getProvider } from "../llm/provider.js";
import { resolveContentLanguage } from "../locale.js";
import { selectIssueItems, type IssueItem } from "./select.js";

/**
 * Weekly reading digest: BEFORE generating the cover prompt, produce one sharp editorial read of what
 * the reader actually consumed this week — reflecting "what this person was chasing and drawn to this week",
 * not a content list, and not a description of the cover image.
 * Stored in meta (key: issue_digest:N) for use as the subtitle in the archive showcase.
 *
 * Usage:
 *   tsx src/render/digest.ts        # current issue (live selection via selectIssueItems)
 *   tsx src/render/digest.ts <N>    # specific issue (rebuilt from issue_items, for backfilling past issues)
 */

interface Seed {
  topic: string | null;
  title: string;
  note?: string; // an article's takeaway or a social post's context — lets the LLM see the substance, not just the title
  kind: string;
}

const cleanTitle = (s: string) => s.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim();

function noteOf(summary: string | null): string | undefined {
  try {
    const s = JSON.parse(summary ?? "{}") as { takeaway?: string; context?: string };
    return s.takeaway ?? s.context;
  } catch {
    return undefined;
  }
}

const seedOf = (i: IssueItem, kind: string): Seed => ({
  topic: i.topic,
  title: cleanTitle(i.title),
  note: noteOf(i.summary),
  kind,
});

function currentSeeds(): Seed[] {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const { articles, socialPosts } = selectIssueItems(weekAgo);
  return [...articles.map((i) => seedOf(i, "article")), ...socialPosts.map((i) => seedOf(i, "social"))];
}

function issueSeeds(n: number): Seed[] {
  const rows = getDb()
    .prepare(
      `SELECT p.title, p.topic, p.kind, p.summary
         FROM issue_items ii JOIN pages p ON p.id = ii.page_id
        WHERE ii.issue_number = ? AND p.title IS NOT NULL AND p.summary IS NOT NULL
        ORDER BY p.kind DESC`,
    )
    .all(n) as Array<{ title: string; topic: string | null; kind: string; summary: string }>;
  return rows.map((r) => ({ topic: r.topic, title: cleanTitle(r.title), note: noteOf(r.summary), kind: r.kind }));
}

const arg = process.argv[2];
const issueNo = arg !== undefined ? Number(arg) : getCurrentIssue().number;
if (!Number.isInteger(issueNo) || issueNo < 0) {
  console.error(`期數不合法：${arg}`);
  process.exit(1);
}
const seeds = arg !== undefined ? issueSeeds(issueNo) : currentSeeds();
if (seeds.length === 0) {
  console.log(`第 ${issueNo} 期無入選內容,略過閱讀速寫`);
  process.exit(0);
}

const lang = resolveContentLanguage();
const provider = getProvider();
const reply = await provider.complete({
  system:
    `You are the editor of a personal weekly digest called Browstack, writing this issue's ` +
    `one-line "reading digest". You will be given what the reader actually read this week ` +
    `(topics, titles, and the key point of each). Write ONE line in ${lang} that naturally ` +
    `surfaces a few of the concrete subjects/themes this week's reading circled around — name ` +
    `the real topics, fields and key concepts, so the reader instantly recognizes what they read ` +
    `and where their focus landed. Be concrete and grounded in the actual content; no vague ` +
    `aphorisms, no forced insight, no showing off wit, and do not describe any cover image.`,
  prompt:
    `What the reader actually read this week:\n${JSON.stringify(seeds, null, 1)}\n\n` +
    `Output ONE short sentence in ${lang}, surfacing the 2–3 weightiest concrete subjects/keywords ` +
    `(most important first; you need not list them all), reading like an editor's one-line lead-in ` +
    `for this issue. Keep it to a single tight line — about 18–32 characters for CJK, or about 10–16 words ` +
    `otherwise; do not exceed one line. Output only that line: no quotes, no label prefix, no bullet list.`,
  maxTokens: 300,
});

// Layout safety net: when over the limit, end at the nearest break instead of cutting mid-word (normally the prompt already keeps length within ~40 chars)
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const brk = Math.max(head.lastIndexOf("、"), head.lastIndexOf("，"), head.lastIndexOf("；"), head.lastIndexOf(" "));
  return (brk > max * 0.5 ? head.slice(0, brk) : head).trim();
}

// Strip any code fences, leading/trailing quotes, and extra whitespace
const cleaned = reply
  .replace(/```/g, "")
  .trim()
  .replace(/^[「『"']+|[」』"']+$/g, "")
  .replace(/\s+/g, " ")
  .trim();
const digest = clip(cleaned, 120);

if (!digest) {
  console.error("閱讀速寫生成為空,未寫入");
  process.exit(1);
}
setMeta(`issue_digest:${issueNo}`, digest);
console.log(`已寫入第 ${issueNo} 期閱讀速寫（${digest.length} 字）`); // don't print the content — it's data derived from personal reading
