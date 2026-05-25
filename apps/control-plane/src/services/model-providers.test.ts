import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getModelProvider, listModelProviders } from "./model-providers";

describe("model provider registry", () => {
  afterEach(() => {
    delete process.env.DEEPSEEK_MODEL;
  });

  it("defines built-in providers with capabilities and safe auth metadata", () => {
    const providers = listModelProviders();

    expect(providers.map((provider) => provider.id)).toEqual([
      "modelscope",
      "deepseek",
      "openai",
      "doubao",
      "ollama",
      "openai-compatible"
    ]);
    expect(getModelProvider("modelscope")).toMatchObject({
      id: "modelscope",
      requiresApiKey: true,
      compatibleMode: "openai"
    });
    expect(getModelProvider("ollama")).toMatchObject({
      id: "ollama",
      requiresApiKey: false,
      compatibleMode: "ollama"
    });
    expect(getModelProvider("openai-compatible")?.defaultBaseUrl).toBe("");
    expect(providers.flatMap((provider) => provider.supportedCapabilities)).toContain("chat");
  });

  it("documents provider environment variables in .env.example", () => {
    const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");

    expect(envExample).toContain("MODELSCOPE_API_KEY=");
    expect(envExample).toContain("MODELSCOPE_BASE_URL=");
    expect(envExample).toContain("MODELSCOPE_MODEL=");
    expect(envExample).toContain("DEEPSEEK_API_KEY=");
    expect(envExample).toContain("DEEPSEEK_BASE_URL=");
    expect(envExample).toContain("OPENAI_API_KEY=");
    expect(envExample).toContain("OPENAI_BASE_URL=");
    expect(envExample).toContain("DOUBAO_API_KEY=");
    expect(envExample).toContain("DOUBAO_BASE_URL=");
    expect(envExample).toContain("OLLAMA_BASE_URL=");
    expect(envExample).toContain("OPENAI_COMPATIBLE_API_KEY=");
    expect(envExample).toContain("OPENAI_COMPATIBLE_BASE_URL=");
  });

  it("uses provider model defaults from environment variables", () => {
    process.env.DEEPSEEK_MODEL = "deepseek-v4-pro";

    expect(getModelProvider("deepseek")?.defaultModels[0]).toBe("deepseek-v4-pro");
  });
});
