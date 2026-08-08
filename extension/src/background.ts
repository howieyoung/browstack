import { SHARED } from "../../src/shared/settings.js";

/**
 * MV3 service worker: Chrome auto-terminates it after ~30s idle, so it never
 * stays resident in memory by nature. The queue lives in on-disk
 * chrome.storage.local (bounded), and is deleted once delivered to the local
 * service. Only communication target: 127.0.0.1.
 */

const ENDPOINT = `http://127.0.0.1:${SHARED.serverPort}`;
const MAX_QUEUE = 300;

interface Stats {
  totalSent: number;
  lastFlushAt: number | null;
  lastError: string | null;
}

// Simple serialization of storage read-modify-write to avoid races within the same SW instance.
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
    while (queue.length > MAX_QUEUE) queue.shift(); // Bounded queue: drop the oldest when exceeded.
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
      // Local service not running: leave it in the on-disk queue and retry on the next alarm.
      stats.lastError = String(e);
    }
    await chrome.storage.local.set({ stats });
  });
}

chrome.alarms.create("flush", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "flush") void flush();
});
