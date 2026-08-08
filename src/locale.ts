import { getDb } from "./db.js";
import { USER_CONFIG } from "./shared/userConfig.js";

/**
 * Resolves the language used for LLM-generated content (topic labels, summaries,
 * the weekly reading digest, the cover concept). This is a global-facing project,
 * so the default follows the language the user actually reads.
 *
 * Resolution order:
 *   1. Explicit override — USER_CONFIG.contentLanguage, when set and not "auto".
 *   2. The `pages.lang` column, when enough pages carry a real language tag.
 *   3. A zero-dependency script heuristic over recent titles + summaries
 *      (kana → Japanese, hangul → Korean, other CJK → Chinese, Latin → English),
 *      because Chrome/extension language tags are frequently empty.
 *   4. English as the ultimate fallback.
 *
 * Image-generation prompts stay English regardless (image models expect English);
 * only the human-readable concept text follows this language.
 */

// BCP-47-ish code → human language name used inside prompts ("write in <name>").
const LANG_NAMES: Record<string, string> = {
  en: "English",
  zh: "Traditional Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
  "zh-hk": "Traditional Chinese",
  "zh-cn": "Simplified Chinese",
  "zh-hans": "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ru: "Russian",
};

function nameForCode(code: string): string | null {
  const c = code.trim().toLowerCase();
  if (LANG_NAMES[c]) return LANG_NAMES[c];
  const base = c.split("-")[0];
  return LANG_NAMES[base] ?? null;
}

// Dominant language among pages that carry a usable tag (empty/null/und/zz filtered out).
// Returns null when the signal is too thin to trust.
function fromLangColumn(): string | null {
  const rows = getDb()
    .prepare(
      `SELECT lang, COUNT(*) AS n FROM pages
        WHERE is_knowledge = 1 AND lang IS NOT NULL AND lang != '' AND lang != 'und' AND lang != 'zz'
        GROUP BY lang ORDER BY n DESC`,
    )
    .all() as Array<{ lang: string; n: number }>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (total < 5) return null; // too little signal — fall through to the script heuristic
  return nameForCode(rows[0].lang);
}

// Script heuristic over recent reading — robust when language tags are missing.
function fromScript(): string | null {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(title, '') || ' ' || COALESCE(summary, '') AS t FROM pages
        WHERE is_knowledge = 1 AND summary IS NOT NULL
        ORDER BY last_seen DESC LIMIT 60`,
    )
    .all() as Array<{ t: string }>;
  let kana = 0;
  let hangul = 0;
  let cjk = 0;
  let latin = 0;
  for (const { t } of rows) {
    for (const ch of t) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp >= 0x3040 && cp <= 0x30ff) kana++;
      else if (cp >= 0xac00 && cp <= 0xd7a3) hangul++;
      else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
      else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) latin++;
    }
  }
  const max = Math.max(kana, hangul, cjk, latin);
  if (max === 0) return null;
  if (max === kana) return "Japanese";
  if (max === hangul) return "Korean";
  if (max === cjk) return "Traditional Chinese"; // can't tell trad/simp by script; lang column covers Simplified
  return "English";
}

export function resolveContentLanguage(): string {
  const override = (USER_CONFIG as { contentLanguage?: string }).contentLanguage;
  if (override && override.trim().toLowerCase() !== "auto") {
    // Accept either a BCP-47 code ("en", "ja") or a plain language name ("English").
    return nameForCode(override) ?? override.trim();
  }
  return fromLangColumn() ?? fromScript() ?? "English";
}
