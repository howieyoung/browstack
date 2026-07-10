import { spawn } from "node:child_process";
import type { LLMProvider } from "./provider.js";

/**
 * 用本機 Claude Code CLI（claude -p）當 LLM——走用戶既有訂閱，不需另管 API key。
 * 需要先在終端機執行過 claude /login。
 * 可選指定 model（如 "opus"）與高思考等級——封面 SVG 後備等重活會用最強配置。
 */
export class ClaudeCliProvider implements LLMProvider {
  readonly name = "claude-cli";

  constructor(
    private readonly cliOpts: { model?: string; highEffort?: boolean; timeoutMs?: number } = {},
  ) {}

  complete(opts: { system?: string; prompt: string; maxTokens?: number }): Promise<string> {
    const full = opts.system ? `${opts.system}\n\n${opts.prompt}` : opts.prompt;
    return new Promise((resolve, reject) => {
      // 保留完整環境（Keychain 憑證需要），只移除會干擾認證的 Claude session 變數
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
      const timeoutMs = this.cliOpts.timeoutMs ?? 180_000;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude-cli 逾時（${Math.round(timeoutMs / 1000)} 秒）`));
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
              `claude-cli exit ${code}: ${(err || out).slice(0, 300)}（若顯示未登入，請先在終端機執行 claude /login）`,
            ),
          );
        }
      });
      child.stdin.write(full);
      child.stdin.end();
    });
  }
}
