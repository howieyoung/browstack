import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { getDb } from "../db.js";
import { getCurrentIssue } from "../issue.js";
import { ClaudeCliProvider } from "../llm/claudeCli.js";
import { getImageProvider } from "../llm/image.js";
import { getProvider, parseJsonReply } from "../llm/provider.js";
import { resolveContentLanguage } from "../locale.js";

/**
 * 封面生成引擎：每期依內容主題，以 The New Yorker 的封面藝術語言生成插畫。
 * 兩段式：LLM 藝術總監（概念與完整 image prompt）→ 圖像生成引擎（渲染 PNG）。
 */

/**
 * The New Yorker 封面風格規格（藝術總監的固定約束，逐期不變——這就是刊物的視覺識別）：
 * 1. 一個畫面、一個隱喻：封面是對時代的一則溫和評論，不是內容的圖解拼貼
 * 2. 扁平色塊與絹印質感：gouache/silkscreen 手感、無漸層無寫實光影、細微紙紋
 * 3. 有限色盤：5–7 色，靜謐偏暖的印刷色（深青、磚紅、芥黃、奶油、墨色系）
 * 4. 慷慨的負空間：不對稱構圖、大量留白、畫面上緣 18% 保持簡潔供刊頭壓字
 * 5. 都市的親密時刻：人物小而精準，孤獨但不悲傷，帶一點機智
 * 6. 畫面內絕不出現文字
 * 譜系參照：Adrian Tomine 的都市觀察 × Malika Favre 的大膽負空間 × Christoph Niemann 的概念機智
 */
const ART_DIRECTION_EN = `Style: The New Yorker magazine cover illustration tradition.
Flat gouache / silkscreen texture, matte paper grain, absolutely no gradients, no 3D, no photorealism.
Limited palette of 5-7 muted warm print colors (deep teal, brick red, mustard, cream, ink).
One single visual metaphor, witty and gentle, never a literal collage of topics.
Generous negative space, asymmetric composition; keep the top 18% of the frame calm and simple so a masthead can be overlaid.
An intimate urban human moment: small, precise figures; solitary but warm.
Absolutely no text, letters, numbers or logos anywhere in the artwork.
Portrait format. Lineage: Adrian Tomine's urban observation x Malika Favre's bold negative space x Christoph Niemann's conceptual wit.`;

const DAYS = 7;
const issueNo = process.argv[2] !== undefined ? Number(process.argv[2]) : getCurrentIssue().number;

const db = getDb();
const weekAgo = Math.floor(Date.now() / 1000) - DAYS * 86400;
const items = db
  .prepare(
    `SELECT topic, SUBSTR(title, 1, 80) AS title FROM pages
      WHERE is_knowledge = 1 AND published_in IS NULL AND last_seen > ? AND topic IS NOT NULL
      ORDER BY active_seconds_total DESC, total_duration_sec DESC LIMIT 12`,
  )
  .all(weekAgo) as Array<{ topic: string; title: string }>;

if (items.length === 0) {
  console.error("近 7 天沒有知識型內容可作為封面主題，先跑 npm run enrich");
  process.exit(1);
}

const provider = getProvider();
console.log(`本期主題素材 ${items.length} 項，請 ${provider.name} 擔任藝術總監…`);

const lang = resolveContentLanguage();
const reply = await provider.complete({
  system:
    "You are the cover art director for Browstack, a personal weekly digest that turns the reader's " +
    "own browsing/reading into an issue. Your job: from this week's content, find ONE observation worth " +
    "commenting on and turn it into a single visual metaphor. Do not collage multiple topics.",
  prompt:
    `This issue's topics and titles:\n${JSON.stringify(items, null, 1)}\n\n` +
    `Fixed style spec (must not be violated):\n${ART_DIRECTION_EN}\n\n` +
    `Output JSON: {"concept": "a concept note for the editor, <= ~60 words, written in ${lang}", ` +
    `"image_prompt_en": "the full ENGLISH prompt for the image model — scene, composition, palette hex, ` +
    `mood — with the style spec above fully embedded"}. Output only JSON.`,
  maxTokens: 2048,
});

