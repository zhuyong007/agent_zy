import { nanoid } from "nanoid";

import type {
  ChatMessage,
  ChatResponse,
  ClassicShotState,
  CinematicProject,
  CinematicState,
  DashboardData,
  HistoryXhsState,
  HomeModulePreference,
  LedgerFactRecord,
  LedgerSemanticRecord,
  NewsState,
  NotificationRecord,
  SummaryEntry,
  SummaryType,
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
import type { EventLogService } from "./event-log-service";
import type { HistoryXhsService } from "./history-xhs-service";
import type { LedgerReportService } from "./ledger-report-service";
import type { LedgerSemanticService } from "./ledger-semantic-service";
import type { ControlPlaneStore } from "./store";
import type { SummaryExportPayload, SummaryListQuery, SummaryService } from "./summary-service";

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
  getCinematic(): CinematicState;
  createCinematicProject(input: unknown): CinematicProject;
  updateCinematicProject(id: string, input: unknown): CinematicProject;
  deleteCinematicProject(id: string): CinematicState;
  generateCinematicProject(input?: Record<string, unknown>): Promise<CinematicState>;
  getClassicShots(): ClassicShotState;
  generateClassicShotProject(input?: Record<string, unknown>): Promise<ClassicShotState>;
  generateClassicShotProjectFromVideo(input: Record<string, unknown>): Promise<ClassicShotState>;
  generateHistory(meta?: Record<string, unknown>): Promise<DashboardData>;
  syncHistoryXhs(): Promise<HistoryXhsState>;
  listSummaries(query?: SummaryListQuery): { entries: SummaryEntry[] };
  getSummary(id: string): SummaryEntry | null;
  createSummary(input: unknown): SummaryEntry;
  updateSummary(id: string, input: unknown): SummaryEntry;
  deleteSummary(id: string): { ok: true };
  generateSummaryDraft(input: { summaryType?: SummaryType; rawInput?: string }): SummaryEntry;
  exportSummaries(): SummaryExportPayload;
  importSummaries(input: unknown): ReturnType<SummaryService["import"]>;
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
  summaryService: SummaryService;
  historyXhsService: HistoryXhsService;
  eventLog?: EventLogService;
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
    options.eventLog?.append({
      level: "info",
      category: "task",
      action: "task.started",
      message: runningTask.summary,
      taskId: runningTask.id,
      agentId: runningTask.agentId
    });
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
      options.eventLog?.append({
        level: result.status === "failed" ? "error" : "info",
        category: result.status === "failed" && input.manifest.id === "history-agent" ? "history-agent" : "task",
        action: result.status === "failed" ? "task.failed" : "task.completed",
        message: result.summary,
        taskId: doneTask.id,
        agentId: input.manifest.id
      });
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
      options.eventBus.emit("task.completed", doneTask);

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
      options.eventLog?.append({
        level: "error",
        category: "task",
        action: "task.failed",
        message: failedTask.resultSummary ?? failedTask.history.at(-1)?.note ?? "Worker failed",
        taskId: failedTask.id,
        agentId: input.manifest.id
      });

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

  function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeShotInput(value: unknown, index: number): CinematicProject["storyboard"][number] {
    const record = asRecord(value);
    const prompt = asRecord(record.prompt);
    const handoff = asString(record.handoff);
    const sceneId = asString(record.sceneId);
    const sceneAnchor = asString(record.sceneAnchor);
    const characterRefs = Array.isArray(record.characterRefs)
      ? record.characterRefs.map(asString).filter(Boolean)
      : [];
    const propRefs = Array.isArray(record.propRefs)
      ? record.propRefs.map(asString).filter(Boolean)
      : [];
    const sceneRef = asString(record.sceneRef);

    return {
      id: asString(record.id) || `shot-${index + 1}`,
      ...(sceneId ? { sceneId } : {}),
      ...(sceneAnchor ? { sceneAnchor } : {}),
      ...(characterRefs.length ? { characterRefs } : {}),
      ...(propRefs.length ? { propRefs } : {}),
      ...(sceneRef ? { sceneRef } : {}),
      title: asString(record.title) || `镜头 ${index + 1}`,
      purpose: asString(record.purpose),
      duration: asString(record.duration),
      cameraMovement: asString(record.cameraMovement),
      shotType: asString(record.shotType),
      composition: asString(record.composition),
      transition: asString(record.transition),
      audioHint: asString(record.audioHint),
      emotionalBeat: asString(record.emotionalBeat),
      ...(handoff ? { handoff } : {}),
      prompt: {
        zh: asString(prompt.zh),
        en: asString(prompt.en)
      }
    };
  }

  function normalizeReferencePromptInput(value: unknown) {
    const record = asRecord(value);
    const zh = asString(record.zh);
    const en = asString(record.en);

    return zh || en ? { zh, en } : null;
  }

  function normalizeReferenceViewsInput(value: unknown) {
    const record = asRecord(value);
    const front = normalizeReferencePromptInput(record.front);
    const side = normalizeReferencePromptInput(record.side);
    const back = normalizeReferencePromptInput(record.back);

    return front && side && back ? { front, side, back } : null;
  }

  function normalizeReferenceAssetsInput(value: unknown): CinematicProject["referenceAssets"] | undefined {
    const record = asRecord(value);
    const characters = (Array.isArray(record.characters) ? record.characters : [])
      .map((item, index) => {
        const asset = asRecord(item);
        const views = normalizeReferenceViewsInput(asset.views);

        return views
          ? {
              id: asString(asset.id) || `character-${index + 1}`,
              name: asString(asset.name) || `人物 ${index + 1}`,
              description: asString(asset.description),
              views
            }
          : null;
      })
      .filter((asset): asset is NonNullable<CinematicProject["referenceAssets"]>["characters"][number] => Boolean(asset));
    const props = (Array.isArray(record.props) ? record.props : [])
      .map((item, index) => {
        const asset = asRecord(item);
        const views = normalizeReferenceViewsInput(asset.views);

        return views
          ? {
              id: asString(asset.id) || `prop-${index + 1}`,
              name: asString(asset.name) || `物品 ${index + 1}`,
              description: asString(asset.description),
              views
            }
          : null;
      })
      .filter((asset): asset is NonNullable<CinematicProject["referenceAssets"]>["props"][number] => Boolean(asset));
    const scenes = (Array.isArray(record.scenes) ? record.scenes : [])
      .map((item, index) => {
        const asset = asRecord(item);
        const prompt = normalizeReferencePromptInput(asset.prompt);

        return prompt
          ? {
              id: asString(asset.id) || `scene-ref-${index + 1}`,
              name: asString(asset.name) || `场景 ${index + 1}`,
              description: asString(asset.description),
              prompt
            }
          : null;
      })
      .filter((asset): asset is NonNullable<CinematicProject["referenceAssets"]>["scenes"][number] => Boolean(asset));

    return characters.length || props.length || scenes.length ? { characters, props, scenes } : undefined;
  }

  function normalizeContinuityInput(value: unknown): CinematicProject["continuity"] | undefined {
    const record = asRecord(value);
    const continuity = {
      actionLine: asString(record.actionLine),
      spatialLine: asString(record.spatialLine),
      emotionalLine: asString(record.emotionalLine),
      visualLine: asString(record.visualLine),
      audioLine: asString(record.audioLine)
    };

    return Object.values(continuity).some(Boolean) ? continuity : undefined;
  }

  function normalizeScenePlanInput(value: unknown): CinematicProject["scenePlan"] | undefined {
    const record = asRecord(value);
    const rawScenes = Array.isArray(record.scenes) ? record.scenes : [];
    const scenes = rawScenes
      .map((item, index) => {
        const scene = asRecord(item);
        const id = asString(scene.id) || `scene-${index + 1}`;
        const name = asString(scene.name) || id;
        const anchor = asString(scene.anchor);
        const role = asString(scene.role);

        return anchor
          ? {
              id,
              name,
              anchor,
              role
            }
          : null;
      })
      .filter((scene): scene is NonNullable<CinematicProject["scenePlan"]>["scenes"][number] => Boolean(scene))
      .slice(0, 3);

    if (!scenes.length) {
      return undefined;
    }

    const sceneCount =
      typeof record.sceneCount === "number" && Number.isInteger(record.sceneCount)
        ? record.sceneCount
        : scenes.length;
    const maxDurationSeconds =
      typeof record.maxDurationSeconds === "number" && Number.isInteger(record.maxDurationSeconds)
        ? record.maxDurationSeconds
        : 15;
    const limitedSceneCount = Math.min(Math.max(sceneCount, 1), 3, scenes.length);

    return {
      sceneCount: limitedSceneCount,
      maxDurationSeconds: Math.min(Math.max(maxDurationSeconds, 1), 15),
      scenes: scenes.slice(0, limitedSceneCount)
    };
  }

  function createProjectFromInput(input: unknown): CinematicProject {
    const record = asRecord(input);
    const now = new Date().toISOString();
    const storyboard = Array.isArray(record.storyboard)
      ? record.storyboard.map(normalizeShotInput)
      : [];
    const scenePlan = normalizeScenePlanInput(record.scenePlan);
    const continuity = normalizeContinuityInput(record.continuity);
    const referenceAssets = normalizeReferenceAssetsInput(record.referenceAssets);

    return {
      id: asString(record.id) || `cinematic-${nanoid()}`,
      title: asString(record.title) || asString(record.concept) || "未命名电影分镜",
      concept: asString(record.concept),
      mood: asString(record.mood),
      script: asString(record.script),
      storyboard,
      ...(referenceAssets ? { referenceAssets } : {}),
      ...(scenePlan ? { scenePlan } : {}),
      ...(continuity ? { continuity } : {}),
      createdAt: asString(record.createdAt) || now,
      updatedAt: now,
      tags: Array.isArray(record.tags)
        ? record.tags.map(asString).filter(Boolean).slice(0, 12)
        : [],
      style: asString(record.style),
      pace: asString(record.pace),
      targetShotCount:
        typeof record.targetShotCount === "number" && Number.isInteger(record.targetShotCount) && record.targetShotCount > 0
          ? record.targetShotCount
          : storyboard.length || 6
    };
  }

  function upsertCinematicProject(project: CinematicProject): CinematicState {
    const current = options.store.getState().cinematic;
    const projects = [project, ...current.projects.filter((item) => item.id !== project.id)].slice(0, 50);
    const projectIds = new Set(projects.map((item) => item.id));
    const recentProjectIds = [project.id, ...current.recentProjectIds.filter((id) => id !== project.id)]
      .filter((id) => projectIds.has(id))
      .slice(0, 12);

    return options.store.setCinematicState({
      projects,
      recentProjectIds,
      lastGeneratedAt: current.lastGeneratedAt,
      status: "idle",
      lastError: null
    });
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
      options.eventBus.emit("task.completed", doneTask);

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
    getCinematic() {
      return options.store.getState().cinematic;
    },
    createCinematicProject(input) {
      const project = createProjectFromInput(input);
      const next = upsertCinematicProject(project);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return next.projects.find((item) => item.id === project.id) ?? project;
    },
    updateCinematicProject(id, input) {
      const current = options.store.getState().cinematic;
      const existing = current.projects.find((project) => project.id === id);

      if (!existing) {
        throw new Error("cinematic project not found");
      }

      const patch = asRecord(input);
      const updated = createProjectFromInput({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        storyboard: Array.isArray(patch.storyboard) ? patch.storyboard : existing.storyboard
      });
      const next = upsertCinematicProject(updated);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return next.projects.find((project) => project.id === id) ?? updated;
    },
    deleteCinematicProject(id) {
      const current = options.store.getState().cinematic;

      if (!current.projects.some((project) => project.id === id)) {
        throw new Error("cinematic project not found");
      }

      const projects = current.projects.filter((project) => project.id !== id);
      const projectIds = new Set(projects.map((project) => project.id));
      const recentProjectIds = current.recentProjectIds.filter((projectId) => projectIds.has(projectId));
      const lastGeneratedAt = recentProjectIds[0]
        ? projects.find((project) => project.id === recentProjectIds[0])?.updatedAt ?? projects[0]?.updatedAt ?? null
        : projects[0]?.updatedAt ?? null;
      const next = options.store.setCinematicState({
        projects,
        recentProjectIds,
        lastGeneratedAt,
        status: "idle",
        lastError: null
      });
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return next;
    },
    async generateCinematicProject(input = {}) {
      const task = await this.runSystemTask({
        agentId: "cinematic-agent",
        trigger: "system",
        summary: "生成电影镜头设计",
        meta: {
          ...input,
          action: "generate"
        }
      });

      if (task.status === "failed") {
        throw new Error(task.resultSummary ?? "cinematic generation failed");
      }

      return options.store.getState().cinematic;
    },
    getClassicShots() {
      return options.store.getState().classicShots;
    },
    async generateClassicShotProject(input = {}) {
      const task = await this.runSystemTask({
        agentId: "classic-shot-agent",
        trigger: "system",
        summary: "生成经典电影镜头复刻",
        meta: {
          ...input,
          action: "generate"
        }
      });

      if (task.status === "failed") {
        throw new Error(task.resultSummary ?? "classic shot generation failed");
      }

      return options.store.getState().classicShots;
    },
    async generateClassicShotProjectFromVideo(input) {
      const task = await this.runSystemTask({
        agentId: "classic-shot-agent",
        trigger: "system",
        summary: "根据上传视频生成相似视频分镜",
        meta: {
          ...input,
          action: "generateFromVideoFrames"
        }
      });

      if (task.status === "failed") {
        throw new Error(task.resultSummary ?? "classic shot video generation failed");
      }

      return options.store.getState().classicShots;
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
    async syncHistoryXhs() {
      const synced = await options.historyXhsService.sync();
      const next = options.store.setHistoryXhsState(synced);

      options.eventBus.emit("dashboard.updated", options.store.getState());

      return next;
    },
    listSummaries(query) {
      return options.summaryService.list(query);
    },
    getSummary(id) {
      return options.summaryService.get(id);
    },
    createSummary(input) {
      const entry = options.summaryService.create(input);
      options.eventBus.emit("dashboard.updated", options.store.getState());
      return entry;
    },
    updateSummary(id, input) {
      const entry = options.summaryService.update(id, input);
      options.eventBus.emit("dashboard.updated", options.store.getState());
      return entry;
    },
    deleteSummary(id) {
      const result = options.summaryService.delete(id);
      options.eventBus.emit("dashboard.updated", options.store.getState());
      return result;
    },
    generateSummaryDraft(input) {
      const draft = options.summaryService.generateDraft(input);
      options.eventBus.emit("dashboard.updated", options.store.getState());
      return draft;
    },
    exportSummaries() {
      return options.summaryService.export();
    },
    importSummaries(input) {
      const result = options.summaryService.import(input);
      options.eventBus.emit("dashboard.updated", options.store.getState());
      return result;
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
