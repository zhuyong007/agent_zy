import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ModelProviderId } from "@agent-zy/shared-types";

export type ApiKeySource = "env" | "local";

export interface ModelApiKeyStatus {
  hasApiKey: boolean;
  maskedKey: string | null;
  apiKeySource: ApiKeySource | null;
}

type SecretsFile = {
  version: 1;
  secrets: Record<string, string>;
};

const ENV_BY_PROVIDER: Record<ModelProviderId, string | null> = {
  modelscope: "MODELSCOPE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  doubao: "DOUBAO_API_KEY",
  ollama: null,
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY"
};

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  const last = trimmed.slice(-4);
  const prefixMatch = trimmed.match(/^[A-Za-z0-9]+-/);
  const prefix = prefixMatch?.[0] ?? "";

  return `${prefix}****${last}`;
}

function emptySecretsFile(): SecretsFile {
  return {
    version: 1,
    secrets: {}
  };
}

function readSecrets(filePath: string): SecretsFile {
  if (!existsSync(filePath)) {
    return emptySecretsFile();
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<SecretsFile>;

  return {
    version: 1,
    secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
  };
}

function writeSecrets(filePath: string, data: SecretsFile) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  renameSync(tempPath, filePath);
}

function getProviderEnvKey(provider: ModelProviderId) {
  return ENV_BY_PROVIDER[provider];
}

export function createModelSecretsRepository(dataDir: string) {
  const filePath = resolve(dataDir, "secrets", "model-secrets.json");

  function resolveApiKey(input: { profileId: string; provider: ModelProviderId }) {
    const envName = getProviderEnvKey(input.provider);
    const envValue = envName ? process.env[envName] : undefined;

    if (envValue) {
      return {
        value: envValue,
        source: "env" as const,
        maskedKey: maskApiKey(envValue)
      };
    }

    const localValue = readSecrets(filePath).secrets[input.profileId];

    if (localValue) {
      return {
        value: localValue,
        source: "local" as const,
        maskedKey: maskApiKey(localValue)
      };
    }

    return null;
  }

  return {
    filePath,
    resolve: resolveApiKey,
    getStatus(input: { profileId: string; provider: ModelProviderId }): ModelApiKeyStatus {
      const resolved = resolveApiKey(input);

      return {
        hasApiKey: Boolean(resolved),
        maskedKey: resolved?.maskedKey ?? null,
        apiKeySource: resolved?.source ?? null
      };
    },
    save(profileId: string, apiKey: string) {
      const data = readSecrets(filePath);
      data.secrets[profileId] = apiKey;
      writeSecrets(filePath, data);
    },
    delete(profileId: string) {
      const data = readSecrets(filePath);
      delete data.secrets[profileId];
      writeSecrets(filePath, data);
    }
  };
}
