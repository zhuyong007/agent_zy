import { describe, expect, it } from "vitest";

import { getModelProvider, listModelProviders } from "./model-providers";

describe("model provider registry", () => {
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
});
