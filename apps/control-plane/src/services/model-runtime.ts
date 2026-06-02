import type { ModelProfile, ModelPurpose } from "@agent-zy/shared-types";

import type { createModelSecretsRepository } from "./model-secrets";
import type { EventLogService } from "./event-log-service";
import { getModelProvider } from "./model-providers";
import type { ControlPlaneStore } from "./store";

export type ModelContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

export type ModelChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ModelContentPart[];
};

export type ModelRuntimeRequest =
  | {
      kind: "chat";
      profileId?: string;
      agentId?: string;
      taskId?: string;
      requestId?: string;
      purpose?: ModelPurpose;
      messages: ModelChatMessage[];
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      responseFormat?: "json";
    }
  | {
      kind: "generateText";
      profileId?: string;
      agentId?: string;
      taskId?: string;
      requestId?: string;
      purpose?: ModelPurpose;
      prompt: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      responseFormat?: "json";
    }
  | {
      kind: "embedding";
      profileId?: string;
      agentId?: string;
      taskId?: string;
      requestId?: string;
      purpose?: ModelPurpose;
      input: string | string[];
      timeoutMs?: number;
    };

export interface ModelRuntime {
  chat(input: Extract<ModelRuntimeRequest, { kind: "chat" }>): Promise<{ text: string }>;
  generateText(input: Omit<Extract<ModelRuntimeRequest, { kind: "generateText" }>, "kind">): Promise<{ text: string }>;
  embedding(input: Extract<ModelRuntimeRequest, { kind: "embedding" }>): Promise<{ embedding: number[] | number[][] }>;
  testConnection(profileId: string): Promise<{ ok: boolean; latencyMs?: number; message: string }>;
  execute(input: ModelRuntimeRequest): Promise<unknown>;
}

export const DEFAULT_MODEL_TIMEOUT_MS = 120_000;
export const DEFAULT_MODEL_RETRIES = 0;

function redactSecrets(message: string, secrets: string[]): string {
  return secrets.reduce((result, secret) => result.split(secret).join("[redacted]"), message);
}

function profileEndpoint(profile: ModelProfile, path: string) {
  return `${profile.baseUrl.replace(/\/$/, "")}${path}`;
}

function supportsJsonResponseFormat(profile: ModelProfile) {
  return profile.provider === "deepseek";
}

function extractText(data: any): string {
  return (
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.message?.content ??
    data?.response ??
    ""
  );
}

function extractFinishReason(data: any): string | null {
  const finishReason =
    data?.choices?.[0]?.finish_reason ??
    data?.choices?.[0]?.finishReason ??
    data?.done_reason;

  return typeof finishReason === "string" && finishReason.trim() ? finishReason.trim() : null;
}

