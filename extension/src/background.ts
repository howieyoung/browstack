import { SHARED } from "../../src/shared/settings.js";

/**
 * MV3 service worker：Chrome 閒置 ~30 秒即自動終結，天生不常駐記憶體。
 * 佇列放在磁碟上的 chrome.storage.local（有上限），送達本機服務後即刪除。
 * 唯一通訊對象：127.0.0.1。
 */

const ENDPOINT = `http://127.0.0.1:${SHARED.serverPort}`;
const MAX_QUEUE = 300;

interface Stats {
  totalSent: number;
  lastFlushAt: number | null;
  lastError: string | null;
}

// storage 讀改寫的簡易序列化，避免同 SW 實例內的競態
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

async function getQueue(): Promise<unknown[]> {
  const { queue } = await chrome.storage.local.get("queue");
  return Array.isArray(queue) ? queue : [];
}

async function getStats(): Promise<Stats> {
  const { stats } = await chrome.storage.local.get("stats");
  return stats ?? { totalSent: 0, lastFlushAt: null, lastError: null };
}

chrome.runtime.onMessage.addListener((msg: { event?: string }) => {
  if (msg?.event !== "capture" && msg?.event !== "final") return;
  void serialize(async () => {
    const queue = await getQueue();
    queue.push(msg);
    while (queue.length > MAX_QUEUE) queue.shift(); // 有界佇列：超過即丟最舊
    await chrome.storage.local.set({ queue });
  }).then(() => flush());
});

function flush(): Promise<void> {
  return serialize(async () => {
    const queue = await getQueue();
    if (queue.length === 0) return;
    const stats = await getStats();
    try {
      const res = await fetch(`${ENDPOINT}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: queue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const current = await getQueue();
      await chrome.storage.local.set({ queue: current.slice(queue.length) });
      stats.totalSent += queue.length;
      stats.lastFlushAt = Date.now();
      stats.lastError = null;
    } catch (e) {
      // 本機服務沒開：留在磁碟佇列，等 alarm 重試
      stats.lastError = String(e);
    }
    await chrome.storage.local.set({ stats });
  });
}

chrome.alarms.create("flush", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "flush") void flush();
});
