import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createModelRuntime, DEFAULT_MODEL_RETRIES, DEFAULT_MODEL_TIMEOUT_MS } from "./model-runtime";
import { createModelSecretsRepository } from "./model-secrets";
import { createControlPlaneStore } from "./store";

describe("model runtime", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dataDir of tempDirs.splice(0)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("uses a long default timeout for generation-sized model calls", () => {
    expect(DEFAULT_MODEL_TIMEOUT_MS).toBe(120_000);
    expect(DEFAULT_MODEL_RETRIES).toBe(0);
  });

  function setupRuntime() {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-runtime-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const secrets = createModelSecretsRepository(dataDir);
    const profile = store.createModelProfile({
      id: "runtime-profile",
      displayName: "Runtime profile",
      provider: "openai",
      modelName: "gpt-test",
      baseUrl: "https://api.example.test/v1",
      apiKeyRef: "secret:runtime-profile",
      capabilities: ["chat", "text", "embedding"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: true,
      purpose: ["general", "embedding"]
    });
    secrets.save(profile.id, "sk-runtime-secret-abcd");

    return createModelRuntime({
      store,
      secrets,
      timeoutMs: 1000,
      retries: 0
    });
  }

  it("generates text through an OpenAI-compatible chat adapter", async () => {
    const runtime = setupRuntime();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "统一模型响应"
              }
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(runtime.generateText({ purpose: "general", prompt: "hello" })).resolves.toEqual({
      text: "统一模型响应"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-runtime-secret-abcd"
        })
      })
    );
  });

  it("prefers an agent default profile over purpose defaults", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-runtime-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const secrets = createModelSecretsRepository(dataDir);
    const generalProfile = store.createModelProfile({
      id: "general-profile",
      displayName: "General profile",
      provider: "openai",
      modelName: "gpt-general",
      baseUrl: "https://general.example/v1",
      apiKeyRef: "secret:general-profile",
      capabilities: ["chat", "text"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: true,
      purpose: ["general"]
    });
    const agentProfile = store.createModelProfile({
      id: "agent-profile",
      displayName: "Agent profile",
      provider: "deepseek",
      modelName: "deepseek-chat",
      baseUrl: "https://agent.example/v1",
      apiKeyRef: "secret:agent-profile",
      capabilities: ["chat", "text"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: false,
      purpose: []
    });
    store.setAgentDefaultModelProfile("history-agent", agentProfile.id);
    secrets.save(generalProfile.id, "sk-general-secret");
    secrets.save(agentProfile.id, "sk-agent-secret");
    const runtime = createModelRuntime({
      store,
      secrets,
      timeoutMs: 1000,
      retries: 0
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "agent model" } }] }), {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runtime.generateText({ agentId: "history-agent", purpose: "general", prompt: "hello" })
    ).resolves.toEqual({ text: "agent model" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agent.example/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("redacts API keys from provider errors", async () => {
    const runtime = setupRuntime();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad sk-runtime-secret-abcd", { status: 401 }))
    );

    await expect(runtime.testConnection("runtime-profile")).resolves.toMatchObject({
      ok: false,
      message: expect.not.stringContaining("sk-runtime-secret-abcd")
    });
  });
});
