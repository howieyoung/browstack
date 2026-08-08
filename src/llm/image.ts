import { execFileSync } from "node:child_process";

/**
 * Image-generation provider abstraction layer — the render side of the cover engine.
 * Same design philosophy as LLMProvider: fixed interface, swappable engine.
 */

// Key lookup order: environment variable → macOS Keychain (service: browstack-openai)
// How to store in Keychain: security add-generic-password -s browstack-openai -a "$USER" -w '<key>' -U
function getOpenAIKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const key = execFileSync(
      "security",
      ["find-generic-password", "-s", "browstack-openai", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (key) return key;
  } catch {
    // Not in the Keychain; fall through to throw an explicit error
  }
  throw new Error(
    "找不到 OpenAI 金鑰。建議存進 macOS Keychain：\n" +
      `  security add-generic-password -s browstack-openai -a "$USER" -w '<你的 key>' -U\n` +
      "（或以 OPENAI_API_KEY 環境變數提供）",
  );
}

export interface ImageProvider {
  readonly name: string;
  /** Generate a portrait cover image, returned as a PNG buffer */
  generate(prompt: string): Promise<Buffer>;
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";

  constructor(
    private readonly model = "gpt-image-1",
    private readonly size = "1024x1536",
  ) {}

  async generate(prompt: string): Promise<Buffer> {
    const key = getOpenAIKey();
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, size: this.size, quality: "high" }),
    });
    if (!res.ok) throw new Error(`OpenAI Images ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { data: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("圖像生成回應中沒有影像資料");
    return Buffer.from(b64, "base64");
  }
}

export function getImageProvider(): ImageProvider {
  return new OpenAIImageProvider();
}
