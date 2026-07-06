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

// PATH 需含 node/npm 與 claude CLI（launchd 環境極簡）
const PATH = `${nodeDir}:/usr/local/bin:/usr/bin:/bin:${home}/.local/bin`;

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${path.join(repoRoot, "scripts", "weekly.mjs")}</string>
  </array>
  <key>WorkingDirectory</key><string>${repoRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${PATH}</string>
    <key>HOME</key><string>${home}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>${day}</integer>
    <key>Hour</key><integer>${hour}</integer>
    <key>Minute</key><integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key><string>${path.join(logDir, "weekly.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, "weekly.log")}</string>
</dict>
</plist>
`;

const plistPath = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
fs.mkdirSync(path.dirname(plistPath), { recursive: true });
fs.writeFileSync(plistPath, plist);

const uid = process.getuid();
spawnSync("launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "ignore" }); // 先卸舊版，失敗無妨
const boot = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath], { encoding: "utf8" });
if (boot.status !== 0) {
  console.error(`launchctl bootstrap 失敗：${boot.stderr || boot.stdout}`);
  process.exit(1);
}

const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
console.log(`已排程 / Scheduled: 每週${dayNames[day]} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} 自動出刊`);
console.log(`plist: ${plistPath}`);
console.log(`日誌 / logs: ${path.join(logDir, "weekly.log")}`);
console.log(`解除排程 / uninstall: launchctl bootout gui/$UID/${label} && rm '${plistPath}'`);
