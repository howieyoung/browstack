import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { SHARED } from "../shared/settings.js";

export interface ExtractedArticle {
  title: string | null;
  text: string;
  excerpt: string | null;
}

// Back-fill the body text for history pages (once the extension is live, new content is captured at browse time instead).
export async function fetchArticle(url: string): Promise<ExtractedArticle> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) throw new Error(`Not HTML: ${contentType}`);
  const html = await res.text();

  // Silence jsdom's CSS/resource parsing noise.
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url, virtualConsole });
  const parsed = new Readability(dom.window.document).parse();
  const text = parsed?.textContent?.trim();
  if (!parsed || !text) throw new Error("Readability could not extract body text");
  return {
    title: parsed.title || null,
    text: text.slice(0, SHARED.capture.maxTextLength),
    excerpt: parsed.excerpt || null,
  };
}
