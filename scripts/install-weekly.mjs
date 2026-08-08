// Install the launchd schedule: automatic weekly publishing (macOS)
// Usage: npm run schedule:weekly [-- --day 6 --hour 8 --minute 17]
//   --day 0-6 (0=Sunday…6=Saturday, default 6)
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

// PATH must include node/npm and the claude CLI (launchd's environment is minimal); includes Apple Silicon's /opt/homebrew
const PATH = `${nodeDir}:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:${home}/.local/bin`;

// Compile to dist/ and align better-sqlite3's native ABI to THIS node, so the LaunchAgents run
// compiled JS under a runtime-resolved node (no tsx boot cost, no baked node path) with a matching binary.
const buildEnv = { ...process.env, PATH: `${nodeDir}:${process.env.PATH ?? ""}` };
for (const step of [["run", "build"], ["rebuild", "better-sqlite3"]]) {
  const r = spawnSync("npm", step, { cwd: repoRoot, stdio: "inherit", env: buildEnv });
  if (r.status !== 0) {
    console.error(`npm ${step.join(" ")} failed; aborting install.`);
    process.exit(1);
  }
}

// Preflight check: better-sqlite3's native module must load under the exact node we're about to pin.
// A version mismatch (e.g. run from a Node 22 shell but the module was built for Node 20) makes the resident server
// silently crash-loop and lose landed data. Better to block it now with a clear fix than discover it later.
// Must actually construct a DB — the native .node is only dlopen'd at new Database(); a bare require won't trigger it and would falsely pass.
const probe = spawnSync(nodeBin, ["-e", "new (require('better-sqlite3'))(':memory:').close()"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (probe.status !== 0) {
  const hint =
    (probe.stderr || "").split("\n").find((l) => /NODE_MODULE_VERSION|dlopen|better_sqlite3/i.test(l)) ||
    (probe.stderr || "").slice(0, 200);
  console.error("⚠  better-sqlite3 cannot load under this node version; if you continue, the resident receiver service won't start:");
  console.error(`    node: ${nodeBin}`);
  console.error(`    ${hint.trim()}`);
  console.error("    Fix: npm rebuild better-sqlite3   (or switch to a node matching the module's build version and rerun this command)");
  process.exit(1);
}

// Second preflight: the compiled pipeline must be able to load jsdom under the target node.
// jsdom's dep tree does require() of an ES module; native node only allows that once require(ESM) is
// unflagged (Node 20.19 / 22.0). On older 20.x or the interim 21.x, weekly.mjs opts in with a flag —
// mirror that gating here so a broken node fails loudly at install, not silently every Saturday.
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const needsRequireModuleFlag = (nodeMajor === 20 && nodeMinor < 19) || nodeMajor === 21;
const requireModuleFlag = needsRequireModuleFlag ? ["--experimental-require-module"] : [];
const jsdomEntry = path.join(repoRoot, "dist", "fetch", "extract.js");
const jsdomProbe = spawnSync(
  nodeBin,
  [...requireModuleFlag, "-e", `import(${JSON.stringify(jsdomEntry)}).then(() => process.exit(0)).catch((e) => { console.error(e.code || e.message); process.exit(1); })`],
  { cwd: repoRoot, encoding: "utf8" },
);
if (jsdomProbe.status !== 0) {
  const hint = (jsdomProbe.stderr || "").split("\n").filter(Boolean).slice(-1)[0] || "";
  console.error("⚠  the compiled pipeline cannot load jsdom under this node; if you continue, the weekly run would fail:");
  console.error(`    node: ${nodeBin} (${process.versions.node})`);
  console.error(`    ${hint.trim()}`);
  console.error("    Fix: use Node 20.19+ or 22+ (require(ESM) is stable there), then rerun this command.");
  process.exit(1);
}

// Publishing has two slots: the main run + a same-day retry 12 hours later (weekly.mjs is idempotent, so the retry auto-skips after success)
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

// Heartbeat: a tiny daily claude call keeps the CLI credentials fresh, alerting via Notification Center before they expire
const heartbeatLabel = "com.browstack.heartbeat";
const heartbeatCalendar = `<key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>37</integer>
  </dict>`;

// Reading-signal receiver service: the extension's landing endpoint, resident (starts at login, auto-restarts on crash)
// Binds 127.0.0.1 only, tiny memory footprint; without a resident service the extension's disk queue (max 300 entries) fills up and drops data
const serveLabel = "com.browstack.serve";
const serveSchedule = `<key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>`;

const uid = process.getuid();
const laDir = path.join(home, "Library", "LaunchAgents");
fs.mkdirSync(laDir, { recursive: true });

function installAgent(agentLabel, xml) {
  const plistPath = path.join(laDir, `${agentLabel}.plist`);
  fs.writeFileSync(plistPath, xml);
  spawnSync("launchctl", ["bootout", `gui/${uid}/${agentLabel}`], { stdio: "ignore" }); // bootout the old version first; failure is fine
  const boot = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath], { encoding: "utf8" });
  if (boot.status !== 0) {
    console.error(`launchctl bootstrap ${agentLabel} failed: ${boot.stderr || boot.stdout}`);
    process.exit(1);
  }
  return plistPath;
}

// Agents run through a wrapper that resolves node at runtime (no baked node path), executing
// compiled dist/ (the resident server) and the .mjs orchestrators.
const wrapper = path.join(repoRoot, "scripts", "run-with-node.sh");
const nodeScript = (file) => [wrapper, path.join(repoRoot, "scripts", file)];
const weeklyPlistPath = installAgent(label, agentPlist(label, nodeScript("weekly.mjs"), weeklyCalendar, "weekly.log"));
installAgent(heartbeatLabel, agentPlist(heartbeatLabel, nodeScript("heartbeat.mjs"), heartbeatCalendar, "heartbeat.log"));
installAgent(
  serveLabel,
  agentPlist(serveLabel, [wrapper, path.join(repoRoot, "dist", "server.js")], serveSchedule, "serve.log"),
);

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hh = (h) => String(h).padStart(2, "0");
console.log(`Scheduled: auto-publish every ${dayNames[day]} at ${hh(hour)}:${hh(minute)} (${hh(retryHour)}:${hh(minute)} same-day retry, auto-skipped on success)`);
console.log(`heartbeat: keeps the Claude CLI credentials fresh every day at 09:37, notifies on expiry (auto-skipped if the CLI isn't installed)`);
console.log(`receiver: resident on 127.0.0.1:8787 (starts at login, auto-restarts on crash)`);
console.log(`plist: ${weeklyPlistPath}`);
console.log(`logs: ${logDir}/{weekly,heartbeat,serve}.log`);
console.log(`uninstall: for a in weekly heartbeat serve; do launchctl bootout gui/$UID/com.browstack.$a; rm ~/Library/LaunchAgents/com.browstack.$a.plist; done`);
