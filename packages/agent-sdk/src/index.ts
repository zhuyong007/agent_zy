import type {
  AppState,
  NewsArticleBody,
  NewsState,
  ScheduleState,
  TaskStatus,
  TaskTrigger,
  LedgerState
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

export interface AgentExecutionResult {
  status: Extract<TaskStatus, "completed" | "waiting_feedback" | "failed">;
  summary: string;
  assistantMessage: string;
  notifications?: Array<{
    kind: "nightly-review" | "task-update" | "news-refresh";
    title: string;
    body: string;
  }>;
  domainUpdates?: {
    ledger?: LedgerState;
    schedule?: ScheduleState;
    news?: NewsState;
    newsBodies?: NewsArticleBody[];
  };
}

export interface AgentModule {
  execute(input: AgentExecutionRequest): Promise<AgentExecutionResult>;
}

export function defineAgentManifest(manifest: AgentManifest): AgentManifest {
  return manifest;
}

export function defineAgent(agent: AgentModule): AgentModule {
  return agent;
}
