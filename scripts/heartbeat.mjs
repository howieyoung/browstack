// Claude CLI 憑證保鮮心跳：每天以一個極小的呼叫讓 OAuth refresh 週期保持活躍，
// 避免閒置一週後過期害週六出刊失敗；一旦偵測到憑證失效，立刻用通知中心告警，
// 讓你在週六之前就有好幾天可以重新 claude /login。
import { spawnSync } from "node:child_process";

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (
    key === "ANTHROPIC_BASE_URL" ||
    key === "CLAUDECODE" ||
    key === "CLAUDE_AGENT_SDK_VERSION" ||
    key === "CLAUDE_EFFORT" ||
    key.startsWith("CLAUDE_CODE_")
  ) {
    delete env[key];
  }
}

const result = spawnSync("claude", ["-p"], {
  input: "回覆 ok",
  env,
  encoding: "utf8",
  timeout: 120_000,
});

const failed = result.status !== 0 || !result.stdout?.trim();
const stamp = new Date().toString();
if (failed) {
  console.error(`[heartbeat] ${stamp} — Claude CLI 憑證異常：${(result.stderr || result.stdout || "").slice(0, 160)}`);
  try {
    spawnSync("osascript", [
      "-e",
      'display notification "Claude CLI 憑證已失效——請在終端機執行 claude /login，否則週六無法自動出刊" with title "Browstack" sound name "Basso"',
    ]);
  } catch {
    /* ignore */
  }
  process.exit(1);
}
console.log(`[heartbeat] ${stamp} — ok`);