function hasImageContent(messages: ModelChatMessage[]): boolean {
  return messages.some(
    (message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url")
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error &&
    (error.name === "AbortError" || /operation was aborted|aborted/i.test(error.message))
  );
}

function formatTimeoutMessage(timeoutMs: number) {
  return `模型请求超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请检查当前模型是否响应过慢，或切换更快的模型/调高超时时间。`;
}

export function createModelRuntime(options: {
  store: ControlPlaneStore;
  secrets: ReturnType<typeof createModelSecretsRepository>;
  timeoutMs?: number;
  retries?: number;
  eventLog?: EventLogService;
}): ModelRuntime {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_MODEL_RETRIES;

  function summarize(value: unknown, secrets: string[]) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return redactSecrets(text ?? "", secrets).slice(0, 500);
  }

  function resolveProfile(input: { profileId?: string; agentId?: string; purpose?: ModelPurpose }): ModelProfile {
    const settings = options.store.getState().modelSettings;
    const profileId =
      input.profileId ??
      (input.agentId ? settings.agentDefaults[input.agentId] : null) ??
      (input.purpose ? settings.purposeDefaults[input.purpose] : null) ??
      settings.defaultProfileId;
    const profile = settings.profiles.find((item) => item.id === profileId);

    if (!profile) {
      throw new Error("未找到可用模型配置");
    }

    if (!profile.enabled) {
      throw new Error("模型配置未启用");
    }

    return profile;
  }

  function resolveAuth(profile: ModelProfile) {
    const provider = getModelProvider(profile.provider);

    if (!provider) {
      throw new Error("未知模型供应商");
    }

    const secret = options.secrets.resolve({
      profileId: profile.id,
      provider: profile.provider
    });

    if (provider.requiresApiKey && !secret) {
      throw new Error("模型 API Key 未配置");
    }

    return {
      provider,
      apiKey: secret?.value ?? null
    };
  }

  async function requestJson(url: string, init: RequestInit, secrets: string[], requestTimeoutMs = timeoutMs) {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal
        });
        const text = await response.text();

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
        }

        return text ? JSON.parse(text) : {};
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }

    if (isAbortError(lastError)) {
      throw new Error(formatTimeoutMessage(requestTimeoutMs));
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(redactSecrets(message, secrets));
  }

  async function chat(input: Extract<ModelRuntimeRequest, { kind: "chat" }>) {
    const startedAt = Date.now();
    const profile = resolveProfile(input);
    const { provider, apiKey } = resolveAuth(profile);
    const needsVision = hasImageContent(input.messages);

    if (needsVision && !profile.capabilities.includes("vision")) {
      throw new Error("当前模型配置不支持视觉能力，请切换到支持视觉能力的模型配置");
    }

    if (needsVision && provider.compatibleMode === "ollama") {
      throw new Error("当前模型供应商不支持图像输入，请切换到支持视觉能力的 OpenAI-compatible 模型配置");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const endpoint =
      provider.compatibleMode === "ollama"
        ? profileEndpoint(profile, "/api/chat")
        : profileEndpoint(profile, "/chat/completions");
    const body =
      provider.compatibleMode === "ollama"
        ? {
            model: profile.modelName,
            messages: input.messages,
            stream: false,
            options: {
              temperature: input.temperature ?? profile.temperature ?? undefined,
              num_predict: input.maxTokens ?? profile.maxTokens ?? undefined
            }
          }
        : {
            model: profile.modelName,
            messages: input.messages,
            temperature: input.temperature ?? profile.temperature ?? undefined,
            max_tokens: input.maxTokens ?? profile.maxTokens ?? undefined,
            ...(input.responseFormat === "json" && supportsJsonResponseFormat(profile)
              ? { response_format: { type: "json_object" } }
              : {})
          };

    const secrets = apiKey ? [apiKey] : [];
    options.eventLog?.append({
      level: "info",
      category: "model",
      action: "request.started",
      message: `${profile.provider}:${profile.modelName}`,
      agentId: input.agentId,
      taskId: input.taskId,
      requestId: input.requestId,
      details: {
        provider: profile.provider,
        modelName: profile.modelName,
        inputSummary: summarize(body, secrets)
      }
    });

    try {
      const data = await requestJson(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        },
        secrets,
        input.timeoutMs
      );
      const text = extractText(data);
      const finishReason = extractFinishReason(data);
      options.eventLog?.append({
        level: "info",
        category: "model",
        action: "request.completed",
        message: `${profile.provider}:${profile.modelName}`,
        agentId: input.agentId,
        taskId: input.taskId,
        requestId: input.requestId,
        durationMs: Date.now() - startedAt,
        details: {
          provider: profile.provider,
          modelName: profile.modelName,
          outputLength: text.length,
          outputSummary: summarize(text, secrets),
          ...(finishReason
            ? {
                finishReason,
                outputTruncated: finishReason === "length"
              }
            : {})
        }
      });

      return { text };
    } catch (error) {
      options.eventLog?.append({
        level: "error",
        category: "model",
        action: "request.failed",
        message: error instanceof Error ? redactSecrets(error.message, secrets) : "模型请求失败",
        agentId: input.agentId,
        taskId: input.taskId,
        requestId: input.requestId,
        durationMs: Date.now() - startedAt,
        details: {
          provider: profile.provider,
          modelName: profile.modelName
        }
      });
      throw error;
    }
  }

  return {
    chat,
    generateText(input) {
      return chat({
        kind: "chat",
        profileId: input.profileId,
        agentId: input.agentId,
        taskId: input.taskId,
        requestId: input.requestId,
        purpose: input.purpose,
        temperature: input.temperature,
          maxTokens: input.maxTokens,
          timeoutMs: input.timeoutMs,
          responseFormat: input.responseFormat,
          messages: [
          ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
          { role: "user" as const, content: input.prompt }
        ]
      });
    },
    async embedding(input) {
      const profile = resolveProfile(input);
      const { provider, apiKey } = resolveAuth(profile);
      const endpoint =
        provider.compatibleMode === "ollama"
          ? profileEndpoint(profile, "/api/embeddings")
          : profileEndpoint(profile, "/embeddings");
      const data = await requestJson(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model: profile.modelName,
            input: input.input
          })
        },
        apiKey ? [apiKey] : [],
        input.timeoutMs
      );

      return {
        embedding: data?.data?.map((item: any) => item.embedding) ?? data?.embedding ?? []
      };
    },
    async testConnection(profileId) {
      const startedAt = Date.now();

      try {
        await chat({
          kind: "chat",
          profileId,
          messages: [{ role: "user", content: "ping" }],
          maxTokens: 8,
          temperature: 0
        });

        return {
          ok: true,
          latencyMs: Date.now() - startedAt,
          message: "模型连接成功"
        };
      } catch (error) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : "模型连接失败"
        };
      }
    },
    execute(input) {
      if (input.kind === "chat") {
        return this.chat(input);
      }

      if (input.kind === "generateText") {
        return this.generateText(input);
      }

      return this.embedding(input);
    }
  };
}
