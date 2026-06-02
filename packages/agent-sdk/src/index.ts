import type {
  AppState,
  ClassicShotState,
  HistoryPostPayload,
  LedgerFactRecord,
  LedgerSemanticRecord,
  CinematicState,
  HistoryPushState,
  LedgerState,
  NewsState,
  NotificationKind,
  ScheduleState,
  SummaryState,
  TaskStatus,
  TaskTrigger,
  ModelPurpose,
  TopicState
} from "@agent-zy/shared-types";

export type { TaskTrigger } from "@agent-zy/shared-types";

export interface AgentManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  triggers: TaskTrigger[];
  modulePath: string;
  manifestPath: string;
  tags: string[];
}

export interface RouteInput {
  message: string;
  trigger: TaskTrigger;
}

export interface RouteSelection {
  agentId: string;
  confidence: number;
  reason: string;
}

export interface RouterModel {
  selectCandidate(input: {
    input: RouteInput;
    candidates: AgentManifest[];
  }): Promise<RouteSelection | null>;
}

export interface AgentExecutionRequest {
  taskId: string;
  trigger: TaskTrigger;
  message?: string;
  meta?: Record<string, unknown>;
  requestedAt: string;
  state: AppState;
}

export interface AgentExecutionLedgerDraft {
  status: "confirmed" | "needs_review";
  issues: Array<"amount_missing" | "direction_unknown">;
  fact: {
    rawText: string;
    normalizedText: string;
    direction: LedgerFactRecord["direction"] | null;
    amountCents: number | null;
    currency: LedgerFactRecord["currency"];
    occurredAt: string;
    recordedAt: string;
    counterparty?: string;
    status: LedgerFactRecord["status"];
  };
  semantic: {
    primaryCategory: string | null;
    secondaryCategories: string[];
    tags: string[];
    people: string[];
    scene?: string;
    confidence: number;
    reasoningSummary: string;
    parserVersion: string;
  };
}

export interface AgentExecutionResult {
  status: Extract<TaskStatus, "completed" | "waiting_feedback" | "failed">;
  summary: string;
  assistantMessage: string;
  metadata?: {
    ledger?: {
      fact?: LedgerFactRecord;
      semantic?: LedgerSemanticRecord;
      draft?: AgentExecutionLedgerDraft;
    };
  };
  notifications?: Array<{
    kind: NotificationKind;
    title: string;
    body: string;
    persistent?: boolean;
    payload?: HistoryPostPayload;
  }>;
  domainUpdates?: {
    ledger?: LedgerState;
    schedule?: ScheduleState;
    news?: NewsState;
    topics?: TopicState;
    cinematic?: CinematicState;
    classicShots?: ClassicShotState;
    summary?: SummaryState;
    historyPush?: HistoryPushState;
  };
}

export interface AgentModule {
  execute(input: AgentExecutionRequest): Promise<AgentExecutionResult>;
}

export type AgentModelContentPart =
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

export type AgentModelChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | AgentModelContentPart[];
};

export type AgentModelRequest =
  | {
      kind: "chat";
      profileId?: string;
      agentId?: string;
      purpose?: ModelPurpose;
      messages: AgentModelChatMessage[];
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      responseFormat?: "json";
    }
  | {
      kind: "generateText";
      profileId?: string;
      agentId?: string;
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
      purpose?: ModelPurpose;
      input: string | string[];
      timeoutMs?: number;
    };

export interface AgentModelClient {
  chat(input: Omit<Extract<AgentModelRequest, { kind: "chat" }>, "kind">): Promise<{ text: string }>;
  generateText(input: Omit<Extract<AgentModelRequest, { kind: "generateText" }>, "kind">): Promise<{ text: string }>;
  embedding(
    input: Omit<Extract<AgentModelRequest, { kind: "embedding" }>, "kind">
  ): Promise<{ embedding: number[] | number[][] }>;
}

function asModelOutputRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asModelOutputString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  const record = asModelOutputRecord(value);

  return typeof record?.value === "string" && record.value.trim() ? record.value.trim() : null;
}

