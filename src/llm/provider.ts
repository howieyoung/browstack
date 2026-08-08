import { CONFIG } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCliProvider } from "./claudeCli.js";

/**
 * LLM provider abstraction layer. All downstream features (knowledge
 * classification, summarization, topic grouping) depend only on this interface,
 * ensuring cloud/local models can be swapped at any time (product decision #2).
 *
 * Privacy constraint: callers may only pass in body text that has already passed
 * content-page classification. Sensitive/noise pages are blocked at the ingest
 * stage and never reach here.
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
      throw new Error("OllamaProvider not yet implemented (local-model channel, reserved per decision #2)");
  }
}

// LLM replies often wrap output in a ```json fence; extract the first JSON value
export function parseJsonReply<T>(reply: string): T {
  const cleaned = reply.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in the reply: ${cleaned.slice(0, 120)}`);
  return JSON.parse(cleaned.slice(start)) as T;
}
