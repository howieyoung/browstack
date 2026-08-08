import { type UIStrings, ui } from "../i18n.js";
import { esc, safeHref } from "../shared/html.js";
import type { IssueItem } from "./select.js";

/**
 * Single source of truth for rendering one issue's web view — shared by preview
 * (current issue, live data) and archive (past issues, rebuilt from the DB),
 * so both look exactly alike (the whole point of this module: the two views never diverge).
 * How the cover is embedded is decided by the caller (preview uses a data-URI / inline SVG;
 * archive uses same-origin /covers/N), passed in via the coverHtml param.
 */

export interface IssueStats {
  footprintVisits: number;
  mobileVisits: number;
  totalVisits: number;
  readingPages: number;
  readingMinutes: number;
}

// The summary is JSON written by enrich; still guard with try/catch — a single
// corrupt/legacy-format summary row shouldn't 500/400 the whole archive page; just degrade to an empty card.
function parseSummary<T>(s: string | null): T {
  try {
    return JSON.parse(s ?? "{}") as T;
  } catch {
    return {} as T;
  }
}

const cleanTitle = (s: string) => esc(s.replace(/^\(\d+\)\s*/, "").replace(/\s*[|｜].*$/, "").trim());
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
// Brand names stay verbatim; the generic fallback is localized.
const sourceOf = (url: string, t: UIStrings) =>
  /threads\./.test(url) ? "Threads" : /facebook\./.test(url) ? "Facebook" : /linkedin\./.test(url) ? "LinkedIn" : t.socialSource;

