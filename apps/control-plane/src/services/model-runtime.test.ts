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

  it("records redacted model request metadata and output summaries", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-runtime-log-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const secrets = createModelSecretsRepository(dataDir);
    const profile = store.createModelProfile({
      id: "logged-profile",
      displayName: "Logged profile",
      provider: "openai",
      modelName: "gpt-logged",
      baseUrl: "https://logged.example/v1",
      apiKeyRef: "secret:logged-profile",
      capabilities: ["chat", "text"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: true,
      purpose: ["general"]
    });
    secrets.save(profile.id, "sk-model-secret");
    const append = vi.fn();
    const runtime = createModelRuntime({
      store,
      secrets,
      eventLog: { append } as any
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "model output" } }] }), { status: 200 })
      )
    );

    await runtime.generateText({
      agentId: "history-agent",
      taskId: "task-history",
      requestId: "request-model",
      purpose: "general",
      prompt: "prompt sk-model-secret"
    } as any);

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "model",
        action: "request.completed",
        agentId: "history-agent",
        taskId: "task-history",
        requestId: "request-model",
        details: expect.objectContaining({
          modelName: "gpt-logged",
          outputSummary: "model output"
        })
      })
    );
    expect(JSON.stringify(append.mock.calls)).not.toContain("sk-model-secret");
  });

  it("records when an OpenAI-compatible response stops because the output budget was exhausted", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-runtime-finish-reason-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const secrets = createModelSecretsRepository(dataDir);
    const profile = store.createModelProfile({
      id: "truncated-profile",
      displayName: "Truncated profile",
      provider: "openai",
      modelName: "gpt-truncated",
      baseUrl: "https://truncated.example/v1",
      apiKeyRef: "secret:truncated-profile",
      capabilities: ["chat", "text"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: true,
      purpose: ["general"]
    });
    secrets.save(profile.id, "sk-truncated-secret");
    const append = vi.fn();
    const runtime = createModelRuntime({
      store,
      secrets,
      eventLog: { append } as any
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { content: "{\"topic\":\"伍子胥\"" } }]
          }),
          { status: 200 }
        )
      )
    );

    await runtime.generateText({ purpose: "general", prompt: "hello" });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "model",
        action: "request.completed",
        details: expect.objectContaining({
          finishReason: "length",
          outputTruncated: true
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

  it("enables DeepSeek JSON output for structured generation requests", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-runtime-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const secrets = createModelSecretsRepository(dataDir);
    const profile = store.createModelProfile({
      id: "deepseek-profile",
      displayName: "DeepSeek profile",
      provider: "deepseek",
      modelName: "deepseek-v4-pro",
      baseUrl: "https://api.deepseek.com",
      apiKeyRef: "secret:deepseek-profile",
      capabilities: ["chat", "text"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: true,
      purpose: ["general"]
    });
    secrets.save(profile.id, "sk-deepseek-secret");
    const runtime = createModelRuntime({
      store,
      secrets,
      timeoutMs: 1000,
      retries: 0
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await runtime.generateText({
      purpose: "general",
      prompt: "return json",
      responseFormat: "json"
    } as any);

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      model: "deepseek-v4-pro",
      response_format: {
        type: "json_object"
      }
    });
  });

  it("sends OpenAI-compatible multimodal messages with image URLs", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-model-runtime-vision-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const secrets = createModelSecretsRepository(dataDir);
    const profile = store.createModelProfile({
      id: "vision-profile",
      displayName: "Vision profile",
      provider: "openai",
      modelName: "gpt-vision",
      baseUrl: "https://vision.example/v1",
      apiKeyRef: "secret:vision-profile",
      capabilities: ["chat", "text", "vision"],
      temperature: 0.1,
      maxTokens: 128,
      enabled: true,
      isDefault: true,
      purpose: ["vision"]
    });
    secrets.save(profile.id, "sk-vision-secret");
    const runtime = createModelRuntime({
      store,
      secrets,
      timeoutMs: 1000,
      retries: 0
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await runtime.chat({
      purpose: "vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "分析这帧" },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,ZmFrZQ==" } }
          ]
        }
      ]
    } as any);

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(requestInit.body as string).messages[0].content).toEqual([
      { type: "text", text: "分析这帧" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,ZmFrZQ==" } }
    ]);
  });

  it("rejects multimodal messages when the selected profile lacks vision capability", async () => {
    const runtime = setupRuntime();

    await expect(
      runtime.chat({
        purpose: "general",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "分析这帧" },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64,ZmFrZQ==" } }
            ]
          }
        ]
      } as any)
    ).rejects.toThrow("支持视觉能力");
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

  it("honors per-request timeout overrides for long generation calls", async () => {
    vi.useFakeTimers();
    const runtime = setupRuntime();
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("This operation was aborted", "AbortError"));
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = runtime.generateText({
      purpose: "general",
      prompt: "hello",
      timeoutMs: 5000
    });
    const requestExpectation = expect(request).rejects.toThrow("模型请求超时");

    await vi.advanceTimersByTimeAsync(1000);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(4000);
    await requestExpectation;
    vi.useRealTimers();
  });
});
