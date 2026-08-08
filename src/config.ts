import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED } from "./shared/settings.js";
import { USER_CONFIG } from "./shared/userConfig.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CONFIG = {
  chromeProfileDir: path.join(
    os.homedir(),
    "Library/Application Support/Google/Chrome",
    USER_CONFIG.chromeProfile,
  ),
  dataDir: path.join(projectRoot, "data"),

  maxVisitDurationSec: SHARED.maxVisitDurationSec,
  userNoiseHosts: SHARED.userNoiseHosts,
  serverPort: SHARED.serverPort,

  llm: {
    // claude-cli uses the user's existing Claude subscription (requires claude /login first); anthropic needs ANTHROPIC_API_KEY
    provider: "claude-cli" as "claude-cli" | "anthropic" | "ollama",
    model: "claude-sonnet-5",
  },

  email: {
    from: USER_CONFIG.email.from,
    to: USER_CONFIG.email.to,
    // Gmail SMTP; the app password is stored in the Keychain (service: browstack-smtp)
    smtp: { host: "smtp.gmail.com", port: 465 },
  },
};
