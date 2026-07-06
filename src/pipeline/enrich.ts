import { getDb } from "../db.js";
import { fetchArticle } from "../fetch/extract.js";
import { getProvider, parseJsonReply } from "../llm/provider.js";

/**
 * M2 enrich 管線：知識分類 → 正文補抓 → 摘要。
 * 核心編輯原則（產品決策）：非知識型內容，無論停留多久都不入刊。
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
        WHERE last_seen > ? AND is_knowledge IS NULL
          AND title IS NOT NULL AND LENGTH(title) > 8`;

  // 文章與社群優先入池，不讓高停留的 unknown 雜訊把它們擠掉
  const articleSocial = db
    .prepare(`${baseSelect} AND kind IN ('article', 'social') ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 30`)
    .all(weekAgo) as Candidate[];
  const unknowns = (
    db
      .prepare(`${baseSelect} AND kind = 'unknown' ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 60`)
      .all(weekAgo) as Candidate[]
  )
    // 根路徑是入口頁不是單篇內容（掛著沒關的首頁常累積巨量停留）
    .filter((c) => new URL(c.url).pathname !== "/")
    .slice(0, 20);
  return [...articleSocial, ...unknowns];
}

export function applyEnrichment(records: EnrichmentRecord[]): { updated: number; upgraded: number } {
  const db = getDb();
  const update = db.prepare(
    "UPDATE pages SET is_knowledge = ?, topic = COALESCE(?, topic), summary = COALESCE(?, summary) WHERE id = ?",
  );
  // LLM 判定為知識型的 unknown 頁面，升級為 article
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
  const list = candidates.map((c) => ({ id: c.id, kind: c.kind, title: c.title, host: new URL(c.url).hostname }));
  const reply = await provider.complete({
    system:
      "你是 browstack 個人週刊的選題編輯。只收錄知識型內容：科技、AI、產業分析、商業洞察、深度公共議題、專業知識、有觀點或資訊價值的社群貼文。" +
      "一律排除：娛樂八卦、彩券、購物促銷、會員活動、網站專區或列表頁（非單篇內容）、純聊天或情緒抒發、廣告宣傳頁。",
    prompt:
      `判斷以下候選內容，回傳 JSON array，每項格式 {"id": number, "is_knowledge": boolean, "topic": "2~6字中文主題標籤"}（非知識型的 topic 給 null）。只輸出 JSON。\n\n` +
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
      console.log(`  ✓ ${new URL(t.url).hostname}（${article.text.length} 字）`);
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
  const weekAgo = Math.floor(Date.now() / 1000) - DAYS * 86400;

  // 文章：內文（或退而求其次用標題）→ 三個重點 + 一句 takeaway
  const articles = db
    .prepare(
      `SELECT id, title, content_text FROM pages
        WHERE kind = 'article' AND is_knowledge = 1 AND summary IS NULL AND last_seen > ?
        ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 10`,
    )
    .all(weekAgo) as Array<{ id: number; title: string; content_text: string | null }>;
  const saveSummary = db.prepare("UPDATE pages SET summary = ? WHERE id = ?");
  let done = 0;
  for (const a of articles) {
    if (!a.content_text) continue;
    const reply = await provider.complete({
      system: "你是週刊編輯，把文章濃縮成足以取代原文閱讀的摘要。",
      prompt:
        `輸出 JSON：{"bullets": ["…", "…", "…"], "takeaway": "…"}。三個 bullet 各 ≤ 42 字，takeaway 是一句「為什麼值得記住」≤ 32 字。只輸出 JSON。\n\n` +
        `標題：${a.title}\n內文節錄：${a.content_text.slice(0, 6000)}`,
      maxTokens: 1024,
    });
    saveSummary.run(JSON.stringify(parseJsonReply(reply)), a.id);
    done++;
  }

  // 社群貼文：title 已攜帶全文 → 一句脈絡
  const posts = db
    .prepare(
      `SELECT id, title FROM pages
        WHERE kind = 'social' AND is_knowledge = 1 AND summary IS NULL AND last_seen > ? AND LENGTH(title) >= 40
        LIMIT 8`,
    )
    .all(weekAgo) as Array<{ id: number; title: string }>;
  if (posts.length > 0) {
    const reply = await provider.complete({
      system: "你是週刊編輯。",
      prompt:
        `為每則社群貼文寫一句編輯脈絡（≤ 36 字，說明它在談什麼、為何值得記住）。回傳 JSON array：[{"id": number, "context": "…"}]。只輸出 JSON。\n\n` +
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

// 全自動 enrich：每週由排程呼叫
export async function enrich(): Promise<void> {
  const candidates = getCandidates();
  console.log(`候選 ${candidates.length} 項，交由 ${getProvider().name} 分類…`);
  if (candidates.length > 0) {
    const records = await classifyCandidates(candidates);
    const { updated, upgraded } = applyEnrichment(records);
    console.log(`已分類 ${updated} 項（unknown 升級為文章 ${upgraded} 項）`);
  }
  console.log("補抓知識型文章正文…");
  const { fetched, failed } = await fetchMissingContent();
  console.log(`抓到 ${fetched} 篇、失敗 ${failed} 篇`);
  const summarized = await summarizeKnowledgePages();
  console.log(`完成 ${summarized} 份摘要`);
}
