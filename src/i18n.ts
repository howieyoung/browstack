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
  // issue №0's special title
  inauguralTitle: string;
  // email
  emailArchiveButton: string;
  emailArchiveCaption: string;
  emailSubject: (n: number, title: string, digest: string | null) => string;
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
  inauguralTitle: "Inaugural Preview",
  emailArchiveButton: "Open your archive in the browser →",
  emailArchiveCaption: "Opens on this Mac while Browstack is running",
  emailSubject: (n, title, digest) =>
    digest
      ? `Browstack №${n} — ${digest}`
      : `Browstack №${n}${title ? " — " + title : ""} — your week in reading, in print`,
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
  inauguralTitle: "創刊預覽號",
  emailArchiveButton: "在瀏覽器開啟你的典藏 →",
  emailArchiveCaption: "在這台 Mac 上、Browstack 服務運行時開啟",
  emailSubject: (n, title, digest) =>
    digest
      ? `Browstack №${n}｜${digest}`
      : `Browstack №${n}${title ? " — " + title : ""}｜你的一週閱讀，成刊了`,
};

const ja: UIStrings = {
  deepReads: "今週のじっくり読み",
  socialEchoes: "ソーシャルの残響",
  weekInFigures: "数字で見る一週間",
  statDeepReads: "じっくり読み",
  statSocial: "ソーシャルの残響",
  statMinutes: "コンテンツ時間（分）",
  viewOriginal: "元記事を見る",
  otherTopic: "その他",
  socialSource: "ソーシャル",
  device: (d) => (d === "both" ? "デスクトップ + モバイル" : d === "mobile" ? "モバイル" : "デスクトップ"),
  signal: (activeMin, minutes, capped) =>
    activeMin > 0
      ? `⚡ 今週はこれを${activeMin}分じっくり読みました`
      : `今週はこれに${minutes}${capped ? "+" : ""}分を費やしました`,
  issueNote: (footprint, arts, socials) =>
    footprint == null
      ? `過去7日間の閲覧から厳選 — じっくり読み${arts}本とソーシャルの残響${socials}件、編集部の要約付き。`
      : `過去7日間の${footprint.toLocaleString()}回のページ閲覧から厳選 — じっくり読み${arts}本とソーシャルの残響${socials}件、編集部の要約付き。`,
  figFootprint: (n) => `ページ閲覧数 <b>${n.toLocaleString()}</b>`,
  figMobile: (pct) => `モバイル比率 <b>${pct}%</b>`,
  figPages: (n) => `コンテンツページ <b>${n}</b>`,
  figMinutes: (n) => `コンテンツ時間（分） <b>${n}</b>`,
  colophonAuto: "あなたの閲覧記録から自動編集",
  colophonAudience: "あなたのデータはこの端末から一切外に出ていません · PUBLISHED FOR AN AUDIENCE OF ONE",
  date: (sec) => new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(new Date(sec * 1000)),
  archiveTagline: "アーカイブ · あなたのパーソナル週刊ダイジェスト",
  counts: (arts, socials) => `じっくり読み${arts}本 · ソーシャルの残響${socials}件`,
  statusSent: (dateStr) => `${dateStr}に配信`,
  statusEditing: "編集中",
  coverAlt: (n) => `第${n}号の表紙`,
  archiveFooter: "あなたのデータはこの端末から一切外に出ていません · PUBLISHED FOR AN AUDIENCE OF ONE",
  inauguralTitle: "創刊プレビュー",
  emailArchiveButton: "ブラウザでアーカイブを開く →",
  emailArchiveCaption: "Browstackの起動中に、このMacで開きます",
  emailSubject: (n, title, digest) =>
    digest
      ? `Browstack №${n} — ${digest}`
      : `Browstack №${n}${title ? " — " + title : ""} — 今週の読書を、誌面で`,
};

