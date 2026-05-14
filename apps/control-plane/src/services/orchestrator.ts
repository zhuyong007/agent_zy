import { nanoid } from "nanoid";

import type {
  ChatMessage,
  ChatResponse,
  DashboardData,
  HomeModulePreference,
  LedgerFactRecord,
  LedgerSemanticRecord,
  NewsState,
  NotificationRecord,
  TopicState,
  TaskRecord,
  TaskTrigger
} from "@agent-zy/shared-types";
import type { AgentExecutionLedgerDraft, AgentManifest, RouteSelection } from "@agent-zy/agent-sdk";
import type { AgentRegistry } from "@agent-zy/agent-registry";
import { createTaskRecord, transitionTaskStatus } from "@agent-zy/task-core";
import type { HybridRouter } from "@agent-zy/router-core";

import type { AgentWorkerPool } from "../runtime/agent-pool";
import type { EventBus } from "./events";
import type { LedgerReportService } from "./ledger-report-service";
import type { LedgerSemanticService } from "./ledger-semantic-service";
import type { ControlPlaneStore } from "./store";

function createMessage(
  role: ChatMessage["role"],
  content: string,
  agentId?: string
): ChatMessage {
  return {
    id: nanoid(),
    role,
    content,
    createdAt: new Date().toISOString(),
    agentId
  };
}

function createNotifications(
  items: NonNullable<
    Awaited<ReturnType<AgentWorkerPool["execute"]>>["notifications"]
  >,
  taskId: string
): NotificationRecord[] {
  return items.map((item) => ({
    id: nanoid(),
    kind: item.kind,
    title: item.title,
    body: item.body,
    createdAt: new Date().toISOString(),
    read: false,
    taskId,
    persistent: item.persistent,
    payload: item.payload
  }));
}

export interface ControlPlaneOrchestrator {
  handleChat(message: string): Promise<ChatResponse>;
  handleLedgerChat(message: string): Promise<ChatResponse>;
  getHomeLayout(): HomeModulePreference[];
  saveHomeLayout(layout: HomeModulePreference[]): HomeModulePreference[];
  getNews(): NewsState;
  refreshNews(meta?: Record<string, unknown>): Promise<NewsState>;
  getTopics(): TopicState;
  generateTopics(meta?: Record<string, unknown>): Promise<TopicState>;
  generateHistory(meta?: Record<string, unknown>): Promise<DashboardData>;
  getLedgerTimeline(): Array<{
    fact: LedgerFactRecord;
    semantic: Pick<
      LedgerSemanticRecord,
      | "primaryCategory"
      | "secondaryCategories"
      | "tags"
      | "people"
      | "confidence"
      | "reasoningSummary"
      | "parserVersion"
      | "lifeStageIds"
      | "scene"
    > | null;
  }>;
  getLedgerReports(): ReturnType<ControlPlaneStore["getLedgerReports"]>;
  getLedgerStages(): ReturnType<ControlPlaneStore["getLedgerStages"]>;
  cancelNotification(notificationId: string): ReturnType<ControlPlaneStore["getDashboard"]>;
  runSystemTask(input: {
    agentId: string;
    trigger: TaskTrigger;
    summary: string;
    meta?: Record<string, unknown>;
  }): Promise<TaskRecord>;
  getDashboard(): ReturnType<ControlPlaneStore["getDashboard"]>;
}

