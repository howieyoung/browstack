import { SHARED } from "../../src/shared/settings.js";

// The popup is a browser surface with no access to the Node-side content-language config,
// so it localizes off the browser UI language: zh* → Traditional Chinese, otherwise English.
const zh = (navigator.language || "").toLowerCase().startsWith("zh");
const L = zh
  ? {
      server: "本機服務",
      queue: "待送佇列",
      sent: "累計擷取",
      checking: "檢查中…",
      running: "運作中 ✓",
      error: "異常",
      down: "未啟動（npm run serve）",
      privacy: "資料只送往你電腦上的 127.0.0.1，永不進雲端。",
    }
  : {
      server: "Local service",
      queue: "Pending queue",
      sent: "Captured total",
      checking: "Checking…",
      running: "Running ✓",
      error: "Error",
      down: "Not running (npm run serve)",
      privacy: "Data goes only to 127.0.0.1 on your computer — never to the cloud.",
    };

function put(id: string, text: string, cls?: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (cls) el.className = cls;
}

async function main(): Promise<void> {
  document.documentElement.lang = zh ? "zh-Hant" : "en";
  put("label-server", L.server);
  put("label-queue", L.queue);
  put("label-sent", L.sent);
  put("privacy", L.privacy);
  put("server", L.checking);

  const { queue, stats } = await chrome.storage.local.get(["queue", "stats"]);
  put("queue", String(Array.isArray(queue) ? queue.length : 0));
  put("sent", String(stats?.totalSent ?? 0));
  try {
    const res = await fetch(`http://127.0.0.1:${SHARED.serverPort}/health`, {
      signal: AbortSignal.timeout(800),
    });
    put("server", res.ok ? L.running : L.error, res.ok ? "ok" : "bad");
  } catch {
    put("server", L.down, "bad");
  }
}

void main();
