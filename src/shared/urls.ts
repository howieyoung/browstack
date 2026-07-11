/**
 * URL 與標題正規化——同一篇內容的不同「分身」必須被視為同一篇。
 * 典型病因：Facebook/IG/Google 的點擊追蹤參數（每次點擊都不同），
 * 讓同一篇文章在 Chrome 紀錄裡變成多個 URL → 多個頁面 → 刊物內重複。
 */

// 純追蹤用的 query 參數（不影響頁面內容），正規化時一律剝除
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "twclid", "ttclid",
  "igshid", "igsh", "mibextid",
  "mc_cid", "mc_eid", "mkt_tok", "vero_id",
  "spm", "xtor", "share_id", "_hsenc", "_hsmi",
]);

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const drop: string[] = [];
    u.searchParams.forEach((_v, k) => {
      if (TRACKING_PARAMS.has(k.toLowerCase()) || /^utm_/i.test(k)) drop.push(k);
    });
    for (const k of drop) u.searchParams.delete(k);
    let s = u.toString();
    if (s.endsWith("?")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

// 標題正規化：去通知計數前綴「(3) 」、去站名後綴「｜聯合新聞網」，取前 60 字作為識別鍵
export function normalizeTitle(t: string): string {
  return t.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim().slice(0, 60);
}
