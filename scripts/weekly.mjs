// Weekly publishing: ingest → enrich → cover → digest → send
// Invoked by the launchd schedule (installed via npm run schedule:weekly, two slots per week: main run + same-day retry),
// or run manually with npm run weekly.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Never fail silently: alert via macOS Notification Center
function notify(message) {
  try {
    spawnSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title "Browstack" sound name "Basso"`,
    ]);
  } catch {
    /* a failed notification doesn't affect the flow */
  }
}

// Idempotency guard: if this week already sent successfully → the retry slot skips outright, never sending twice
try {
  const Database = require("better-sqlite3");
  const db = new Database(path.join(repoRoot, "data", "browstack.db"), { readonly: true });
  const row = db.prepare("SELECT MAX(sent_at) AS t FROM issues").get();
  db.close();
  if (row?.t && Date.now() / 1000 - row.t < 26 * 3600) {
    console.log("[weekly] Already published successfully within the last 26 hours, skipping this run (idempotency guard for the retry slot)");
    process.exit(0);
  }
} catch {
  /* DB doesn't exist yet (fresh install) → run as usual */
}

// jsdom's dependency tree does require() of an ES module, which native node only allows once
// require(ESM) is unflagged — Node 20.19 and 22.0 onward. On older 20.x (and the interim 21.x line)
// the compiled pipeline needs the explicit opt-in; on newer node it's the default, so we DON'T pass
// the flag there (a future node could drop the now-obsolete flag name and reject it).
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const needsRequireModuleFlag = (nodeMajor === 20 && nodeMinor < 19) || nodeMajor === 21;
const nodeFlags = needsRequireModuleFlag ? ["--experimental-require-module"] : [];

// Run a compiled dist/ entry under the SAME node running this script (resolved by the LaunchAgent
// wrapper). No tsx, no npm indirection — plain node on pre-built JS.
function run(label, entry, entryArgs = [], { tolerate = false } = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [...nodeFlags, path.join(repoRoot, "dist", entry), ...entryArgs], {
    stdio: "inherit",
    cwd: repoRoot,
  });
  if (result.status !== 0) {
    if (tolerate) {
      console.warn(`[weekly] ${label} failed (exit ${result.status}), continuing`);
      return;
    }
    console.error(`[weekly] ${label} failed (exit ${result.status}), aborting the issue`);
    notify(
      `This week's issue failed at ${label}. Common cause: expired Claude CLI credentials (run claude /login). See data/logs/weekly.log`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log(`[weekly] Browstack issue run started — ${new Date().toString()}`);
run("ingest", "cli.js", ["ingest"]);
// An occasional enrich failure (LLM timeout, etc.) doesn't kill the whole issue: content enriched earlier this week can still publish;
// if there's ultimately no content at all, email/send refuses to send an empty issue (see the safeguard in email.ts)
run("enrich", "cli.js", ["enrich"], { tolerate: true });
// A cover render failure (e.g. missing key) doesn't block publishing; reuse the previous cover
run("cover", "render/cover.js", [], { tolerate: true });
// The week's reading sketch (the collection-showcase subtitle): LLM-generated; a failure doesn't block publishing, the issue just has no sketch subtitle
run("digest", "render/digest.js", [], { tolerate: true });
// send = render the email (aborts on an empty issue), then deliver it
run("email", "render/email.js");
run("send", "render/send.js");
console.log(`[weekly] done — ${new Date().toString()}`);
