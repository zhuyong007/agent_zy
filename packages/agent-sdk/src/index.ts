import type {
  AppState,
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
    summary?: SummaryState;
    historyPush?: HistoryPushState;
  };
}

export interface AgentModule {
  execute(input: AgentExecutionRequest): Promise<AgentExecutionResult>;
}

export type AgentModelChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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
    }
  | {
      kind: "embedding";
      profileId?: string;
      agentId?: string;
      purpose?: ModelPurpose;
      input: string | string[];
    };

export interface AgentModelClient {
  chat(input: Omit<Extract<AgentModelRequest, { kind: "chat" }>, "kind">): Promise<{ text: string }>;
  generateText(input: Omit<Extract<AgentModelRequest, { kind: "generateText" }>, "kind">): Promise<{ text: string }>;
  embedding(
    input: Omit<Extract<AgentModelRequest, { kind: "embedding" }>, "kind">
  ): Promise<{ embedding: number[] | number[][] }>;
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
