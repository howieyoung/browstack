// Claude CLI 憑證保鮮心跳：每天以一個極小的呼叫讓 OAuth refresh 週期保持活躍，
// 避免閒置一週後過期害出刊失敗；偵測到「曾經正常、現在失效」時用通知中心告警。
//
// 對非 CLI 用戶無害：沒安裝 claude 就靜默跳過；從未成功過（代表用戶走 API key、
// 從不使用 CLI）也不告警——只有真正的憑證衰變才會吵你。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const okMarker = path.join(repoRoot, "data", "logs", ".heartbeat-was-ok");
const stamp = new Date().toString();

// 接收服務健康檢查：裝了常駐 serve agent 卻連不上 127.0.0.1:8787 → 擷取資料正在流失,當天告警。
// 沒裝 serve agent 的用戶不檢查（避免對只手動使用的人天天誤報）。
const servePlist = path.join(home(), "Library", "LaunchAgents", "com.browstack.serve.plist");
if (fs.existsSync(servePlist)) {
  let serverOk = false;
  try {
    // 埠號與 src/shared/settings.ts 的 SHARED.serverPort 綁定（皆為 8787）;若那裡改埠,這裡要一起改。
    const res = await fetch("http://127.0.0.1:8787/health", { signal: AbortSignal.timeout(2000) });
    serverOk = res.ok;
  } catch {
    serverOk = false;
  }
  if (!serverOk) {
    console.error(`[heartbeat] ${stamp} — 接收服務 127.0.0.1:8787 無回應`);
    try {
      spawnSync("osascript", [
        "-e",
        'display notification "接收服務未運行——擷取資料可能流失。請重跑 npm run schedule:weekly,或檢查 data/logs/serve.log" with title "Browstack" sound name "Basso"',
      ]);
    } catch {
      /* ignore */
    }
  }
}

function home() {
  return process.env.HOME || "";
}

// 沒有 claude CLI（用戶走 Anthropic API）→ 無憑證可保鮮，靜默結束
const which = spawnSync("which", ["claude"], { encoding: "utf8" });
if (which.status !== 0) {
  console.log(`[heartbeat] ${stamp} — 未安裝 claude CLI，略過`);
  process.exit(0);
}

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
if (!failed) {
  fs.mkdirSync(path.dirname(okMarker), { recursive: true });
  fs.writeFileSync(okMarker, stamp);
  console.log(`[heartbeat] ${stamp} — ok`);
  process.exit(0);
}

console.error(
  `[heartbeat] ${stamp} — Claude CLI 憑證異常：${(result.stderr || result.stdout || "").slice(0, 160)}`,
);
// 只有「曾經成功過」才告警——從未成功代表用戶根本不用 CLI provider，不該吵他
if (fs.existsSync(okMarker)) {
  try {
    spawnSync("osascript", [
      "-e",
      'display notification "Claude CLI 憑證已失效——請在終端機執行 claude /login，否則週六無法自動出刊" with title "Browstack" sound name "Basso"',
    ]);
  } catch {
    /* ignore */
  }
}
process.exit(1);
