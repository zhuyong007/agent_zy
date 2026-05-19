import type { ModelProfile, ModelPurpose } from "@agent-zy/shared-types";

import type { createModelSecretsRepository } from "./model-secrets";
import { getModelProvider } from "./model-providers";
import type { ControlPlaneStore } from "./store";

export type ModelChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelRuntimeRequest =
  | {
      kind: "chat";
      profileId?: string;
      purpose?: ModelPurpose;
      messages: ModelChatMessage[];
      temperature?: number;
      maxTokens?: number;
    }
  | {
      kind: "generateText";
      profileId?: string;
      purpose?: ModelPurpose;
      prompt: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    }
  | {
      kind: "embedding";
      profileId?: string;
      purpose?: ModelPurpose;
      input: string | string[];
    };

export interface ModelRuntime {
  chat(input: Extract<ModelRuntimeRequest, { kind: "chat" }>): Promise<{ text: string }>;
  generateText(input: Omit<Extract<ModelRuntimeRequest, { kind: "generateText" }>, "kind">): Promise<{ text: string }>;
  embedding(input: Extract<ModelRuntimeRequest, { kind: "embedding" }>): Promise<{ embedding: number[] | number[][] }>;
  testConnection(profileId: string): Promise<{ ok: boolean; latencyMs?: number; message: string }>;
  execute(input: ModelRuntimeRequest): Promise<unknown>;
}

function redactSecrets(message: string, secrets: string[]): string {
  return secrets.reduce((result, secret) => result.split(secret).join("[redacted]"), message);
}

function profileEndpoint(profile: ModelProfile, path: string) {
  return `${profile.baseUrl.replace(/\/$/, "")}${path}`;
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

export function createModelRuntime(options: {
  store: ControlPlaneStore;
  secrets: ReturnType<typeof createModelSecretsRepository>;
  timeoutMs?: number;
  retries?: number;
}): ModelRuntime {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = options.retries ?? 1;

  function resolveProfile(input: { profileId?: string; purpose?: ModelPurpose }): ModelProfile {
    const settings = options.store.getState().modelSettings;
    const profileId =
      input.profileId ?? (input.purpose ? settings.purposeDefaults[input.purpose] : null) ?? settings.defaultProfileId;
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

  async function requestJson(url: string, init: RequestInit, secrets: string[]) {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

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

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(redactSecrets(message, secrets));
  }

  async function chat(input: Extract<ModelRuntimeRequest, { kind: "chat" }>) {
    const profile = resolveProfile(input);
    const { provider, apiKey } = resolveAuth(profile);
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
            max_tokens: input.maxTokens ?? profile.maxTokens ?? undefined
          };

    const data = await requestJson(
      endpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      },
      apiKey ? [apiKey] : []
    );

    return {
      text: extractText(data)
    };
  }

  return {
    chat,
    generateText(input) {
      return chat({
        kind: "chat",
        profileId: input.profileId,
        purpose: input.purpose,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
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
        apiKey ? [apiKey] : []
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
