import { SHARED } from "../shared/settings.js";

export type PageKind = "article" | "social" | "media" | "noise" | "unknown";

export interface Classification {
  kind: PageKind;
  // Sensitive pages (finance, mail, accounts): not even written to the local DB
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
  /^ebill\./, // bill-payment platforms
  /(^|\.)gov\.tw$/, // government personal services (labor insurance, tax filing, etc.)
  /^auth\./, // login/MFA pages
  /(^|\.)(cathaybk|cathay-ins|taishinbank|firstbank|megabank)\.com\.tw$/, // Taiwanese financial institutions (the ones the 'bank' keyword misses)
];

const NOISE_HOST = [
  /^(www\.)?google\.com$/,
  /^(calendar|docs|drive|meet|keep|translate)\.google\.com$/,
  /^news\.ycombinator\.com$/, // link hub page; the real content is in the external links
  /^github\.com$/, // treated as work noise for v0; revisit README/technical-doc reading scenarios later
  /^(dash|console|admin|app)\./,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
  /^[a-p]{32}$/, // chrome-extension://<id>
  /^(claude\.(ai|com)|chatgpt\.com|perplexity\.ai)$/, // AI chat tools are a work interface, not reading content
  /(^|\.)(pchome\.com\.tw|momoshop\.com\.tw|shopee\.tw|ruten\.com\.tw)$/, // shopping
  /(^|\.)vscinemas\.com/, // cinema showtimes / ticketing — entertainment logistics, not reading
  /(^|\.)(kktix\.com|accupass\.com|opentix\.life|ibon\.com\.tw|famiticket\.com\.tw)$/, // event ticketing platforms
  /^(platform|analytics|status|billing)\./, // developer consoles, billing, monitoring
  /console\.aws\.amazon\.com$/,
  /(^|\.)(sentry\.io|discord\.com|canva\.com|figma\.com|notion\.so|slack\.com)$/, // work tools
  /(^|\.)(wikipedia\.org|wiktionary\.org|hinative\.com|moedict\.tw)$/, // encyclopedia/dictionary = quick-lookup behavior, not reading
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
      // A permalink match is content; everything else (feeds, notification pages) is noise
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
    // A content site's homepage/list page doesn't count as an article
    if (pathname === "/" || pathname === "") return { kind: "noise", sensitive: false };
    return { kind: "article", sensitive: false };
  }
  if (ARTICLE_PATH.some((re) => re.test(pathname)) || lastSegmentLooksLikeSlug(pathname)) {
    return { kind: "article", sensitive: false };
  }
  return { kind: "unknown", sensitive: false };
}
