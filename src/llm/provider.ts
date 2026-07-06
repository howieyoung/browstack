import { CONFIG } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCliProvider } from "./claudeCli.js";

/**
 * LLM 供應商抽象層。所有下游功能（知識分類、摘要、主題分組）
 * 只依賴這個介面，確保雲端/本機模型可隨時切換（產品決策 #2）。
 *
 * 隱私約束：呼叫端只能傳入「已通過內容頁分類」的正文。
 * 敏感/雜訊頁面在 ingest 階段就被擋下，永遠不會到達這裡。
 */
export interface LLMProvider {
  readonly name: string;
  complete(opts: {
    system?: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<string>;
}

export function getProvider(): LLMProvider {
  switch (CONFIG.llm.provider) {
    case "claude-cli":
      return new ClaudeCliProvider();
    case "anthropic":
      return new AnthropicProvider(CONFIG.llm.model);
    case "ollama":
      throw new Error("OllamaProvider 尚未實作（本機模型通道，依決策 #2 保留）");
  }
}

// LLM 回覆常包 ```json 圍欄；取出第一個 JSON 值
export function parseJsonReply<T>(reply: string): T {
  const cleaned = reply.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error(`回覆中找不到 JSON：${cleaned.slice(0, 120)}`);
  return JSON.parse(cleaned.slice(start)) as T;
}
