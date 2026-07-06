import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { SHARED } from "../shared/settings.js";

export interface ExtractedArticle {
  title: string | null;
  text: string;
  excerpt: string | null;
}

// 事後補抓 history 頁面的正文（extension 上線後，新內容改由瀏覽當下擷取）
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
  if (!contentType.includes("html")) throw new Error(`非 HTML：${contentType}`);
  const html = await res.text();

  // 靜音 jsdom 的 CSS/資源解析噪音
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url, virtualConsole });
  const parsed = new Readability(dom.window.document).parse();
  const text = parsed?.textContent?.trim();
  if (!parsed || !text) throw new Error("Readability 抽不出正文");
  return {
    title: parsed.title || null,
    text: text.slice(0, SHARED.capture.maxTextLength),
    excerpt: parsed.excerpt || null,
  };
}