// 01 · Deep reads: grouped by topic, cards within each group, globally sequential numbering
function renderArticles(articles: IssueItem[], t: UIStrings): string {
  const topicGroups = new Map<string, IssueItem[]>();
  for (const a of articles) {
    const key = a.topic ?? t.otherTopic;
    if (!topicGroups.has(key)) topicGroups.set(key, []);
    topicGroups.get(key)!.push(a);
  }
  let rank = 0;
  return [...topicGroups.entries()]
    .map(([topic, items]) => {
      const cards = items
        .map((a) => {
          rank++;
          const s = parseSummary<{ bullets?: string[]; takeaway?: string }>(a.summary);
          const bullets = (s.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join("");
          return `
      <div class="item">
        <div class="rank">${String(rank).padStart(2, "0")}</div>
        <div class="item-body">
          <a class="item-title" href="${safeHref(a.url)}">${cleanTitle(a.title)}</a>
          <ul class="sum">${bullets}</ul>
          ${s.takeaway ? `<div class="takeaway">◈ ${esc(s.takeaway)}</div>` : ""}
          <div class="item-meta">${hostOf(a.url)} · ${t.signal(a.active_min, a.minutes, !!a.capped)} · ${t.device(a.devices)}</div>
        </div>
      </div>`;
        })
        .join("\n");
      return `<h3 class="topic">${esc(topic)}</h3>\n${cards}`;
    })
    .join("\n");
}

// 02 · Social echoes
function renderSocial(socialPosts: IssueItem[], t: UIStrings): string {
  return socialPosts
    .map((p) => {
      const s = parseSummary<{ context?: string }>(p.summary);
      return `
      <div class="quote">
        ${s.context ? `<div class="quote-context">${esc(s.context)}</div>` : ""}
        <div class="quote-text">${esc(p.title.replace(/^\(\d+\)\s*/, "").trim())}</div>
        <div class="quote-meta"><span class="badge">${sourceOf(p.url, t)}</span> ${t.signal(p.active_min, p.minutes, !!p.capped)} · <a href="${safeHref(p.url)}">${t.viewOriginal}</a></div>
      </div>`;
    })
    .join("\n");
}

const STYLE = `
  :root {
    --paper: #faf6ee; --paper-deep: #f1ebdd; --ink: #211c15; --muted: #8d8474;
    --accent: #b5361c; --rule: #d9d2c2;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: #e6e1d5; font-family: "PingFang TC", "Noto Sans TC", sans-serif; color: var(--ink); }
  .sheet { max-width: 760px; margin: 40px auto; background: var(--paper); box-shadow: 0 2px 40px rgba(60,50,30,.18); }

  .nameplate { padding: 30px 48px 22px; text-align: center; }
  .np-row { display: flex; justify-content: space-between; align-items: baseline;
    font-family: "Noto Serif TC", serif; font-size: 14px; font-weight: 700;
    color: var(--accent); letter-spacing: .12em; }
  .np-title { font-family: "Noto Serif TC", "Songti TC", serif; font-style: italic;
    font-weight: 900; font-size: 60px; line-height: 1.05; color: var(--ink); margin-top: 4px; }
  .np-tagline { margin-top: 10px; font-size: 11px; letter-spacing: .48em;
    color: var(--muted); text-transform: uppercase; }
  .cover-art { line-height: 0; border-top: 3px double var(--rule); border-bottom: 3px double var(--rule); }
  .cover-art svg, .cover-art img { width: 100%; height: auto; display: block; }
  .cover-info { padding: 26px 64px 34px; border-bottom: 3px double var(--rule); }
  .issue-digest { font-family: "Noto Serif TC", "Songti TC", serif; font-style: italic; font-size: 19px;
    line-height: 1.7; color: var(--ink); max-width: 32em; }
  .issue-note { margin-top: 16px; font-size: 14px; line-height: 1.9; max-width: 34em; color: var(--muted); }
  .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 24px;
    border-top: 1px solid var(--rule); padding-top: 18px; gap: 12px; }
  .stat b { display: block; font-family: "Noto Serif TC", serif; font-size: 28px; font-weight: 700; }
  .stat span { font-size: 12px; color: var(--muted); letter-spacing: .15em; }

  section { padding: 44px 64px; }
  section + section { border-top: 1px solid var(--rule); }
  h2 { font-size: 13px; letter-spacing: .4em; color: var(--accent); font-weight: 600; margin-bottom: 6px; }
  .section-note { font-size: 12px; color: var(--muted); margin-bottom: 24px; line-height: 1.8; }
  .topic { font-family: "Noto Serif TC", serif; font-size: 15px; letter-spacing: .25em;
    color: var(--ink); margin: 26px 0 4px; padding-bottom: 6px; border-bottom: 2px solid var(--ink); display: inline-block; }

  .item { display: grid; grid-template-columns: 56px 1fr; gap: 14px; padding: 18px 0; }
  .item + .item { border-top: 1px dotted var(--rule); }
  .rank { font-family: "Noto Serif TC", serif; font-size: 26px; font-weight: 700; color: var(--accent); opacity: .85; }
  .item-title { font-family: "Noto Serif TC", "Songti TC", serif; font-size: 20px; font-weight: 700;
    color: var(--ink); text-decoration: none; line-height: 1.55; display: block; }
  .item-title:hover { color: var(--accent); }
  .sum { margin: 12px 0 0; padding-left: 18px; }
  .sum li { font-size: 14px; line-height: 1.9; margin-bottom: 4px; }
  .takeaway { margin-top: 10px; font-family: "Noto Serif TC", serif; font-size: 14px;
    color: var(--accent); line-height: 1.7; }
  .item-meta { margin-top: 10px; font-size: 12px; color: var(--muted); }

  .quote { background: var(--paper-deep); border-left: 3px solid var(--accent);
    padding: 18px 24px 16px 22px; margin: 0 0 18px; }
  .quote-context { font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 10px; line-height: 1.7; }
  .quote-text { font-family: "Noto Serif TC", "Songti TC", serif; font-size: 15px; line-height: 2;
    display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .quote-meta { margin-top: 12px; font-size: 12px; color: var(--muted); }
  .quote-meta a { color: var(--accent); }
  .badge { border: 1px solid var(--rule); padding: 1px 8px; border-radius: 10px; margin-right: 6px; }

  .figures { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; font-size: 14px; line-height: 2.1; }
  .figures b { font-family: "Noto Serif TC", serif; }

  .colophon { text-align: center; padding: 36px 64px 44px; border-top: 3px double var(--rule);
    font-size: 11px; letter-spacing: .3em; color: var(--muted); line-height: 2.4; }`;

// Full single-issue web page. coverHtml is provided by the caller (preview: data-URI / SVG; archive: /covers/N).
export function renderIssueDocument(params: {
  issue: { number: number; title: string; week_start: number; week_end: number };
  articles: IssueItem[];
  socialPosts: IssueItem[];
  stats: IssueStats;
  coverHtml: string;
  digest?: string | null;
  localeCode: string;
}): string {
  const { issue, articles, socialPosts, stats, coverHtml, digest, localeCode } = params;
  const t = ui(localeCode);
  const digestHtml = digest ? `<p class="issue-digest">${esc(digest)}</p>` : "";
  const issueLabel = issue.title ? `№${issue.number} · ${issue.title}` : `№${issue.number}`;
  const mobilePct = stats.totalVisits > 0 ? Math.round((100 * stats.mobileVisits) / stats.totalVisits) : 0;
  return `<!doctype html>
<html lang="${localeCode}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Browstack ${issueLabel}</title>
<style>${STYLE}
</style>
</head>
<body>
<div class="sheet">
  <div class="nameplate">
    <div class="np-row"><span>${issueLabel}</span><span>${t.date(issue.week_start)} — ${t.date(issue.week_end)}</span></div>
    <div class="np-title">Browstack</div>
    <div class="np-tagline">Your Personal Weekly Digest</div>
  </div>
  <div class="cover-art">${coverHtml}</div>
  <div class="cover-info">
    ${digestHtml}
    <p class="issue-note">${t.issueNote(stats.footprintVisits, articles.length, socialPosts.length)}</p>
    <div class="stat-strip">
      <div class="stat"><b>${articles.length}</b><span>${t.statDeepReads}</span></div>
      <div class="stat"><b>${socialPosts.length}</b><span>${t.statSocial}</span></div>
      <div class="stat"><b>${stats.readingMinutes}</b><span>${t.statMinutes}</span></div>
    </div>
  </div>

  <section>
    <h2>01 · ${t.deepReads}</h2>
    ${renderArticles(articles, t)}
  </section>

  <section>
    <h2>02 · ${t.socialEchoes}</h2>
    ${renderSocial(socialPosts, t)}
  </section>

  <section>
    <h2>03 · ${t.weekInFigures}</h2>
    <div class="figures">
      <div>${t.figFootprint(stats.footprintVisits)}</div>
      <div>${t.figMobile(mobilePct)}</div>
      <div>${t.figPages(stats.readingPages)}</div>
      <div>${t.figMinutes(stats.readingMinutes)}</div>
    </div>
  </section>

  <div class="colophon">
    BROWSTACK №${issue.number} · ${t.colophonAuto}<br />
    ${t.colophonAudience}
  </div>
</div>
</body>
</html>`;
}
