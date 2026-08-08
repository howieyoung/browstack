import { getDb } from "./db.js";
import { USER_CONFIG } from "./shared/userConfig.js";

/**
 * Resolves the locale for the issue. LLM-generated content (topic labels, summaries,
 * the reading digest, the cover concept) is written in this language; the fixed UI chrome
 * (src/i18n.ts) uses the matching code. This is a global-facing project, so the default
 * follows the language the user actually reads.
 *
 * Resolution order:
 *   1. Explicit override — USER_CONFIG.contentLanguage, when set and not "auto".
 *   2. The `pages.lang` column, when enough pages carry a real language tag.
 *   3. A zero-dependency script heuristic over recent titles + summaries
 *      (kana → Japanese, hangul → Korean, other CJK → Chinese, Latin → English),
 *      because Chrome/extension language tags are frequently empty.
 *   4. English as the ultimate fallback.
 *
 * Image-generation prompts stay English regardless (image models expect English).
 */

// BCP-47-ish code → human language name used inside prompts ("write in <name>").
const LANG_NAMES: Record<string, string> = {
  en: "English",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
  "zh-hk": "Traditional Chinese",
  zh: "Traditional Chinese",
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

// Native names a user might type in the override.
const NATIVE_TO_CODE: Record<string, string> = {
  "繁體中文": "zh-tw",
  "简体中文": "zh-cn",
  "日本語": "ja",
  "한국어": "ko",
  english: "en",
};

function nameForCode(code: string): string {
  const c = code.toLowerCase();
  return LANG_NAMES[c] ?? LANG_NAMES[c.split("-")[0]] ?? "English";
}

// Accept a BCP-47 code or a plain/native language name; return a code.
function normalizeToCode(input: string): string {
  const s = input.trim().toLowerCase();
  if (LANG_NAMES[s]) return s;
  const byName = Object.entries(LANG_NAMES).find(([, name]) => name.toLowerCase() === s);
  if (byName) return byName[0];
  return NATIVE_TO_CODE[input.trim()] ?? NATIVE_TO_CODE[s] ?? s;
}

// Dominant language code among pages that carry a usable tag; null if signal too thin.
function fromLangColumn(): string | null {
  const rows = getDb()
    .prepare(
      `SELECT lang, COUNT(*) AS n FROM pages
        WHERE is_knowledge = 1 AND lang IS NOT NULL AND lang != '' AND lang != 'und' AND lang != 'zz'
        GROUP BY lang ORDER BY n DESC`,
    )
    .all() as Array<{ lang: string; n: number }>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (total < 5) return null;
  return rows[0].lang.toLowerCase();
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
  if (max === kana) return "ja";
  if (max === hangul) return "ko";
  if (max === cjk) return "zh-tw"; // can't tell trad/simp by script; the lang column covers Simplified
  return "en";
}

function detectCode(): string {
  const override = (USER_CONFIG as { contentLanguage?: string }).contentLanguage;
  if (override && override.trim().toLowerCase() !== "auto") return normalizeToCode(override);
  return fromLangColumn() ?? fromScript() ?? "en";
}

// Single source of truth: a BCP-47 code (for the UI table + html lang) and the
// human language name (for LLM prompts).
export function resolveContentLocale(): { code: string; name: string } {
  const code = detectCode();
  return { code, name: nameForCode(code) };
}

// Language name for LLM prompts ("write in <name>").
export function resolveContentLanguage(): string {
  return resolveContentLocale().name;
}
