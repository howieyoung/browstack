// 每週出刊：ingest → enrich → cover → send
// 由 launchd 排程呼叫（npm run schedule:weekly 安裝），也可手動 npm run weekly
import { spawnSync } from "node:child_process";

function run(script, { tolerate = false } = {}) {
  console.log(`\n=== npm run ${script} ===`);
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) {
    if (tolerate) {
      console.warn(`[weekly] ${script} 失敗（exit ${result.status}），流程繼續 / failed, continuing`);
      return;
    }
    console.error(`[weekly] ${script} 失敗（exit ${result.status}），出刊中止 / failed, aborting`);
    process.exit(result.status ?? 1);
  }
}

console.log(`[weekly] Browstack 出刊開始 / issue run started — ${new Date().toString()}`);
run("ingest");
run("enrich");
// 封面渲染失敗（如金鑰未設）不擋出刊，沿用上一張封面
run("cover", { tolerate: true });
run("send");
console.log(`[weekly] 出刊完成 / done — ${new Date().toString()}`);
