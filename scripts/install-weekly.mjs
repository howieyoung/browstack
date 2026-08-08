// 安裝 launchd 排程：每週自動出刊（macOS）
// Usage: npm run schedule:weekly [-- --day 6 --hour 8 --minute 17]
//   --day 0-6（0=週日…6=週六，預設 6）
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : fallback;
};
const day = getArg("day", 6);
const hour = getArg("hour", 8);
const minute = getArg("minute", 17);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeBin = process.execPath;
const nodeDir = path.dirname(nodeBin);
const home = os.homedir();
const label = "com.browstack.weekly";
const logDir = path.join(repoRoot, "data", "logs");
fs.mkdirSync(logDir, { recursive: true });

// PATH 需含 node/npm 與 claude CLI（launchd 環境極簡）;含 Apple Silicon 的 /opt/homebrew
const PATH = `${nodeDir}:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:${home}/.local/bin`;

// 前置檢查：better-sqlite3 的原生模組必須能在「即將被釘用的這個 node」下載入。
// 版本不符（例如從 Node 22 shell 執行,但模組是為 Node 20 建置）會讓常駐 server 靜默 crash-loop、
// 落地資料流失。與其之後才發現,不如現在就擋下並給出明確修法。
// 必須實際建構一個 DB——原生 .node 是在 new Database() 時才 dlopen,單純 require 不會觸發、會誤判為通過。
const probe = spawnSync(nodeBin, ["-e", "new (require('better-sqlite3'))(':memory:').close()"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (probe.status !== 0) {
  const hint =
    (probe.stderr || "").split("\n").find((l) => /NODE_MODULE_VERSION|dlopen|better_sqlite3/i.test(l)) ||
    (probe.stderr || "").slice(0, 200);
  console.error("⚠  better-sqlite3 無法在此 node 版本載入,若繼續安裝,常駐接收服務會無法啟動：");
  console.error(`    node: ${nodeBin}`);
  console.error(`    ${hint.trim()}`);
  console.error("    修法：npm rebuild better-sqlite3   （或改用與模組建置版本相符的 node 再重跑本指令）");
  process.exit(1);
}

// 出刊有兩個時段：主跑＋ 12 小時後的當日重試（weekly.mjs 有冪等保護，成功後重試自動跳過）
const retryHour = (hour + 12) % 24;

const agentPlist = (agentLabel, programArgs, scheduleXml, logFile) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${agentLabel}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs.map((a) => `    <string>${a}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${repoRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${PATH}</string>
    <key>HOME</key><string>${home}</string>
  </dict>
  ${scheduleXml}
  <key>StandardOutPath</key><string>${path.join(logDir, logFile)}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, logFile)}</string>
</dict>
</plist>
`;

const weeklyCalendar = `<key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Weekday</key><integer>${day}</integer>
      <key>Hour</key><integer>${hour}</integer>
      <key>Minute</key><integer>${minute}</integer>
    </dict>
    <dict>
      <key>Weekday</key><integer>${day}</integer>
      <key>Hour</key><integer>${retryHour}</integer>
      <key>Minute</key><integer>${minute}</integer>
    </dict>
  </array>`;

// 心跳：每天一個極小的 claude 呼叫保鮮 CLI 憑證，失效時提前用通知中心告警
const heartbeatLabel = "com.browstack.heartbeat";
const heartbeatCalendar = `<key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>37</integer>
  </dict>`;

// 閱讀訊號接收服務：extension 的落地端，常駐（登入即啟、當掉自動重啟）
// 只綁 127.0.0.1，記憶體佔用極小；不常駐的話 extension 的磁碟佇列（上限 300 筆）滿了會丟資料
const serveLabel = "com.browstack.serve";
const serveSchedule = `<key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>`;

const uid = process.getuid();
const laDir = path.join(home, "Library", "LaunchAgents");
fs.mkdirSync(laDir, { recursive: true });

function installAgent(agentLabel, xml) {
  const plistPath = path.join(laDir, `${agentLabel}.plist`);
  fs.writeFileSync(plistPath, xml);
  spawnSync("launchctl", ["bootout", `gui/${uid}/${agentLabel}`], { stdio: "ignore" }); // 先卸舊版，失敗無妨
  const boot = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath], { encoding: "utf8" });
  if (boot.status !== 0) {
    console.error(`launchctl bootstrap ${agentLabel} 失敗：${boot.stderr || boot.stdout}`);
    process.exit(1);
  }
  return plistPath;
}

const nodeScript = (file) => [nodeBin, path.join(repoRoot, "scripts", file)];
const weeklyPlistPath = installAgent(label, agentPlist(label, nodeScript("weekly.mjs"), weeklyCalendar, "weekly.log"));
installAgent(heartbeatLabel, agentPlist(heartbeatLabel, nodeScript("heartbeat.mjs"), heartbeatCalendar, "heartbeat.log"));
installAgent(
  serveLabel,
  agentPlist(
    serveLabel,
    [nodeBin, path.join(repoRoot, "node_modules", ".bin", "tsx"), path.join(repoRoot, "src", "server.ts")],
    serveSchedule,
    "serve.log",
  ),
);

const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
const hh = (h) => String(h).padStart(2, "0");
console.log(`已排程 / Scheduled: 每週${dayNames[day]} ${hh(hour)}:${hh(minute)} 自動出刊（${hh(retryHour)}:${hh(minute)} 當日重試，成功則自動跳過）`);
console.log(`憑證心跳 / heartbeat: 每天 09:37 保鮮 Claude CLI 憑證，失效即通知（未安裝 CLI 則自動略過）`);
console.log(`接收服務 / receiver: 常駐 127.0.0.1:8787（登入即啟、當掉自動重啟）`);
console.log(`plist: ${weeklyPlistPath}`);
console.log(`日誌 / logs: ${logDir}/{weekly,heartbeat,serve}.log`);
console.log(`解除全部 / uninstall: for a in weekly heartbeat serve; do launchctl bootout gui/$UID/com.browstack.$a; rm ~/Library/LaunchAgents/com.browstack.$a.plist; done`);
