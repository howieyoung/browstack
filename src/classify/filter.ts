import { SHARED } from "../shared/settings.js";

export type PageKind = "article" | "social" | "media" | "noise" | "unknown";

export interface Classification {
  kind: PageKind;
  // 敏感頁面（金融、信箱、帳號）：連本地 DB 都不寫入
  sensitive: boolean;
}

const SENSITIVE_HOST = [
  /bank/i,
  /^gib\./,
  /esun/i,
  /richart/i,
  /^mail\./,
  /^accounts\./,
  /paypal\.com$/,
  /^pay\./,
  /^ebill\./, // 繳費平台
  /(^|\.)gov\.tw$/, // 政府個人業務（勞保、報稅等）
  /^auth\./, // 登入/MFA 頁
  /(^|\.)(cathaybk|cathay-ins|taishinbank|firstbank|megabank)\.com\.tw$/, // 台灣金融機構（bank 關鍵字抓不到的）
];

const NOISE_HOST = [
  /^(www\.)?google\.com$/,
  /^(calendar|docs|drive|meet|keep|translate)\.google\.com$/,
  /^news\.ycombinator\.com$/, // 連結樞紐頁，真正的內容在外部連結
  /^github\.com$/, // v0 先視為工作雜訊；README/技術文閱讀情境之後重新評估
  /^(dash|console|admin|app)\./,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
  /^[a-p]{32}$/, // chrome-extension://<id>
  /^(claude\.(ai|com)|chatgpt\.com|perplexity\.ai)$/, // AI 對話工具是工作介面，不是閱讀內容
  /(^|\.)(pchome\.com\.tw|momoshop\.com\.tw|shopee\.tw|ruten\.com\.tw)$/, // 購物
  /^(platform|analytics|status|billing)\./, // 開發者主控台、帳務、監控
  /console\.aws\.amazon\.com$/,
  /(^|\.)(sentry\.io|discord\.com|canva\.com|figma\.com|notion\.so|slack\.com)$/, // 工作工具
  /(^|\.)(wikipedia\.org|wiktionary\.org|hinative\.com|moedict\.tw)$/, // 百科/字典＝快查行為，不是閱讀
];

const SOCIAL_PERMALINK: Array<{ host: RegExp; path: RegExp }> = [
  { host: /(^|\.)facebook\.com$/, path: /(\/story\.php|\/posts\/|\/reel\/|\/photo|\/share\/p\/|\/groups\/.+\/(posts|permalink)\/)/ },
  { host: /(^|\.)threads\.(net|com)$/, path: /\/@[^/]+\/post\// },
  { host: /(^|\.)(twitter|x)\.com$/, path: /\/[^/]+\/status\/\d+/ },
  { host: /(^|\.)linkedin\.com$/, path: /\/posts\// },
  { host: /(^|\.)reddit\.com$/, path: /\/r\/[^/]+\/comments\// },
];

const MEDIA: Array<{ host: RegExp; path?: RegExp }> = [
  { host: /(^|\.)youtube\.com$/, path: /^\/(watch|shorts)/ },
  { host: /^youtu\.be$/ },
  { host: /(^|\.)spotify\.com$/ },
  { host: /(^|\.)(netflix|twitch)\.(com|tv)$/ },
];

const ARTICLE_HOST_SUFFIX = [
  "substack.com", "medium.com", "github.io", "dev.to", "hackernoon.com",
  "vocus.cc", "matters.town", "mirror.xyz",
  "technews.tw", "inside.com.tw", "bnext.com.tw", "ithome.com.tw", "cna.com.tw", "udn.com",
  "theverge.com", "techcrunch.com", "arstechnica.com", "wired.com",
  "nytimes.com", "bloomberg.com", "reuters.com", "economist.com", "newyorker.com",
];

const ARTICLE_PATH = [
  /\/(blog|article|articles|news|story|stories|posts?|p)\//,
  /\/\d{4}\/\d{1,2}\//,
  /\.html?$/,
];

function lastSegmentLooksLikeSlug(pathname: string): boolean {
  const seg = pathname.split("/").filter(Boolean).pop() ?? "";
  return seg.length >= 15 && (seg.match(/-/g)?.length ?? 0) >= 2;
}

export function classifyUrl(rawUrl: string): Classification {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { kind: "noise", sensitive: false };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { kind: "noise", sensitive: false };
  }
  const host = u.hostname;
  const pathname = u.pathname;

  if (SENSITIVE_HOST.some((re) => re.test(host))) {
    return { kind: "noise", sensitive: true };
  }
  if (SHARED.userNoiseHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { kind: "noise", sensitive: false };
  }
  for (const { host: h, path: p } of SOCIAL_PERMALINK) {
    if (h.test(host)) {
      // 符合 permalink 的是內容；其餘（動態牆、通知頁）是雜訊
      return { kind: p.test(pathname) ? "social" : "noise", sensitive: false };
    }
  }
  for (const { host: h, path: p } of MEDIA) {
    if (h.test(host)) {
      return { kind: !p || p.test(pathname) ? "media" : "noise", sensitive: false };
    }
  }
  if (NOISE_HOST.some((re) => re.test(host))) {
    return { kind: "noise", sensitive: false };
  }
  if (ARTICLE_HOST_SUFFIX.some((s) => host === s || host.endsWith(`.${s}`))) {
    // 內容站的首頁/列表頁不算文章
    if (pathname === "/" || pathname === "") return { kind: "noise", sensitive: false };
    return { kind: "article", sensitive: false };
  }
  if (ARTICLE_PATH.some((re) => re.test(pathname)) || lastSegmentLooksLikeSlug(pathname)) {
    return { kind: "article", sensitive: false };
  }
  return { kind: "unknown", sensitive: false };
}
