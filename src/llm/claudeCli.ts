import { spawn } from "node:child_process";
import type { LLMProvider } from "./provider.js";

/**
 * Uses the local Claude Code CLI (claude -p) as the LLM — rides the user's existing subscription, no separate API key to manage.
 * Requires having run claude /login in the terminal first.
 * Optionally specify a model (e.g. "opus") and a high thinking level — heavy jobs like the cover SVG fallback use the strongest configuration.
 */
export class ClaudeCliProvider implements LLMProvider {
  readonly name = "claude-cli";

  constructor(
    private readonly cliOpts: { model?: string; highEffort?: boolean; timeoutMs?: number } = {},
  ) {}

  complete(opts: { system?: string; prompt: string; maxTokens?: number }): Promise<string> {
    const full = opts.system ? `${opts.system}\n\n${opts.prompt}` : opts.prompt;
    return new Promise((resolve, reject) => {
      // Keep the full environment (needed for Keychain credentials), only removing the Claude session variables that interfere with auth
      const env: Record<string, string | undefined> = { ...process.env };
      for (const key of Object.keys(env)) {
        if (
          key === "ANTHROPIC_BASE_URL" ||
          key === "CLAUDECODE" ||
          key === "CLAUDE_AGENT_SDK_VERSION" ||
          key === "CLAUDE_EFFORT" ||
          key.startsWith("CLAUDE_CODE_")
        ) {
          delete env[key];
        }
      }
      if (this.cliOpts.highEffort) env.CLAUDE_EFFORT = "high";
      const args = ["-p", ...(this.cliOpts.model ? ["--model", this.cliOpts.model] : [])];
      const child = spawn("claude", args, { env, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      // Batch jobs (classify/summarize/draw) all run offline; with cold start + token refresh, 3 minutes isn't enough — default to 10 minutes
      const timeoutMs = this.cliOpts.timeoutMs ?? 600_000;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude-cli timed out (${Math.round(timeoutMs / 1000)}s)`));
      }, timeoutMs);
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && out.trim()) {
          resolve(out.trim());
        } else {
          reject(
            new Error(
              `claude-cli exit ${code}: ${(err || out).slice(0, 300)} (if it shows not logged in, run claude /login in the terminal first)`,
            ),
          );
        }
      });
      child.stdin.write(full);
      child.stdin.end();
    });
  }
}