const ko: UIStrings = {
  deepReads: "이번 주 깊이 읽은 글",
  socialEchoes: "소셜의 울림",
  weekInFigures: "숫자로 보는 한 주",
  statDeepReads: "깊이 읽은 글",
  statSocial: "소셜의 울림",
  statMinutes: "콘텐츠 시간(분)",
  viewOriginal: "원문 보기",
  otherTopic: "기타",
  socialSource: "소셜",
  device: (d) => (d === "both" ? "데스크톱 + 모바일" : d === "mobile" ? "모바일" : "데스크톱"),
  signal: (activeMin, minutes, capped) =>
    activeMin > 0
      ? `⚡ 이번 주에 이 글을 ${activeMin}분 동안 집중해서 읽었습니다`
      : `이번 주에 이 글에 ${minutes}${capped ? "+" : ""}분을 보냈습니다`,
  issueNote: (footprint, arts, socials) =>
    footprint == null
      ? `지난 7일간의 브라우징에서 골라낸 글 — 깊이 읽은 글 ${arts}편과 소셜의 울림 ${socials}건, 편집자 요약과 함께.`
      : `지난 7일간 방문한 ${footprint.toLocaleString()}개 페이지에서 골라낸 글 — 깊이 읽은 글 ${arts}편과 소셜의 울림 ${socials}건, 편집자 요약과 함께.`,
  figFootprint: (n) => `방문한 페이지 <b>${n.toLocaleString()}</b>`,
  figMobile: (pct) => `모바일 비중 <b>${pct}%</b>`,
  figPages: (n) => `콘텐츠 페이지 <b>${n}</b>`,
  figMinutes: (n) => `콘텐츠 시간(분) <b>${n}</b>`,
  colophonAuto: "브라우징 기록에서 자동 편집됨",
  colophonAudience: "당신의 데이터는 이 기기를 떠나지 않았습니다 · 단 한 명의 독자를 위해 발행됨",
  date: (sec) => new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(sec * 1000)),
  archiveTagline: "아카이브 · 나만의 주간 다이제스트",
  counts: (arts, socials) => `깊이 읽은 글 ${arts}편 · 소셜의 울림 ${socials}건`,
  statusSent: (dateStr) => `${dateStr} 발송됨`,
  statusEditing: "편집 중",
  coverAlt: (n) => `제${n}호 표지`,
  archiveFooter: "당신의 데이터는 이 기기를 떠나지 않았습니다 · 단 한 명의 독자를 위해 발행됨",
  inauguralTitle: "창간 미리보기",
  emailArchiveButton: "브라우저에서 아카이브 열기 →",
  emailArchiveCaption: "Browstack이 실행 중일 때 이 Mac에서 열립니다",
  emailSubject: (n, title, digest) =>
    digest
      ? `Browstack №${n} — ${digest}`
      : `Browstack №${n}${title ? " — " + title : ""} — 활자로 담은 이번 주 나의 읽기`,
};

const es: UIStrings = {
  deepReads: "Lecturas de fondo de la semana",
  socialEchoes: "Ecos sociales",
  weekInFigures: "La semana en cifras",
  statDeepReads: "lecturas de fondo",
  statSocial: "ecos sociales",
  statMinutes: "minutos de contenido",
  viewOriginal: "Ver original",
  otherTopic: "Otros",
  socialSource: "Social",
  device: (d) => (d === "both" ? "escritorio + móvil" : d === "mobile" ? "móvil" : "escritorio"),
  signal: (activeMin, minutes, capped) =>
    activeMin > 0
      ? `⚡ Lo leíste con atención durante ${activeMin} min esta semana`
      : `Le dedicaste ${minutes}${capped ? "+" : ""} min esta semana`,
  issueNote: (footprint, arts, socials) =>
    footprint == null
      ? `Seleccionado de tu navegación de los últimos siete días: ${arts} lecturas de fondo y ${socials} ecos sociales, con resúmenes de la redacción.`
      : `Seleccionado de tus ${footprint.toLocaleString()} páginas visitadas en los últimos siete días: ${arts} lecturas de fondo y ${socials} ecos sociales, con resúmenes de la redacción.`,
  figFootprint: (n) => `Páginas visitadas <b>${n.toLocaleString()}</b>`,
  figMobile: (pct) => `En el móvil <b>${pct}%</b>`,
  figPages: (n) => `Páginas de contenido <b>${n}</b>`,
  figMinutes: (n) => `Minutos de contenido <b>${n}</b>`,
  colophonAuto: "editado automáticamente a partir de tu registro de navegación",
  colophonAudience: "TUS DATOS NUNCA SALIERON DE ESTE EQUIPO · PUBLICADO PARA UN PÚBLICO DE UNO",
  date: (sec) => new Intl.DateTimeFormat("es-ES", { month: "short", day: "numeric" }).format(new Date(sec * 1000)),
  archiveTagline: "Archivo · Tu boletín semanal personal",
  counts: (arts, socials) => `${arts} lecturas de fondo · ${socials} ecos sociales`,
  statusSent: (dateStr) => `Enviado ${dateStr}`,
  statusEditing: "En curso",
  coverAlt: (n) => `Portada del número ${n}`,
  archiveFooter: "TUS DATOS NUNCA SALIERON DE ESTE EQUIPO · PUBLICADO PARA UN PÚBLICO DE UNO",
  inauguralTitle: "Avance inaugural",
  emailArchiveButton: "Abre tu archivo en el navegador →",
  emailArchiveCaption: "Se abre en este Mac mientras Browstack está en ejecución",
  emailSubject: (n, title, digest) =>
    digest
      ? `Browstack №${n} — ${digest}`
      : `Browstack №${n}${title ? " — " + title : ""} — tu semana de lecturas, impresa`,
};

