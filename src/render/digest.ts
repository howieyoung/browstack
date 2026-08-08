import { getDb, setMeta } from "../db.js";
import { getCurrentIssue } from "../issue.js";
import { getProvider } from "../llm/provider.js";
import { selectIssueItems, type IssueItem } from "./select.js";

/**
 * 當週閱讀速寫：在生成封面 prompt「之前」,對讀者本週實際讀進去的內容做一句精闢的編輯理解——
 * 反映「這個人這週在追什麼、被什麼吸引」,而不是內容清單、也不是封面畫面的描述。
 * 存進 meta（key: issue_digest:N),供典藏櫥窗當副標。
 *
 * 用法：
 *   tsx src/render/digest.ts        # 當期（用 selectIssueItems 的即時選材）
 *   tsx src/render/digest.ts <N>    # 指定期（由 issue_items 重建,用於回填過刊）
 */

interface Seed {
  topic: string | null;
  title: string;
  note?: string; // 文章的 takeaway 或社群的 context——讓 LLM 讀到內容的實質,不只標題
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

const provider = getProvider();
const reply = await provider.complete({
  system:
    "你是個人週刊《Browstack》的主編,為本期寫一句「當週閱讀速寫」。" +
    "你會拿到讀者本週真正讀進去的內容（主題、標題、每篇重點）。" +
    "請寫『一句』繁體中文,自然帶出這週閱讀的幾個具體題材／主體（點名真實的主題、領域、關鍵概念）," +
    "讓讀者一眼就認出自己讀了什麼、重心落在哪。要具體、扣著真實內容;" +
    "不要空泛的格言或硬擠的洞察,不要賣弄機智,也不要描述封面畫面。",
  prompt:
    `本週讀者實際讀進去的內容：\n${JSON.stringify(seeds, null, 1)}\n\n` +
    `輸出一句繁體中文速寫,約 22–38 字,最多帶出 2–3 個最有份量的具體題材／關鍵字（最重要的放前面,不必全列）,` +
    `讀起來像主編為這一期下的一句引言。只輸出這句話:不要引號、不要標籤前綴、不要條列。`,
  maxTokens: 300,
});

// 版面安全網:超過上限時在最近的斷句處收尾,不硬切在詞中間（正常情況 prompt 已把長度控在 ~40 字內）
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const brk = Math.max(head.lastIndexOf("、"), head.lastIndexOf("，"), head.lastIndexOf("；"), head.lastIndexOf(" "));
  return (brk > max * 0.5 ? head.slice(0, brk) : head).trim();
}

// 清掉可能的圍欄、首尾引號、多餘空白
const cleaned = reply
  .replace(/```/g, "")
  .trim()
  .replace(/^[「『"']+|[」』"']+$/g, "")
  .replace(/\s+/g, " ")
  .trim();
const digest = clip(cleaned, 54);

if (!digest) {
  console.error("閱讀速寫生成為空,未寫入");
  process.exit(1);
}
setMeta(`issue_digest:${issueNo}`, digest);
console.log(`已寫入第 ${issueNo} 期閱讀速寫（${digest.length} 字）`); // 不印內容——屬個人閱讀衍生資料
