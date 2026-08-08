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
 * Cover generation engine: each issue produces an illustration in The New Yorker's cover art language, driven by the issue's content themes.
 * Two stages: LLM art director (concept and full image prompt) -> image generation engine (renders PNG).
 */

/**
 * The New Yorker cover style spec (the art director's fixed constraints, unchanged issue to issue — this is the publication's visual identity):
 * 1. One image, one metaphor: the cover is a gentle commentary on the moment, not a diagrammatic collage of content
 * 2. Flat color fields and silkscreen texture: gouache/silkscreen feel, no gradients or realistic lighting, subtle paper grain
 * 3. Limited palette: 5–7 colors, quiet warm print tones (deep teal, brick red, mustard, cream, ink)
 * 4. Generous negative space: asymmetric composition, plenty of white space, top 18% of the frame kept clean for the masthead
 * 5. An intimate urban moment: figures small and precise, solitary but not sad, with a touch of wit
 * 6. Never any text within the image
 * Lineage reference: Adrian Tomine's urban observation × Malika Favre's bold negative space × Christoph Niemann's conceptual wit
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
  console.error("No knowledge content in the last 7 days to use as a cover theme; run npm run enrich first");
  process.exit(1);
}

const provider = getProvider();
console.log(`${items.length} theme materials for this issue, asking ${provider.name} to serve as art director…`);

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
console.log(`\nThis issue's cover concept: ${concept.concept}\n`);

try {
  if (process.env.BROWSTACK_DISABLE_IMAGE) throw new Error("Image engine disabled by BROWSTACK_DISABLE_IMAGE");
  const image = getImageProvider();
  console.log(`Handing off to ${image.name} to render…`);
  const png = await image.generate(concept.image_prompt_en);
  const outPath = path.join(coversDir, `issue-${issueNo}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Cover complete: ${outPath}`);
} catch (e) {
  // Fallback when no image engine key is available: draw an SVG illustration directly with the subscription AI (strongest model + high effort level)
  console.log(`Image engine did not run (${String(e).slice(0, 120)}); falling back to subscription AI to draw an SVG cover…`);
  try {
    const svg = await generateSvgCover(concept);
    const outPath = path.join(coversDir, `issue-${issueNo}.svg`);
    fs.writeFileSync(outPath, svg);
    console.log(`SVG cover complete: ${outPath}`);
    console.log("(Tip: set OPENAI_API_KEY for a more refined image-engine cover, see README)");
  } catch (e2) {
    console.log(`SVG fallback also failed: ${String(e2).slice(0, 160)}`);
    console.log("This issue will reuse the most recent / default cover; publishing is unaffected.");
  }
}

async function generateSvgCover(c: { concept: string; image_prompt_en: string }): Promise<string> {
  // Prefer the strongest subscription model + high effort; fall back to the default model when unavailable. Drawing is slow, so allow 10 minutes.
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
      if (start === -1 || end === -1) throw new Error("No complete SVG in the reply");
      const svg = reply.slice(start, end + 6);
      if (/<script|<image|<foreignObject|xlink:href|\shref=|on[a-z]+=/i.test(svg)) {
        throw new Error("SVG contains disallowed elements or attributes");
      }
      return svg;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