const fr: UIStrings = {
  deepReads: "Les lectures de fond de la semaine",
  socialEchoes: "Échos sociaux",
  weekInFigures: "La semaine en chiffres",
  statDeepReads: "lectures de fond",
  statSocial: "échos sociaux",
  statMinutes: "minutes de lecture",
  viewOriginal: "Voir l'original",
  otherTopic: "Autre",
  socialSource: "Social",
  device: (d) => (d === "both" ? "ordinateur + mobile" : d === "mobile" ? "mobile" : "ordinateur"),
  signal: (activeMin, minutes, capped) =>
    activeMin > 0
      ? `⚡ Vous l'avez lu activement pendant ${activeMin} min cette semaine`
      : `Vous y avez consacré ${minutes}${capped ? "+" : ""} min cette semaine`,
  issueNote: (footprint, arts, socials) =>
    footprint == null
      ? `Sélection issue de votre navigation des sept derniers jours — ${arts} lectures de fond et ${socials} échos sociaux, avec les résumés de la rédaction.`
      : `Sélection issue de vos ${footprint.toLocaleString()} pages consultées ces sept derniers jours — ${arts} lectures de fond et ${socials} échos sociaux, avec les résumés de la rédaction.`,
  figFootprint: (n) => `Pages consultées <b>${n.toLocaleString()}</b>`,
  figMobile: (pct) => `Sur mobile <b>${pct}%</b>`,
  figPages: (n) => `Pages de contenu <b>${n}</b>`,
  figMinutes: (n) => `Minutes de lecture <b>${n}</b>`,
  colophonAuto: "édité automatiquement à partir de votre historique de navigation",
  colophonAudience: "VOS DONNÉES N'ONT JAMAIS QUITTÉ CETTE MACHINE · UN JOURNAL POUR UN LECTEUR UNIQUE",
  date: (sec) => new Intl.DateTimeFormat("fr-FR", { month: "short", day: "numeric" }).format(new Date(sec * 1000)),
  archiveTagline: "Archives · Votre hebdomadaire personnel",
  counts: (arts, socials) => `${arts} lectures de fond · ${socials} échos sociaux`,
  statusSent: (dateStr) => `Envoyé le ${dateStr}`,
  statusEditing: "En cours",
  coverAlt: (n) => `Couverture du numéro ${n}`,
  archiveFooter: "VOS DONNÉES N'ONT JAMAIS QUITTÉ CETTE MACHINE · UN JOURNAL POUR UN LECTEUR UNIQUE",
  inauguralTitle: "Numéro inaugural",
  emailArchiveButton: "Ouvrir vos archives dans le navigateur →",
  emailArchiveCaption: "S'ouvre sur ce Mac tant que Browstack est actif",
  emailSubject: (n, title, digest) =>
    digest
      ? `Browstack №${n} — ${digest}`
      : `Browstack №${n}${title ? " — " + title : ""} — votre semaine de lecture, en version imprimée`,
};

const TABLE: Record<string, UIStrings> = { en, "zh-tw": zhTW, ja, ko, es, fr };

// Resolve UI strings for a BCP-47 code. zh-* → Traditional Chinese; everything else → English.
export function ui(localeCode: string): UIStrings {
  const c = localeCode.trim().toLowerCase();
  if (c === "zh-tw" || c.startsWith("zh")) return zhTW;
  return TABLE[c] ?? en;
}
