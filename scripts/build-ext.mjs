// Build the Chrome extension bundles, baking in this install's per-capture secret.
// The secret lives in the macOS Keychain (browstack-capture); esbuild injects it as a
// compile-time constant so background.ts can send it as X-Browstack-Token. dist/ is gitignored,
// so the secret never enters version control. The server reads the same Keychain value to validate.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";

const SERVICE = "browstack-capture";

function ensureSecret() {
  try {
    const t = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-f]{64}$/.test(t)) return t;
  } catch {
    // not provisioned yet
  }
  const secret = crypto.randomBytes(32).toString("hex");
  execFileSync(
    "security",
    ["add-generic-password", "-s", SERVICE, "-a", os.userInfo().username, "-w", secret, "-U"],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  console.log("provisioned a new /capture secret in the Keychain (browstack-capture)");
  return secret;
}

const secret = ensureSecret();
execFileSync(
  "node_modules/.bin/esbuild",
  [
    "extension/src/content.ts",
    "extension/src/background.ts",
    "extension/src/popup.ts",
    "--bundle",
    "--outdir=extension/dist",
    "--format=iife",
    "--target=chrome120",
    "--log-level=warning",
    `--define:__BROWSTACK_CAPTURE_TOKEN__=${JSON.stringify(secret)}`,
  ],
  { stdio: "inherit" },
);
console.log("built extension/dist (capture secret baked in). Reload the unpacked extension in chrome://extensions.");