const concept = parseJsonReply<{ concept: string; image_prompt_en: string }>(reply);
const coversDir = path.join(CONFIG.dataDir, "..", "assets", "covers");
fs.mkdirSync(coversDir, { recursive: true });
fs.writeFileSync(
  path.join(coversDir, `issue-${issueNo}.concept.json`),
  JSON.stringify(concept, null, 2),
);
console.log(`\n本期封面概念：${concept.concept}\n`);

try {
  if (process.env.BROWSTACK_DISABLE_IMAGE) throw new Error("圖像引擎已由 BROWSTACK_DISABLE_IMAGE 停用");
  const image = getImageProvider();
  console.log(`交由 ${image.name} 渲染…`);
  const png = await image.generate(concept.image_prompt_en);
  const outPath = path.join(coversDir, `issue-${issueNo}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`封面完成：${outPath}`);
} catch (e) {
  // 沒有圖像引擎金鑰時的後備：用訂閱制 AI（最強模型＋高思考等級）直接畫 SVG 插畫
  console.log(`圖像引擎未執行（${String(e).slice(0, 120)}），改用訂閱 AI 繪製 SVG 封面…`);
  try {
    const svg = await generateSvgCover(concept);
    const outPath = path.join(coversDir, `issue-${issueNo}.svg`);
    fs.writeFileSync(outPath, svg);
    console.log(`SVG 封面完成：${outPath}`);
    console.log("（提示：設定 OPENAI_API_KEY 可獲得更精緻的圖像引擎封面，見 README）");
  } catch (e2) {
    console.log(`SVG 後備也未完成：${String(e2).slice(0, 160)}`);
    console.log("本期將沿用最近一期／預設封面，不影響出刊。");
  }
}

async function generateSvgCover(c: { concept: string; image_prompt_en: string }): Promise<string> {
  // 偏好最強訂閱模型＋高思考；不可用時退回預設模型。畫圖較慢，給 10 分鐘。
  const artists =
    CONFIG.llm.provider === "claude-cli"
      ? [
          new ClaudeCliProvider({ model: "opus", highEffort: true, timeoutMs: 600_000 }),
          new ClaudeCliProvider({ timeoutMs: 600_000 }),
        ]
      : [getProvider()];
  let lastErr: unknown = null;
  for (const artist of artists) {
    try {
      const reply = await artist.complete({
        system:
          "You are a top vector illustrator working in the New Yorker cover tradition. You will use SVG " +
          "directly as your canvas to produce one complete, refined illustration with compositional depth.",
        prompt:
          `Realize this cover concept:\n${c.concept}\n\nScene reference (for understanding, need not follow verbatim): ${c.image_prompt_en.slice(0, 800)}\n\n` +
          `Hard spec:\n` +
          `- Output exactly one complete <svg>…</svg>, no other text or code fences\n` +
          `- viewBox="0 0 1000 1500" portrait; keep the top 18% calm so a masthead can be overlaid\n` +
          `- Use only these colors: #1f4e5f #16394a #b5361c #e8a13d #f2e8d5 #211c15 #6b8f71 #d9cfb4\n` +
          `- Flat color fields, no gradients, no filters; compose fore/mid/background with generous negative space\n` +
          `- Forbidden: any text/letters/numbers, <script>, <image>, <foreignObject>, external links, event attributes\n` +
          `- Build the scene from ~40–90 geometric elements (figures, furniture, light as shapes); enough is enough, do not over-elaborate`,
        maxTokens: 16384,
      });
      const start = reply.indexOf("<svg");
      const end = reply.lastIndexOf("</svg>");
      if (start === -1 || end === -1) throw new Error("回覆中沒有完整的 SVG");
      const svg = reply.slice(start, end + 6);
      if (/<script|<image|<foreignObject|xlink:href|\shref=|on[a-z]+=/i.test(svg)) {
        throw new Error("SVG 含不允許的元素或屬性");
      }
      return svg;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
