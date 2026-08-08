import { execFileSync } from "node:child_process";
import { ensureArchiveToken } from "../archiveToken.js";
import { SHARED } from "../shared/settings.js";

// 不透過信件、直接開啟本機典藏。用 open(1) 帶 token 開瀏覽器,token 不落在 shell history。
const url = `http://127.0.0.1:${SHARED.serverPort}/archive?k=${ensureArchiveToken()}`;
try {
  execFileSync("open", [url], { stdio: "ignore" });
  console.log("已在瀏覽器開啟你的典藏。");
} catch {
  // 不印出帶 token 的網址（避免落在終端機／history）
  console.error("無法自動開啟瀏覽器。請確認接收服務運行中（npm run serve 或已排程),再重試 npm run archive:open。");
  process.exit(1);
}
