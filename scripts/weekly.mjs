// 每週出刊：ingest → enrich → cover → send
// 由 launchd 排程呼叫（npm run schedule:weekly 安裝，每週兩個時段：主跑＋當日重試），
// 也可手動 npm run weekly。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// 失敗絕不無聲：macOS 通知中心告警
function notify(message) {
  try {
    spawnSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title "Browstack" sound name "Basso"`,
    ]);
  } catch {
    /* 通知失敗不影響流程 */
  }
}

// 冪等保護：同一週已成功寄出 → 重試時段直接跳過，絕不重複寄送
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
  /* DB 尚不存在（全新安裝）→ 照常執行 */
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
// enrich 偶發失敗（LLM 逾時等）不殺整期：本週稍早已增潤的內容仍可出刊；
// 若最終完全沒有內容，email/send 會拒絕寄出空刊物（見 email.ts 保險）
run("enrich", { tolerate: true });
// 封面渲染失敗（如金鑰未設）不擋出刊，沿用上一張封面
run("cover", { tolerate: true });
run("send");
console.log(`[weekly] 出刊完成 / done — ${new Date().toString()}`);
