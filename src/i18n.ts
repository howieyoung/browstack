/**
 * UI strings for the rendered surfaces (issue page, email, archive showcase).
 * LLM-generated content follows the reader's language via src/locale.ts; this table
 * covers the fixed chrome. Traditional Chinese values are the project's original
 * strings verbatim, so zh-TW output is unchanged; other locales fall back to English.
 *
 * To add a locale, add an entry to TABLE. Anything missing falls back to English.
 */

export interface UIStrings {
  // section headers / stat labels
  deepReads: string;
  socialEchoes: string;
  weekInFigures: string;
  statDeepReads: string;
  statSocial: string;
  statMinutes: string;
  // item chrome
  viewOriginal: string;
  otherTopic: string;
  socialSource: string;
  device: (d: string) => string;
  signal: (activeMin: number, minutes: number, capped: boolean) => string;
  // issue intro / figures / colophon
  issueNote: (footprint: number | null, arts: number, socials: number) => string;
  figFootprint: (n: number) => string;
  figMobile: (pct: number) => string;
  figPages: (n: number) => string;
  figMinutes: (n: number) => string;
  colophonAuto: string;
  colophonAudience: string;
  // dates
  date: (sec: number) => string;
  // archive showcase
  archiveTagline: string;
  counts: (arts: number, socials: number) => string;
  statusSent: (dateStr: string) => string;
  statusEditing: string;
  coverAlt: (n: number) => string;
  archiveFooter: string;
  // email
  emailArchiveButton: string;
  emailArchiveCaption: string;
  emailSubject: (n: number, title: string) => string;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const en: UIStrings = {
  deepReads: "This Week's Deep Reads",
  socialEchoes: "Social Echoes",
  weekInFigures: "The Week in Figures",
  statDeepReads: "deep reads",
  statSocial: "social echoes",
  statMinutes: "content minutes",
  viewOriginal: "View original",
  otherTopic: "Other",
  socialSource: "Social",
  device: (d) => (d === "both" ? "desktop + mobile" : d === "mobile" ? "mobile" : "desktop"),
  signal: (activeMin, minutes, capped) =>
    activeMin > 0
      ? `⚡ You actively read this for ${activeMin} min this week`
      : `You spent ${minutes}${capped ? "+" : ""} min on this this week`,
  issueNote: (footprint, arts, socials) =>
    footprint == null
      ? `Selected from your browsing over the past seven days — ${arts} deep reads and ${socials} social echoes, with editor's summaries.`
      : `Selected from your ${footprint.toLocaleString()} page visits over the past seven days — ${arts} deep reads and ${socials} social echoes, with editor's summaries.`,
  figFootprint: (n) => `Page visits <b>${n.toLocaleString()}</b>`,
  figMobile: (pct) => `On mobile <b>${pct}%</b>`,
  figPages: (n) => `Content pages <b>${n}</b>`,
  figMinutes: (n) => `Content minutes <b>${n}</b>`,
  colophonAuto: "auto-edited from your browsing record",
  colophonAudience: "YOUR DATA NEVER LEFT THIS MACHINE · PUBLISHED FOR AN AUDIENCE OF ONE",
  date: (sec) => {
    const d = new Date(sec * 1000);
    return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
  },
  archiveTagline: "Archive · Your Personal Weekly Digest",
  counts: (arts, socials) => `${arts} deep reads · ${socials} social echoes`,
  statusSent: (dateStr) => `Sent ${dateStr}`,
  statusEditing: "In progress",
  coverAlt: (n) => `Issue ${n} cover`,
  archiveFooter: "YOUR DATA NEVER LEFT THIS MACHINE · PUBLISHED FOR AN AUDIENCE OF ONE",
  emailArchiveButton: "Open your archive in the browser →",
  emailArchiveCaption: "Opens on this Mac while Browstack is running",
  emailSubject: (n, title) => `Browstack №${n}${title ? " — " + title : ""} — your week in reading, in print`,
};

const zhTW: UIStrings = {
  deepReads: "本週深讀",
  socialEchoes: "社群迴響",
  weekInFigures: "一週圖譜",
  statDeepReads: "本週深讀",
  statSocial: "社群迴響",
  statMinutes: "內容分鐘",
  viewOriginal: "查看原文",
  otherTopic: "其他",
  socialSource: "社群",
  device: (d) => (d === "both" ? "桌機＋手機" : d === "mobile" ? "手機" : "桌機"),
  signal: (activeMin, minutes, capped) =>
    activeMin > 0
      ? `⚡ 本週你實讀了 ${activeMin} 分鐘`
      : `本週你停留了 ${minutes}${capped ? "+" : ""} 分鐘`,
  issueNote: (footprint, arts, socials) =>
    footprint == null
      ? `本期選輯自你過去七天的瀏覽足跡——${arts} 篇深讀與 ${socials} 則社群迴響，附編輯摘要。`
      : `本期選輯自你過去七天的 ${footprint.toLocaleString()} 次瀏覽足跡——${arts} 篇深讀與 ${socials} 則社群迴響，附編輯摘要。`,
  figFootprint: (n) => `瀏覽足跡 <b>${n.toLocaleString()}</b> 次`,
  figMobile: (pct) => `手機佔比 <b>${pct}%</b>`,
  figPages: (n) => `內容頁造訪 <b>${n}</b> 頁`,
  figMinutes: (n) => `內容停留 <b>${n}</b> 分鐘`,
  colophonAuto: "由你的瀏覽紀錄自動編輯",
  colophonAudience: "資料未離開這台機器 · PUBLISHED FOR AN AUDIENCE OF ONE",
  date: (sec) => {
    const d = new Date(sec * 1000);
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  },
  archiveTagline: "典藏 · Your Personal Weekly Digest",
  counts: (arts, socials) => `${arts} 篇深讀 · ${socials} 則社群迴響`,
  statusSent: (dateStr) => `已寄出 ${dateStr}`,
  statusEditing: "編輯中",
  coverAlt: (n) => `第 ${n} 期封面插畫`,
  archiveFooter: "資料未離開這台機器 · PUBLISHED FOR AN AUDIENCE OF ONE",
  emailArchiveButton: "在瀏覽器開啟你的典藏 →",
  emailArchiveCaption: "在這台 Mac 上、Browstack 服務運行時開啟",
  emailSubject: (n, title) => `Browstack №${n}${title ? " — " + title : ""}｜你的一週閱讀，成刊了`,
};

const TABLE: Record<string, UIStrings> = { en, "zh-tw": zhTW };

// Resolve UI strings for a BCP-47 code. zh-* → Traditional Chinese; everything else → English.
export function ui(localeCode: string): UIStrings {
  const c = localeCode.trim().toLowerCase();
  if (c === "zh-tw" || c.startsWith("zh")) return zhTW;
  return TABLE[c] ?? en;
}
