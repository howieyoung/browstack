/**
 * HTML 輸出跳脫——共用於 email 與 preview／archive 渲染。
 * 內容多來自用戶瀏覽過的任意網頁（標題、摘要、URL），視為攻擊者可影響的字串。
 * 純字串運算、無 Node 相依。
 */

// 同時處理文字與屬性語境：& < > 之外，還跳脫 " 與 '，
// 讓 href="${esc(...)}" 這類屬性插值也不會被引號突破。
export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// href 只允許 http/https；其餘（javascript:、data: 等）一律歸零成 "#"。
// 回傳值已經跳脫，可直接放進 href="${safeHref(url)}"。
export function safeHref(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return esc(url);
  } catch {
    // 無法解析的字串不當作連結
  }
  return "#";
}
