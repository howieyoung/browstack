import { execFileSync } from "node:child_process";
import { ensureArchiveToken } from "../archiveToken.js";
import { SHARED } from "../shared/settings.js";

// Open the local archive directly, without going through email. Use open(1) with the token to launch the browser so the token doesn't land in shell history.
const url = `http://127.0.0.1:${SHARED.serverPort}/archive?k=${ensureArchiveToken()}`;
try {
  execFileSync("open", [url], { stdio: "ignore" });
  console.log("Opened your archive in the browser.");
} catch {
  // Don't print the URL with the token (avoid it landing in the terminal/history)
  console.error("Could not open the browser automatically. Make sure the receiver service is running (npm run serve, or scheduled), then retry npm run archive:open.");
  process.exit(1);
}
