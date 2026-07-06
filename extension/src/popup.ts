import { SHARED } from "../../src/shared/settings.js";

function put(id: string, text: string, cls?: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (cls) el.className = cls;
}

async function main(): Promise<void> {
  const { queue, stats } = await chrome.storage.local.get(["queue", "stats"]);
  put("queue", String(Array.isArray(queue) ? queue.length : 0));
  put("sent", String(stats?.totalSent ?? 0));
  try {
    const res = await fetch(`http://127.0.0.1:${SHARED.serverPort}/health`, {
      signal: AbortSignal.timeout(800),
    });
    put("server", res.ok ? "運作中 ✓" : "異常", res.ok ? "ok" : "bad");
  } catch {
    put("server", "未啟動（npm run serve）", "bad");
  }
}

void main();
