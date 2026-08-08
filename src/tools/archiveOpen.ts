import { execFileSync } from "node:child_process";
import { ensureArchiveToken } from "../archiveToken.js";
import { SHARED } from "../shared/settings.js";

// Open the local archive directly, without going through email. Use open(1) with the token to launch the browser so the token doesn't land in shell history.
const url = `http://127.0.0.1:${SHARED.serverPort}/archive?k=${ensureArchiveToken()}`;
try {
  execFileSync("open", [url], { stdio: "ignore" });
  console.log("已在瀏覽器開啟你的典藏。");
} catch {
  // Don't print the URL with the token (avoid it landing in the terminal/history)
  console.error("無法自動開啟瀏覽器。請確認接收服務運行中（npm run serve 或已排程),再重試 npm run archive:open。");
  process.exit(1);
}
