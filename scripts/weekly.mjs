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
    console.log("[weekly] 26 小時內已成功出刊，跳過本次執行（重試時段的冪等保護）");
    process.exit(0);
  }
} catch {
  /* DB doesn't exist yet (fresh install) → run as usual */
}

function run(script, { tolerate = false } = {}) {
  console.log(`\n=== npm run ${script} ===`);
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) {
    if (tolerate) {
      console.warn(`[weekly] ${script} 失敗（exit ${result.status}），流程繼續 / failed, continuing`);
      return;
    }
    console.error(`[weekly] ${script} 失敗（exit ${result.status}），出刊中止 / failed, aborting`);
    notify(
      `本週出刊失敗於 ${script}。常見原因：Claude CLI 憑證過期（跑 claude /login）。詳見 data/logs/weekly.log`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log(`[weekly] Browstack 出刊開始 / issue run started — ${new Date().toString()}`);
run("ingest");
// An occasional enrich failure (LLM timeout, etc.) doesn't kill the whole issue: content enriched earlier this week can still publish;
// if there's ultimately no content at all, email/send refuses to send an empty issue (see the safeguard in email.ts)
run("enrich", { tolerate: true });
// A cover render failure (e.g. missing key) doesn't block publishing; reuse the previous cover
run("cover", { tolerate: true });
// The week's reading sketch (the collection-showcase subtitle): LLM-generated; a failure doesn't block publishing, the issue just has no sketch subtitle
run("digest", { tolerate: true });
run("send");
console.log(`[weekly] 出刊完成 / done — ${new Date().toString()}`);
