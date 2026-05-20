import type { ModelProviderDefinition, ModelProviderId } from "@agent-zy/shared-types";

const MODEL_PROVIDERS: ModelProviderDefinition[] = [
  {
    id: "modelscope",
    name: "ModelScope / 魔搭",
    defaultBaseUrl: process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1",
    requiresApiKey: true,
    authType: "bearer",
    supportedCapabilities: ["chat", "text", "vision"],
    defaultModels: [process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B"],
    docsHint: "使用 ModelScope 兼容 OpenAI 的 chat/completions 接口。",
    compatibleMode: "openai"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    requiresApiKey: true,
    authType: "bearer",
    supportedCapabilities: ["chat", "text"],
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    docsHint: "DeepSeek OpenAI-compatible API。",
    compatibleMode: "openai"
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    requiresApiKey: true,
    authType: "bearer",
    supportedCapabilities: ["chat", "text", "embedding", "vision", "tool-use"],
    defaultModels: ["gpt-4.1-mini", "gpt-4.1", "text-embedding-3-small"],
    docsHint: "OpenAI Responses / Chat Completions compatible configuration.",
    compatibleMode: "openai"
  },
  {
    id: "doubao",
    name: "Doubao / 豆包",
    defaultBaseUrl: process.env.DOUBAO_BASE_URL ?? "",
    requiresApiKey: true,
    authType: "bearer",
    supportedCapabilities: ["chat", "text", "vision"],
    defaultModels: ["doubao-seed-1-6"],
    docsHint: "豆包 OpenAI-compatible endpoint；请按控制台配置 Base URL。",
    compatibleMode: "openai"
  },
  {
    id: "ollama",
    name: "Ollama",
    defaultBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    requiresApiKey: false,
    authType: "none",
    supportedCapabilities: ["chat", "text", "embedding"],
    defaultModels: ["llama3.1", "qwen2.5"],
    docsHint: "本地 Ollama 服务，默认不需要 API Key。",
    compatibleMode: "ollama"
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible provider",
    defaultBaseUrl: "",
    requiresApiKey: true,
    authType: "bearer",
    supportedCapabilities: ["chat", "text", "embedding", "vision"],
    defaultModels: [],
    docsHint: "任意兼容 OpenAI API 的供应商，请填写 Base URL 和模型 ID。",
    compatibleMode: "openai"
  }
];

export function listModelProviders(): ModelProviderDefinition[] {
  return structuredClone(MODEL_PROVIDERS);
}

export function getModelProvider(providerId: ModelProviderId): ModelProviderDefinition | null {
  return listModelProviders().find((provider) => provider.id === providerId) ?? null;
}
