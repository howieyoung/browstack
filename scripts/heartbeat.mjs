// Claude CLI credential-freshness heartbeat: a tiny daily call keeps the OAuth refresh cycle active,
// avoiding an idle-week expiry that would break publishing; alerts via Notification Center when it detects "was fine, now broken".
//
// Harmless for non-CLI users: silently skips if claude isn't installed; and if it never once succeeded (meaning the user is on an API key,
// never uses the CLI) it won't alert either — only genuine credential decay bothers you.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const okMarker = path.join(repoRoot, "data", "logs", ".heartbeat-was-ok");
const stamp = new Date().toString();

// Receiver health check: if the resident serve agent is installed but 127.0.0.1:8787 is unreachable → capture data is being lost; alert that day.
// Users without the serve agent aren't checked (avoids daily false alarms for manual-only users).
const servePlist = path.join(home(), "Library", "LaunchAgents", "com.browstack.serve.plist");
if (fs.existsSync(servePlist)) {
  let serverOk = false;
  try {
    // The port is tied to SHARED.serverPort in src/shared/settings.ts (both 8787); if you change the port there, change it here too.
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

// No claude CLI (user is on the Anthropic API) → no credentials to keep fresh, exit silently
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
// Only alert if it once succeeded — never having succeeded means the user doesn't use the CLI provider at all, so don't bother them
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
