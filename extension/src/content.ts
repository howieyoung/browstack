import { Readability, isProbablyReaderable } from "@mozilla/readability";
import { classifyUrl, type PageKind } from "../../src/classify/filter.js";
import { SHARED } from "../../src/shared/settings.js";

/**
 * Active-reading tracker. Memory design principles:
 * - Only one set of counters per tab; the timer fully stops when the tab is hidden.
 * - Body extraction runs once at the moment the threshold is crossed, sent and discarded, never retained on the page.
 * - Sensitive and noise pages are not tracked from the outset.
 */

const cfg = SHARED.capture;

interface Tracker {
  url: string;
  kind: PageKind;
  captureId: string;
  activeSeconds: number;
  lastActivity: number;
  maxScrollPct: number;
  captured: boolean;
  timer: number | null;
}

let tracker: Tracker | null = null;
let currentUrl = location.href;

function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function send(msg: unknown): void {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    // After the extension reloads, the old content script loses its connection; ignore silently.
  }
}

function startTracking(): void {
  stopTimer();
  const { kind, sensitive } = classifyUrl(location.href);
  if (sensitive || kind === "noise") {
    tracker = null;
    return;
  }
  tracker = {
    url: location.href,
    kind,
    captureId: newId(),
    activeSeconds: 0,
    lastActivity: Date.now(),
    maxScrollPct: 0,
    captured: false,
    timer: null,
  };
  syncTimer();
}

function stopTimer(): void {
  if (tracker?.timer != null) {
    clearInterval(tracker.timer);
    tracker.timer = null;
  }
}

// Run the 1-second-interval timer only while the tab is visible.
function syncTimer(): void {
  if (!tracker) return;
  const visible = document.visibilityState === "visible";
  if (visible && tracker.timer == null) {
    tracker.timer = window.setInterval(tick, 1000);
  } else if (!visible) {
    stopTimer();
  }
}

function tick(): void {
  if (!tracker) return;
  if (Date.now() - tracker.lastActivity > cfg.idleWindowMs) return;
  tracker.activeSeconds += 1;
  const doc = document.documentElement;
  if (doc.scrollHeight > 0) {
    const pct = Math.min(1, (window.scrollY + window.innerHeight) / doc.scrollHeight);
    if (pct > tracker.maxScrollPct) tracker.maxScrollPct = pct;
  }
  if (!tracker.captured && tracker.activeSeconds >= cfg.activeSecondsThreshold) {
    capture();
  }
}

function extract(kind: PageKind): { title: string | null; excerpt: string | null; text: string | null } {
  try {
    if ((kind === "article" || kind === "unknown") && isProbablyReaderable(document)) {
      const clone = document.cloneNode(true) as Document;
      const parsed = new Readability(clone).parse();
      if (parsed?.textContent) {
        return {
          title: parsed.title || document.title || null,
          excerpt: parsed.excerpt || null,
          text: parsed.textContent.slice(0, cfg.maxTextLength),
        };
      }
    }
  } catch {
    // Fall back when Readability fails.
  }
  // Social posts / atypical pages: og meta plus main-block text (capped).
  const meta = (name: string) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") ?? null;
  const main = document.querySelector("article, main, [role='main']");
  const text = main instanceof HTMLElement ? main.innerText.slice(0, cfg.maxFallbackTextLength) : null;
  return {
    title: document.title || null,
    excerpt: meta("og:description") ?? meta("description"),
    text,
  };
}

function capture(): void {
  if (!tracker) return;
  tracker.captured = true;
  const content = extract(tracker.kind);
  send({
    event: "capture",
    captureId: tracker.captureId,
    url: tracker.url,
    title: content.title,
    lang: document.documentElement.lang || null,
    capturedAt: Math.floor(Date.now() / 1000),
    activeSeconds: tracker.activeSeconds,
    maxScrollPct: tracker.maxScrollPct,
    excerpt: content.excerpt,
    contentText: content.text,
  });
}

// On leaving/switching away, report the final read amount (only for already-captured pages).
function sendFinal(): void {
  if (!tracker?.captured) return;
  send({
    event: "final",
    captureId: tracker.captureId,
    activeSeconds: tracker.activeSeconds,
    maxScrollPct: tracker.maxScrollPct,
  });
}

for (const evt of ["scroll", "mousemove", "keydown", "touchstart", "click"] as const) {
  addEventListener(evt, () => {
    if (tracker) tracker.lastActivity = Date.now();
  }, { passive: true });
}

document.addEventListener("visibilitychange", () => {
  syncTimer();
  if (document.visibilityState === "hidden") sendFinal();
});
addEventListener("pagehide", sendFinal);

// SPA navigation (Threads/FB/news sites are all SPAs): when the URL changes, finalize the previous page and track the new one.
setInterval(() => {
  if (location.href !== currentUrl) {
    sendFinal();
    currentUrl = location.href;
    startTracking();
  }
}, 1500);

startTracking();