export function createControlPlaneOrchestrator(options: {
  store: ControlPlaneStore;
  registry: AgentRegistry;
  router: HybridRouter;
  workerPool: AgentWorkerPool;
  eventBus: EventBus;
  ledgerSemanticService: LedgerSemanticService;
  ledgerReportService: LedgerReportService;
}): ControlPlaneOrchestrator {
  function persistLedgerMetadata(input: {
    taskId: string;
    draft?: AgentExecutionLedgerDraft;
    fact?: LedgerFactRecord;
    semantic?: LedgerSemanticRecord;
  }) {
    if (!input.fact) {
      return;
    }

    const fact = {
      ...input.fact,
      taskId: input.fact.taskId ?? input.taskId
    };
    options.store.appendLedgerFact(fact);

    const semantic = options.ledgerSemanticService.resolve({
      fact,
      semantic: input.semantic,
      draft: input.draft
    });

    if (semantic) {
      options.store.appendLedgerSemantic(semantic);
    }
  }

  async function executeChatWithManifest(input: {
    manifest: AgentManifest;
    message: string;
    route: RouteSelection;
    taskSummary: string;
  }): Promise<ChatResponse> {
    const userMessage = createMessage("user", input.message);
    options.store.addMessage(userMessage);

    const task = createTaskRecord({
      id: nanoid(),
      agentId: input.manifest.id,
      summary: input.taskSummary,
      input: {
        message: input.message
      }
    });

    options.store.upsertTask(task);
    options.eventBus.emit("dashboard.updated", options.store.getState());

    const executed = await executeTask({
      manifest: input.manifest,
      task,
      message: input.message
    });

    return {
      route: {
        agentId: input.route.agentId,
        confidence: input.route.confidence,
        reason: input.route.reason
      },
      task: executed.task,
      message: executed.assistantMessage
    };
  }

  async function executeTask(input: {
    manifest: AgentManifest;
    task: TaskRecord;
    message?: string;
    meta?: Record<string, unknown>;
  }): Promise<{
    task: TaskRecord;
    assistantMessage: ChatMessage;
  }> {
    const runningTask = transitionTaskStatus(
      input.task,
      "running",
      "Worker started"
    );
    options.store.upsertTask(runningTask);
    options.eventBus.emit("dashboard.updated", options.store.getState());

    try {
      const result = await options.workerPool.execute(input.manifest, {
        taskId: input.task.id,
        trigger: input.task.trigger,
        message: input.message,
        meta: input.meta,
        requestedAt: new Date().toISOString(),
        state: options.store.getState()
      });

      const doneTask = transitionTaskStatus(
        runningTask,
        result.status,
        result.summary
      );
      doneTask.resultSummary = result.summary;

      options.store.upsertTask(doneTask);
      options.store.applyAgentResult(result);
      persistLedgerMetadata({
        taskId: doneTask.id,
        draft: result.metadata?.ledger?.draft,
        fact: result.metadata?.ledger?.fact,
        semantic: result.metadata?.ledger?.semantic
      });

      if (result.notifications?.length) {
        options.store.addNotifications(createNotifications(result.notifications, doneTask.id));
      }

      const assistantMessage = createMessage(
        "assistant",
        result.assistantMessage,
        input.manifest.id
      );
      options.store.addMessage(assistantMessage);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return {
        task: doneTask,
        assistantMessage
      };
    } catch (error) {
      const failedTask = transitionTaskStatus(
        runningTask,
        "failed",
        error instanceof Error ? error.message : "Worker failed"
      );
      options.store.upsertTask(failedTask);

      const assistantMessage = createMessage(
        "assistant",
        "执行失败，请检查控制面日志或重试。",
        input.manifest.id
      );
      options.store.addMessage(assistantMessage);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return {
        task: failedTask,
        assistantMessage
      };
    }
  }

  function resolveLedgerReportKind(meta?: Record<string, unknown>) {
    if (meta?.action === "generate-weekly-report") {
      return "weekly" as const;
    }

    if (meta?.action === "generate-monthly-report") {
      return "monthly" as const;
    }

    return null;
  }

  function shouldRunLedgerReportSystemTask(input: {
    agentId: string;
    meta?: Record<string, unknown>;
  }) {
    return input.agentId === "ledger-agent" && resolveLedgerReportKind(input.meta) !== null;
  }

  function resolveReportNow(meta?: Record<string, unknown>) {
    const candidate = meta?.now;

    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return candidate;
    }

    if (typeof candidate === "string") {
      const parsed = new Date(candidate);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }

  async function runLedgerReportSystemTask(input: {
    agentId: string;
    trigger: TaskTrigger;
    summary: string;
    meta?: Record<string, unknown>;
  }) {
    const kind = resolveLedgerReportKind(input.meta);

    if (!kind) {
      throw new Error("Unsupported ledger report action");
    }

    const task = createTaskRecord({
      id: nanoid(),
      agentId: input.agentId,
      summary: input.summary,
      trigger: input.trigger,
      input: {
        meta: input.meta ?? {}
      }
    });
    const runningTask = transitionTaskStatus(task, "running", "Generating ledger report");

    options.store.upsertTask(task);
    options.store.upsertTask(runningTask);
    options.eventBus.emit("dashboard.updated", options.store.getState());

    try {
      const report = options.ledgerReportService.generateReport({
        kind,
        now: resolveReportNow(input.meta),
        periodStart:
          typeof input.meta?.periodStart === "string" ? input.meta.periodStart : undefined,
        periodEnd: typeof input.meta?.periodEnd === "string" ? input.meta.periodEnd : undefined,
        facts: options.store.getLedgerFacts(),
        semantics: options.store.getLedgerSemantics()
      });

      options.store.upsertLedgerReport(report);

      const doneTask = transitionTaskStatus(
        runningTask,
        "completed",
        kind === "weekly" ? "Weekly ledger report generated" : "Monthly ledger report generated"
      );
      doneTask.resultSummary =
        kind === "weekly"
          ? `已生成正式账本周报（${report.periodStart} ~ ${report.periodEnd}）`
          : `已生成正式账本月报（${report.periodStart} ~ ${report.periodEnd}）`;
      options.store.upsertTask(doneTask);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return doneTask;
    } catch (error) {
      const failedTask = transitionTaskStatus(
        runningTask,
        "failed",
        error instanceof Error ? error.message : "Ledger report generation failed"
      );
      options.store.upsertTask(failedTask);
      options.eventBus.emit("dashboard.updated", options.store.getState());
      return failedTask;
    }
  }

  return {
    async handleChat(message) {
      const route = await options.router.route(
        {
          message,
          trigger: "user"
        },
        options.registry.list()
      );

      const manifest = options.registry.get(route.agentId);

      if (!manifest) {
        throw new Error(`Unknown agent selected: ${route.agentId}`);
      }

      return executeChatWithManifest({
        manifest,
        message,
        route,
        taskSummary: `主 agent 路由到 ${manifest.name}`
      });
    },
    async handleLedgerChat(message) {
      const manifest = options.registry.get("ledger-agent");

      if (!manifest) {
        throw new Error("Unknown agent selected: ledger-agent");
      }

      return executeChatWithManifest({
        manifest,
        message,
        route: {
          agentId: manifest.id,
          confidence: 1,
          reason: "Dedicated ledger API route"
        },
        taskSummary: `ledger API 路由到 ${manifest.name}`
      });
    },
    async runSystemTask(input) {
      if (shouldRunLedgerReportSystemTask(input)) {
        return runLedgerReportSystemTask(input);
      }

      const manifest = options.registry.get(input.agentId);

      if (!manifest) {
        throw new Error(`Unknown system agent: ${input.agentId}`);
      }

      const task = createTaskRecord({
        id: nanoid(),
        agentId: manifest.id,
        summary: input.summary,
        trigger: input.trigger,
        input: {
          meta: input.meta ?? {}
        }
      });

      options.store.upsertTask(task);
      const executed = await executeTask({
        manifest,
        task,
        meta: input.meta
      });

      return executed.task;
    },
    getHomeLayout() {
      return options.store.getState().homeLayout;
    },
    saveHomeLayout(layout) {
      options.store.setHomeLayout(layout);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return options.store.getState().homeLayout;
    },
    getNews() {
      return options.store.getState().news;
    },
    async refreshNews(meta = {}) {
      await this.runSystemTask({
        agentId: "news-agent",
        trigger: "system",
        summary: "手动刷新热点",
        meta: {
          ...meta,
          action: "refresh"
        }
      });

      return options.store.getState().news;
    },
    getTopics() {
      return options.store.getState().topics;
    },
    async generateTopics(meta = {}) {
      await this.runSystemTask({
        agentId: "topic-agent",
        trigger: "system",
        summary: "生成 AI 自媒体选题",
        meta: {
          ...meta,
          action: "generate"
        }
      });

      return options.store.getState().topics;
    },
    async generateHistory(meta = {}) {
      console.info("[history-generate] orchestrator:start", {
        meta
      });

      const task = await this.runSystemTask({
        agentId: "history-agent",
        trigger: "system",
        summary: "生成历史知识内容",
        meta: {
          ...meta,
          action: "generate"
        }
      });

      console.info("[history-generate] orchestrator:done", {
        taskId: task.id,
        status: task.status,
        resultSummary: task.resultSummary
      });

      return this.getDashboard();
    },
    cancelNotification(notificationId) {
      options.store.cancelNotification(notificationId);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return this.getDashboard();
    },
    getLedgerTimeline() {
      const semanticsByFactId = new Map(
        options.store.getLedgerSemantics().map((semantic) => [semantic.factId, semantic])
      );

      return options.store
        .getLedgerFacts()
        .sort((left, right) => {
          const occurredDelta =
            new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();

          if (occurredDelta !== 0) {
            return occurredDelta;
          }

          return new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime();
        })
        .map((fact) => {
          const semantic = semanticsByFactId.get(fact.id);

          return {
            fact,
            semantic: semantic
              ? {
                  primaryCategory: semantic.primaryCategory,
                  secondaryCategories: semantic.secondaryCategories,
                  tags: semantic.tags,
                  people: semantic.people,
                  confidence: semantic.confidence,
                  reasoningSummary: semantic.reasoningSummary,
                  parserVersion: semantic.parserVersion,
                  lifeStageIds: semantic.lifeStageIds,
                  ...(semantic.scene ? { scene: semantic.scene } : {})
                }
              : null
          };
        });
    },
    getLedgerReports() {
      return options.ledgerReportService.listReports({
        reports: options.store.getLedgerReports()
      });
    },
    getLedgerStages() {
      return options.store.getLedgerStages();
    },
    getDashboard() {
      return options.store.getDashboard(
        options.registry.list(),
        options.workerPool.getViews(options.registry.list())
      );
    }
  };
}