function parseJsonCandidate(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractFencedJsonCandidates(value: string): string[] {
  return Array.from(value.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu), (match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function extractBalancedJsonCandidate(value: string, openToken: "{" | "[", closeToken: "}" | "]"): string | null {
  for (let start = value.indexOf(openToken); start >= 0; start = value.indexOf(openToken, start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const character = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = inString;
        continue;
      }

      if (character === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (character === openToken) {
        depth += 1;
      }

      if (character === closeToken) {
        depth -= 1;

        if (depth === 0) {
          return value.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

export function parseModelJson(value: string): unknown | null {
  const trimmed = value.trim();
  const direct = parseJsonCandidate(trimmed);

  if (direct !== null) {
    return direct;
  }

  for (const candidate of extractFencedJsonCandidates(trimmed)) {
    const parsed = parseJsonCandidate(candidate);

    if (parsed !== null) {
      return parsed;
    }
  }

  for (const candidate of [
    extractBalancedJsonCandidate(trimmed, "{", "}"),
    extractBalancedJsonCandidate(trimmed, "[", "]")
  ]) {
    if (!candidate) {
      continue;
    }

    const parsed = parseJsonCandidate(candidate);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function isTextWrapperRecord(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record);

  return (
    keys.length > 0 &&
    keys.every((key) => key === "type" || key === "text" || key === "content" || key === "value") &&
    Boolean(asModelOutputString(record.text) ?? asModelOutputString(record.content) ?? asModelOutputString(record.value))
  );
}

function isModelWrapperRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    record.choices ||
      record.message ||
      record.response ||
      record.output_text ||
      record.output ||
      record.result ||
      record.data ||
      isTextWrapperRecord(record)
  );
}

function extractTextFromContentBlocks(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return asModelOutputString(value);
  }

  const text = value
    .map((item) => {
      const record = asModelOutputRecord(item);

      return record ? asModelOutputString(record.text) ?? asModelOutputString(record.content) : null;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");

  return text || null;
}

function extractTextFromWrapperRecord(record: Record<string, unknown>): unknown | null {
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = asModelOutputRecord(choices[0]);
  const message = asModelOutputRecord(firstChoice?.message);
  const messageContent = message?.content;

  if (messageContent !== undefined && messageContent !== null) {
    return extractTextFromContentBlocks(messageContent) ?? messageContent;
  }

  if (firstChoice?.text !== undefined && firstChoice.text !== null) {
    return firstChoice.text;
  }

  const directMessage = asModelOutputRecord(record.message);

  if (directMessage?.content !== undefined && directMessage.content !== null) {
    return extractTextFromContentBlocks(directMessage.content) ?? directMessage.content;
  }

  for (const key of ["output_text", "response", "text", "content", "value"] as const) {
    if (record[key] !== undefined && record[key] !== null && (key !== "content" || isTextWrapperRecord(record))) {
      return record[key];
    }
  }

  for (const key of ["output", "result", "data"] as const) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return null;
}

function normalizeModelOutputInternal(value: unknown, depth: number): unknown {
  if (depth > 8) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parseModelJson(value);

    return parsed === null ? value : normalizeModelOutputInternal(parsed, depth + 1);
  }

  if (Array.isArray(value)) {
    const textBlocks = value.filter((item): item is Record<string, unknown> => {
      const record = asModelOutputRecord(item);

      return record !== null && isTextWrapperRecord(record);
    });

    if (textBlocks.length === value.length && textBlocks.length > 0) {
      const text = textBlocks
        .map((record) => asModelOutputString(record.text) ?? asModelOutputString(record.content))
        .filter((item): item is string => Boolean(item))
        .join("\n");

      return normalizeModelOutputInternal(text, depth + 1);
    }

    if (value.length === 1) {
      const record = asModelOutputRecord(value[0]);

      if (record && isModelWrapperRecord(record)) {
        return normalizeModelOutputInternal(record, depth + 1);
      }
    }

    const messageText = value
      .map((item) => {
        const record = asModelOutputRecord(item);

        return record ? extractTextFromContentBlocks(record.content) : null;
      })
      .filter((item): item is string => Boolean(item))
      .join("\n");

    if (messageText) {
      return normalizeModelOutputInternal(messageText, depth + 1);
    }

    return value;
  }

  const record = asModelOutputRecord(value);

  if (!record || !isModelWrapperRecord(record)) {
    return value;
  }

  const text = extractTextFromWrapperRecord(record);

  return text === null ? value : normalizeModelOutputInternal(text, depth + 1);
}

export function normalizeModelOutput(value: unknown): unknown {
  return normalizeModelOutputInternal(value, 0);
}

export function defineAgentManifest(manifest: AgentManifest): AgentManifest {
  return manifest;
}

export function defineAgent(agent: AgentModule): AgentModule {
  return agent;
}

function requestModel<T>(payload: AgentModelRequest): Promise<T> {
  if (process.env.VITEST && process.env.AGENT_ZY_WORKER !== "1") {
    return Promise.reject(new Error("Model client is only available inside an agent worker"));
  }

  if (typeof process.send !== "function") {
    return Promise.reject(new Error("Model client is only available inside an agent worker"));
  }

  const requestId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `model-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<T>((resolve, reject) => {
    const handleMessage = (message: {
      type?: string;
      requestId?: string;
      result?: T;
      error?: string;
    }) => {
      if (message.type !== "model-response" || message.requestId !== requestId) {
        return;
      }

      process.off("message", handleMessage);

      if (message.error) {
        reject(new Error(message.error));
        return;
      }

      resolve(message.result as T);
    };

    process.on("message", handleMessage);
    process.send?.({
      type: "model-request",
      requestId,
      payload
    });
  });
}

export function getModelClient(): AgentModelClient {
  const injected = (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: AgentModelClient })
    .__AGENT_ZY_MODEL_CLIENT__;

  if (injected) {
    return injected;
  }

  return {
    chat(input) {
      return requestModel({
        kind: "chat",
        ...input
      });
    },
    generateText(input) {
      return requestModel({
        kind: "generateText",
        ...input
      });
    },
    embedding(input) {
      return requestModel({
        kind: "embedding",
        ...input
      });
    }
  };
}
