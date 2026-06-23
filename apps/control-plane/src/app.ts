import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createAgentRegistry } from "@agent-zy/agent-registry";
import { SUB_AGENT_MANIFESTS } from "@agent-zy/agent-registry/sub-agents";
import { createHeuristicRouterModel, createHybridRouter } from "@agent-zy/router-core";

import { createAgentWorkerPool } from "./runtime/agent-pool";
import { createEventBus } from "./services/events";
import { createEventLogService } from "./services/event-log-service";
import { createHistoryXhsService, type HistoryXhsService } from "./services/history-xhs-service";
import { createLedgerReportService } from "./services/ledger-report-service";
import { createLedgerSemanticService } from "./services/ledger-semantic-service";
import { createModelSecretsRepository } from "./services/model-secrets";
import { getModelProvider, listModelProviders } from "./services/model-providers";
import { createModelRuntime } from "./services/model-runtime";
import type { ModelRuntime } from "./services/model-runtime";
import { createControlPlaneOrchestrator } from "./services/orchestrator";
import { createFileOrganizerService } from "./services/file-organizer-service";
import { createPhotoRenamerService } from "./services/photo-renamer-service";
import { createPromptTemplateService } from "./services/prompt-template-service";
import { createChildMealService } from "./services/child-meal-service";
import { createImageToVideoPlannerService } from "./services/image-to-video-planner-service";
import { createMhxyService } from "./services/mhxy-service";
import { createControlPlaneScheduler } from "./services/scheduler";
import { createControlPlaneStore } from "./services/store";
import { createSummaryService } from "./services/summary-service";
import { normalizeExternalUrl, openExternalUrlInBrowser, type ExternalUrlOpener } from "./services/browser-opener";
import {
  createDesktopBrowserAutomationExecutor,
  openDesktopAutomationPermissionSettings
} from "./services/browser-automation-desktop-executor";
import {
  createBrowserAutomationExampleWorkflow
} from "./services/browser-automation-workflow";
import {
  createBrowserAutomationService,
  type BrowserAutomationExecutor
} from "./services/browser-automation-service";
import {
  cleanupClassicShotVideoWorkDir,
  createClassicShotVideoProcessor,
  type ClassicShotVideoProcessor
} from "./services/classic-shot-video-service";
import { restartProjectWithScript, type ProjectRestarter } from "./services/system-restart";
import { isLocalBrowserRequest, parseFallbackMultipartImage, parseFallbackMultipartUpload } from "./app-helpers";

const CLASSIC_SHOT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const CLASSIC_SHOT_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export function createControlPlaneApp(options?: {
  dataDir?: string;
  startSchedulers?: boolean;
  openExternalUrl?: ExternalUrlOpener;
  restartProject?: ProjectRestarter;
  historyXhsService?: HistoryXhsService;
  classicShotVideoProcessor?: ClassicShotVideoProcessor;
  browserAutomationExecutor?: BrowserAutomationExecutor;
  modelRuntime?: ModelRuntime;
}) {
  const app = Fastify();
  const startedAt = new Date().toISOString();
  const eventBus = createEventBus();
  const registry = createAgentRegistry();
  registry.registerMany(SUB_AGENT_MANIFESTS);

  const dataDir = options?.dataDir ?? ".agent-zy-data";
  const store = createControlPlaneStore(dataDir);
  const eventLog = createEventLogService(dataDir);
  const photoRenamer = createPhotoRenamerService();
  const fileOrganizer = createFileOrganizerService();
  const modelSecrets = createModelSecretsRepository(dataDir);
  const modelRuntime = options?.modelRuntime ?? createModelRuntime({
    store,
    secrets: modelSecrets,
    eventLog
  });
  const browserAutomationExecutor = options?.browserAutomationExecutor ?? createDesktopBrowserAutomationExecutor({
    modelRuntime
  });
  const browserAutomation = createBrowserAutomationService({
    store,
    executor: browserAutomationExecutor
  });
  if ((store.getState().browserAutomation?.workflows ?? []).length === 0) {
    browserAutomation.createWorkflow(createBrowserAutomationExampleWorkflow(new Date().toISOString()));
  }
  const ledgerSemanticService = createLedgerSemanticService();
  const ledgerReportService = createLedgerReportService();
  const summaryService = createSummaryService(store);
  const promptTemplateService = createPromptTemplateService({
    store,
    modelRuntime
  });
  const childMealService = createChildMealService({
    store,
    modelRuntime
  });
  const imageToVideoPlanner = createImageToVideoPlannerService({
    dataDir,
    store,
    modelRuntime
  });
  const mhxyService = createMhxyService(dataDir);
  const historyXhsService = options?.historyXhsService ?? createHistoryXhsService();
  const classicShotVideoProcessor = options?.classicShotVideoProcessor ?? createClassicShotVideoProcessor();
  const router = createHybridRouter({
    model: createHeuristicRouterModel()
  });
  const workerPool = createAgentWorkerPool({
    eventBus,
    modelRuntime,
    eventLog
  });
  const orchestrator = createControlPlaneOrchestrator({
    store,
    registry,
    router,
    workerPool,
    eventBus,
    ledgerSemanticService,
    ledgerReportService,
    summaryService,
    historyXhsService,
    eventLog
  });
  const scheduler = createControlPlaneScheduler({
    orchestrator,
    store
  });
  eventBus.subscribe((event) => {
    if (event.type !== "task.completed") {
      return;
    }

    void browserAutomation.handleTaskCompleted(event.payload as any);
  });

  void app.register(cors, {
    origin: true
  });
  const shouldLogApiRequest = (url: string) =>
    !url.startsWith("/api/logs") &&
    url !== "/api/stream" &&
    url !== "/api/health" &&
    url !== "/api/system/status";

  app.addHook("onRequest", async (request) => {
    if (!shouldLogApiRequest(request.url)) {
      return;
    }

    (request as typeof request & { eventLogStartedAt?: number }).eventLogStartedAt = Date.now();
    eventLog.append({
      level: "info",
      category: "api",
      action: "request.started",
      message: `${request.method} ${request.url}`
    });
  });
  app.addHook("onResponse", async (request, reply) => {
    if (!shouldLogApiRequest(request.url)) {
      return;
    }

    const startedAt = (request as typeof request & { eventLogStartedAt?: number }).eventLogStartedAt;
    eventLog.append({
      level: reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info",
      category: "api",
      action: "request.completed",
      message: `${request.method} ${request.url}`,
      durationMs: startedAt ? Date.now() - startedAt : undefined,
      details: {
        statusCode: reply.statusCode
      }
    });
  });
  app.addContentTypeParser(
    /^multipart\/form-data/i,
    {
      bodyLimit: CLASSIC_SHOT_VIDEO_MAX_BYTES,
      parseAs: "buffer"
    },
    (_request, body, done) => {
      done(null, body);
    }
  );

  app.get("/api/health", async () => ({
    ok: true
  }));

  app.post("/api/system/restart", async (_request, reply) => {
    await (options?.restartProject ?? restartProjectWithScript)();

    return reply.code(202).send({
      ok: true
    });
  });

  app.get("/api/system/status", async () => ({
    ok: true,
    startedAt
  }));

  app.get("/api/dashboard", async () => orchestrator.getDashboard());

  function rejectRemotePhotoRenamerRequest(request: { headers: Record<string, unknown> }, reply: any) {
    if (isLocalBrowserRequest(request.headers.origin)) {
      return false;
    }

    reply.code(403).send({
      message: "photo renamer is only available from a local browser"
    });
    return true;
  }

  function rejectRemoteFileOrganizerRequest(request: { headers: Record<string, unknown> }, reply: any) {
    if (isLocalBrowserRequest(request.headers.origin)) {
      return false;
    }

    reply.code(403).send({
      message: "file organizer is only available from a local browser"
    });
    return true;
  }

  app.post("/api/tools/photo-renamer/preview", async (request, reply) => {
    if (rejectRemotePhotoRenamerRequest(request, reply)) {
      return reply;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();

    try {
      const mediaScope = body.mediaScope === "images" || body.mediaScope === "videos" ? body.mediaScope : "all";
      const result = await photoRenamer.preview(typeof body.directoryPath === "string" ? body.directoryPath : "", mediaScope);
      eventLog.append({
        level: "info",
        category: "tool",
        action: "photo-renamer.preview.completed",
        message: "媒体重命名预览完成",
        durationMs: Date.now() - startedAt,
        details: result.summary
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "photo-renamer.preview.failed",
        message: "媒体重命名预览失败",
        durationMs: Date.now() - startedAt
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to preview media renames"
      });
    }
  });

  app.post("/api/tools/photo-renamer/execute", async (request, reply) => {
    if (rejectRemotePhotoRenamerRequest(request, reply)) {
      return reply;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();

    try {
      const result = await photoRenamer.execute(typeof body.previewToken === "string" ? body.previewToken : "");
      eventLog.append({
        level: "info",
        category: "tool",
        action: "photo-renamer.execute.completed",
        message: "媒体重命名执行完成",
        durationMs: Date.now() - startedAt,
        details: result.summary
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "photo-renamer.execute.failed",
        message: "媒体重命名执行失败",
        durationMs: Date.now() - startedAt
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to execute media renames"
      });
    }
  });

  app.post("/api/tools/photo-renamer/undo", async (request, reply) => {
    if (rejectRemotePhotoRenamerRequest(request, reply)) {
      return reply;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();

    try {
      const result = await photoRenamer.undo(typeof body.undoToken === "string" ? body.undoToken : "");
      eventLog.append({
        level: "info",
        category: "tool",
        action: "photo-renamer.undo.completed",
        message: "媒体重命名撤销完成",
        durationMs: Date.now() - startedAt,
        details: result.summary
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "photo-renamer.undo.failed",
        message: "媒体重命名撤销失败",
        durationMs: Date.now() - startedAt
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to undo media renames"
      });
    }
  });

  app.post("/api/tools/file-organizer/preview", async (request, reply) => {
    if (rejectRemoteFileOrganizerRequest(request, reply)) {
      return reply;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();
    const mode = body.mode === "type" ? "type" : "time";
    const timeGranularity = body.timeGranularity === "day" || body.timeGranularity === "year"
      ? body.timeGranularity
      : body.timeGranularity === "month"
        ? "month"
        : undefined;

    try {
      const result = await fileOrganizer.preview({
        directoryPath: typeof body.directoryPath === "string" ? body.directoryPath : "",
        mode,
        timeGranularity
      });
      eventLog.append({
        level: "info",
        category: "tool",
        action: "file-organizer.preview.completed",
        message: "文件整理预览完成",
        durationMs: Date.now() - startedAt,
        details: {
          mode: result.mode,
          timeGranularity: result.timeGranularity,
          ...result.summary
        }
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "file-organizer.preview.failed",
        message: "文件整理预览失败",
        durationMs: Date.now() - startedAt,
        details: { mode, timeGranularity: timeGranularity ?? null }
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to preview file organization"
      });
    }
  });

  app.post("/api/tools/file-organizer/execute", async (request, reply) => {
    if (rejectRemoteFileOrganizerRequest(request, reply)) {
      return reply;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();

    try {
      const result = await fileOrganizer.execute(typeof body.previewToken === "string" ? body.previewToken : "");
      eventLog.append({
        level: "info",
        category: "tool",
        action: "file-organizer.execute.completed",
        message: "文件整理执行完成",
        durationMs: Date.now() - startedAt,
        details: result.summary
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "file-organizer.execute.failed",
        message: "文件整理执行失败",
        durationMs: Date.now() - startedAt
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to execute file organization"
      });
    }
  });

  app.post("/api/tools/file-organizer/undo", async (request, reply) => {
    if (rejectRemoteFileOrganizerRequest(request, reply)) {
      return reply;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const startedAt = Date.now();

    try {
      const result = await fileOrganizer.undo(typeof body.undoToken === "string" ? body.undoToken : "");
      eventLog.append({
        level: "info",
        category: "tool",
        action: "file-organizer.undo.completed",
        message: "文件整理撤销完成",
        durationMs: Date.now() - startedAt,
        details: result.summary
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "file-organizer.undo.failed",
        message: "文件整理撤销失败",
        durationMs: Date.now() - startedAt
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to undo file organization"
      });
    }
  });

  app.get("/api/tools/prompt-templates", async () => promptTemplateService.list());

  app.post("/api/tools/prompt-templates", async (request, reply) => {
    const startedAt = Date.now();

    try {
      const template = await promptTemplateService.create(request.body);
      eventLog.append({
        level: template.analysisStatus === "failed" ? "warn" : "info",
        category: "tool",
        action: "prompt-template.create.completed",
        message: "提示词模版保存完成",
        durationMs: Date.now() - startedAt,
        details: {
          templateId: template.id,
          variableCount: template.variables.length,
          analysisStatus: template.analysisStatus
        }
      });
      return template;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "prompt-template.create.failed",
        message: "提示词模版保存失败",
        durationMs: Date.now() - startedAt
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to create prompt template"
      });
    }
  });

  app.patch("/api/tools/prompt-templates/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return promptTemplateService.update(params.id, request.body);
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "prompt template not found"
      });
    }
  });

  app.delete("/api/tools/prompt-templates/:id", async (request) => {
    const params = request.params as { id: string };

    return promptTemplateService.delete(params.id);
  });

  app.post("/api/tools/prompt-templates/:id/apply", async (request, reply) => {
    const params = request.params as { id: string };
    const startedAt = Date.now();

    try {
      const result = await promptTemplateService.apply(params.id, request.body);
      eventLog.append({
        level: "info",
        category: "tool",
        action: "prompt-template.apply.completed",
        message: "提示词模版复用完成",
        durationMs: Date.now() - startedAt,
        details: {
          templateId: result.templateId
        }
      });
      return result;
    } catch (error) {
      eventLog.append({
        level: "warn",
        category: "tool",
        action: "prompt-template.apply.failed",
        message: "提示词模版复用失败",
        durationMs: Date.now() - startedAt,
        details: {
          templateId: params.id
        }
      });
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to apply prompt template"
      });
    }
  });

  const childMealError = (reply: any, error: unknown, statusCode = 400) =>
    reply.code(statusCode).send({ message: error instanceof Error ? error.message : "孩子食谱操作失败" });

  app.get("/api/tools/child-meal/overview", async () => childMealService.getOverview());
  app.get("/api/tools/child-meal/profile", async () => childMealService.getOverview());
  app.post("/api/tools/child-meal/profile", async (request, reply) => {
    try { return childMealService.updateProfile(request.body); } catch (error) { return childMealError(reply, error); }
  });
  app.get("/api/tools/child-meal/notes", async (request) => childMealService.listNotes((request.query ?? {}) as Record<string, unknown>));
  app.post("/api/tools/child-meal/notes", async (request, reply) => {
    try { return childMealService.createNote(request.body); } catch (error) { return childMealError(reply, error); }
  });
  app.put("/api/tools/child-meal/notes/:id", async (request, reply) => {
    try { return childMealService.updateNote((request.params as { id: string }).id, request.body); } catch (error) { return childMealError(reply, error, 404); }
  });
  app.delete("/api/tools/child-meal/notes/:id", async (request, reply) => {
    try { return childMealService.deleteNote((request.params as { id: string }).id); } catch (error) { return childMealError(reply, error, 404); }
  });
  app.get("/api/tools/child-meal/records", async (request) => childMealService.listRecords((request.query ?? {}) as Record<string, unknown>));
  app.post("/api/tools/child-meal/records", async (request, reply) => {
    try { return childMealService.createRecord(request.body); } catch (error) { return childMealError(reply, error); }
  });
  app.put("/api/tools/child-meal/records/:id", async (request, reply) => {
    try { return childMealService.updateRecord((request.params as { id: string }).id, request.body); } catch (error) { return childMealError(reply, error, 404); }
  });
  app.delete("/api/tools/child-meal/records/:id", async (request, reply) => {
    try { return childMealService.deleteRecord((request.params as { id: string }).id); } catch (error) { return childMealError(reply, error, 404); }
  });
  app.post("/api/tools/child-meal/records/from-plan", async (request, reply) => {
    try { return childMealService.convertMealToRecord(request.body); } catch (error) { return childMealError(reply, error); }
  });
  app.post("/api/tools/child-meal/generate-plan", async (request, reply) => {
    try {
      return await childMealService.generatePlan(request.body as any);
    } catch (error) {
      return childMealError(reply, error);
    }
  });
  app.post("/api/tools/child-meal/save-plan", async (request, reply) => {
    try { return childMealService.savePlan(request.body); } catch (error) { return childMealError(reply, error); }
  });

  app.get("/api/logs", async (request) => {
    const query = (request.query ?? {}) as Record<string, unknown>;

    return eventLog.query({
      level: typeof query.level === "string" ? query.level as any : undefined,
      category: typeof query.category === "string" ? query.category : undefined,
      agentId: typeof query.agentId === "string" ? query.agentId : undefined,
      taskId: typeof query.taskId === "string" ? query.taskId : undefined,
      requestId: typeof query.requestId === "string" ? query.requestId : undefined,
      q: typeof query.q === "string" ? query.q : undefined,
      cursor: typeof query.cursor === "string" ? query.cursor : undefined,
      limit: typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : undefined
    });
  });

  app.post("/api/logs/client-events", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "frontend";
    const action = typeof body.action === "string" && body.action.trim() ? body.action.trim() : "interaction";
    const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : action;
    const details = body.details && typeof body.details === "object" && !Array.isArray(body.details)
      ? body.details as Record<string, unknown>
      : undefined;

    eventLog.append({
      level: body.level === "error" || body.level === "warn" || body.level === "debug" ? body.level : "info",
      category,
      action,
      message,
      taskId: typeof body.taskId === "string" ? body.taskId : undefined,
      agentId: typeof body.agentId === "string" ? body.agentId : undefined,
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      details
    });

    return reply.code(202).send({ ok: true });
  });

  app.delete("/api/logs", async () => {
    eventLog.clear();
    return { ok: true };
  });

  function serializeModelProfile(profile: ReturnType<typeof store.getState>["modelSettings"]["profiles"][number]) {
    return {
      ...profile,
      ...modelSecrets.getStatus({
        profileId: profile.id,
        provider: profile.provider
      })
    };
  }

  function parseModelProfileInput(input: unknown) {
    const body = (input ?? {}) as Record<string, unknown>;
    const provider = typeof body.provider === "string" ? body.provider : "modelscope";

    if (!getModelProvider(provider as any)) {
      throw new Error("unsupported model provider");
    }

    return {
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      provider: provider as any,
      modelName: typeof body.modelName === "string" ? body.modelName : "",
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : "",
      apiKeyRef: null,
      capabilities: Array.isArray(body.capabilities) ? (body.capabilities as any) : [],
      purpose: Array.isArray(body.purpose) ? (body.purpose as any) : [],
      temperature: typeof body.temperature === "number" ? body.temperature : null,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : null,
      enabled: Boolean(body.enabled),
      isDefault: Boolean(body.isDefault),
      apiKey: typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : null
    };
  }

  function parseFrameCount(value: unknown) {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;

    if (!Number.isInteger(parsed)) {
      return 6;
    }

    if (parsed < 3 || parsed > 8) {
      throw new Error("抽帧数量必须在 3 到 8 之间");
    }

    return parsed;
  }

  async function parseClassicShotVideoUpload(request: any) {
    if (typeof request.parts !== "function") {
      const upload = parseFallbackMultipartUpload(request.headers["content-type"], request.body);

      if (!CLASSIC_SHOT_VIDEO_TYPES.has(upload.video.mimetype)) {
        throw new Error("仅支持 mp4、mov、webm 视频文件");
      }

      return {
        video: upload.video,
        targetPlatform: upload.fields.targetPlatform,
        revisionInstruction:
          upload.fields.revisionInstruction?.trim() ||
          "保留镜头结构，改变画面风格和场景，避免生成一模一样的视频",
        frameCount: parseFrameCount(upload.fields.frameCount)
      };
    }

    const parts = request.parts();
    const fields: Record<string, string> = {};
    let video:
      | {
          filename: string;
          mimetype: string;
          buffer: Buffer;
        }
      | null = null;

    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname !== "video") {
          part.file.resume();
          continue;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        for await (const chunk of part.file) {
          const buffer = Buffer.from(chunk);
          size += buffer.length;

          if (size > CLASSIC_SHOT_VIDEO_MAX_BYTES) {
            throw new Error("上传视频不能超过 100MB");
          }

          chunks.push(buffer);
        }

        video = {
          filename: part.filename || "uploaded-video",
          mimetype: part.mimetype || "",
          buffer: Buffer.concat(chunks)
        };
        continue;
      }

      fields[part.fieldname] = String(part.value ?? "");
    }

    if (!video) {
      throw new Error("请上传 video 文件");
    }

    if (!CLASSIC_SHOT_VIDEO_TYPES.has(video.mimetype)) {
      throw new Error("仅支持 mp4、mov、webm 视频文件");
    }

    return {
      video,
      targetPlatform: fields.targetPlatform,
      revisionInstruction:
        fields.revisionInstruction?.trim() ||
        "保留镜头结构，改变画面风格和场景，避免生成一模一样的视频",
      frameCount: parseFrameCount(fields.frameCount)
    };
  }

  app.get("/api/model-providers", async () => ({
    providers: listModelProviders()
  }));

  app.get("/api/model-profiles", async () => ({
    profiles: store.getState().modelSettings.profiles.map(serializeModelProfile),
    settings: store.getState().modelSettings,
    agents: registry.list().map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      capabilities: manifest.capabilities
    }))
  }));

  app.post("/api/model-profiles", async (request, reply) => {
    try {
      const input = parseModelProfileInput(request.body);
      const profile = store.createModelProfile({
        id: `model-${randomUUID()}`,
        displayName: input.displayName,
        provider: input.provider,
        modelName: input.modelName,
        baseUrl: input.baseUrl,
        apiKeyRef: input.apiKey ? "local" : null,
        capabilities: input.capabilities,
        purpose: input.purpose,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        enabled: input.enabled,
        isDefault: input.isDefault
      });

      if (input.apiKey) {
        modelSecrets.save(profile.id, input.apiKey);
        store.updateModelProfile(profile.id, {
          apiKeyRef: `secret:${profile.id}`
        });
      }

      return serializeModelProfile(
        store.getState().modelSettings.profiles.find((item) => item.id === profile.id) ?? profile
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid model profile"
      });
    }
  });

  app.patch("/api/model-profiles/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    try {
      const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : null;
      const patch = { ...body };
      delete patch.apiKey;
      const updated = store.updateModelProfile(params.id, patch as any);

      if (apiKey) {
        modelSecrets.save(updated.id, apiKey);
        store.updateModelProfile(updated.id, {
          apiKeyRef: `secret:${updated.id}`
        });
      }

      return serializeModelProfile(
        store.getState().modelSettings.profiles.find((item) => item.id === params.id) ?? updated
      );
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "model profile not found"
      });
    }
  });

  app.delete("/api/model-profiles/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      const result = store.deleteModelProfile(params.id);
      modelSecrets.delete(params.id);
      return result;
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "model profile not found"
      });
    }
  });

  app.post("/api/model-profiles/:id/test", async (request) => {
    const params = request.params as { id: string };

    return modelRuntime.testConnection(params.id);
  });

  app.post("/api/model-profiles/default", async (request, reply) => {
    const body = (request.body ?? {}) as { profileId?: unknown };

    try {
      return store.setDefaultModelProfile(typeof body.profileId === "string" ? body.profileId : "");
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "model profile not found"
      });
    }
  });

  app.post("/api/model-profiles/purpose-default", async (request, reply) => {
    const body = (request.body ?? {}) as { purpose?: any; profileId?: unknown };

    try {
      return store.setPurposeDefault(
        body.purpose,
        typeof body.profileId === "string" ? body.profileId : null
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid purpose default"
      });
    }
  });

  app.post("/api/model-profiles/agent-default", async (request, reply) => {
    const body = (request.body ?? {}) as { agentId?: unknown; profileId?: unknown };

    try {
      return store.setAgentDefaultModelProfile(
        typeof body.agentId === "string" ? body.agentId : "",
        typeof body.profileId === "string" ? body.profileId : null
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid agent default"
      });
    }
  });

  app.get("/api/home-layout", async () => orchestrator.getHomeLayout());

  app.put("/api/home-layout", async (request) => {
    const body = (request.body ?? {}) as {
      layout?: unknown;
    };

    return orchestrator.saveHomeLayout(Array.isArray(body.layout) ? (body.layout as any) : []);
  });

  app.delete("/api/notifications/:id", async (request) => {
    const params = request.params as {
      id: string;
    };

    return orchestrator.cancelNotification(params.id);
  });

  app.get("/api/news", async () => orchestrator.getNews());

  app.get("/api/browser-automation", async () => browserAutomation.getState());

  app.post("/api/browser-automation/permissions/open", async (request, reply) => {
    const body = request.body as { kind?: unknown };

    if (body.kind !== "accessibility" && body.kind !== "screen-recording") {
      return reply.code(400).send({ error: "kind must be accessibility or screen-recording" });
    }

    return openDesktopAutomationPermissionSettings(body.kind);
  });

  app.post("/api/browser-automation/workflows", async (request, reply) => {
    try {
      return browserAutomation.createWorkflow(request.body);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid browser automation workflow"
      });
    }
  });

  app.patch("/api/browser-automation/workflows/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return browserAutomation.updateWorkflow(params.id, request.body);
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "browser automation workflow not found"
      });
    }
  });

  app.delete("/api/browser-automation/workflows/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return browserAutomation.deleteWorkflow(params.id);
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "browser automation workflow not found"
      });
    }
  });

  app.post("/api/browser-automation/workflows/:id/run", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    try {
      return await browserAutomation.runWorkflow(params.id, {
        trigger: body.trigger === "schedule" || body.trigger === "system" ? body.trigger : "user"
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to run browser automation workflow"
      });
    }
  });

  app.post("/api/browser-automation/runs/:id/stop", async (request) => {
    const params = request.params as { id: string };

    return browserAutomation.stopRun(params.id);
  });

  app.post("/api/browser-automation/trigger-rules", async (request, reply) => {
    try {
      return browserAutomation.createTriggerRule(request.body);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid browser automation trigger rule"
      });
    }
  });

  app.post("/api/open-url", async (request, reply) => {
    const body = (request.body ?? {}) as {
      url?: unknown;
    };
    const url = normalizeExternalUrl(body.url);

    if (!url) {
      return reply.code(400).send({
        message: "url must be an http or https URL"
      });
    }

    await (options?.openExternalUrl ?? openExternalUrlInBrowser)(url);

    return {
      ok: true
    };
  });

  app.get("/api/topics", async () => orchestrator.getTopics());

  app.get("/api/cinematic", async () => orchestrator.getCinematic());

  app.post("/api/cinematic/projects", async (request, reply) => {
    try {
      return orchestrator.createCinematicProject(request.body);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid cinematic project"
      });
    }
  });

  app.patch("/api/cinematic/projects/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return orchestrator.updateCinematicProject(params.id, request.body);
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "cinematic project not found"
      });
    }
  });

  app.delete("/api/cinematic/projects/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return orchestrator.deleteCinematicProject(params.id);
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "cinematic project not found"
      });
    }
  });

  app.post("/api/cinematic/generate", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    return orchestrator.generateCinematicProject(body);
  });

  app.get("/api/image-to-video/projects", async () => imageToVideoPlanner.listProjects());

  app.get("/api/image-to-video/projects/:id", async (request, reply) => {
    try {
      return imageToVideoPlanner.getProject((request.params as { id: string }).id);
    } catch (error) {
      return reply.code(404).send({ message: error instanceof Error ? error.message : "项目不存在" });
    }
  });

  app.delete("/api/image-to-video/projects/:id", async (request, reply) => {
    try {
      return imageToVideoPlanner.deleteProject((request.params as { id: string }).id);
    } catch (error) {
      return reply.code(404).send({ message: error instanceof Error ? error.message : "项目不存在" });
    }
  });

  app.get("/api/image-to-video/assets/:projectId/:assetId", async (request, reply) => {
    try {
      const params = request.params as { projectId: string; assetId: string };
      const result = imageToVideoPlanner.readAsset(params.projectId, params.assetId);
      return reply.type(result.asset.mimeType).send(result.buffer);
    } catch (error) {
      return reply.code(404).send({ message: error instanceof Error ? error.message : "图片不存在" });
    }
  });

  app.post("/api/image-to-video/analyze", async (request, reply) => {
    try {
      const upload = parseFallbackMultipartImage(request.headers["content-type"], request.body);
      return await imageToVideoPlanner.analyze({
        projectId: upload.fields.projectId || undefined,
        fileName: upload.image.filename,
        mimeType: upload.image.mimetype,
        buffer: upload.image.buffer
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "图片分析失败" });
    }
  });

  app.post("/api/image-to-video/plan", async (request, reply) => {
    try {
      return await imageToVideoPlanner.plan(String((request.body as any)?.projectId ?? ""));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "视频方案生成失败" });
    }
  });

  app.post("/api/image-to-video/keyframes", async (request, reply) => {
    try {
      return await imageToVideoPlanner.planKeyframes(String((request.body as any)?.projectId ?? ""));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "关键帧规划失败" });
    }
  });

  app.post("/api/image-to-video/review-keyframe", async (request, reply) => {
    try {
      const upload = parseFallbackMultipartImage(request.headers["content-type"], request.body);
      return await imageToVideoPlanner.reviewKeyframe(upload.fields.projectId, upload.fields.keyframeId, {
        fileName: upload.image.filename,
        mimeType: upload.image.mimetype,
        buffer: upload.image.buffer
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "关键帧审核失败" });
    }
  });

  app.post("/api/image-to-video/keyframes/:keyframeId/override", async (request, reply) => {
    try {
      return imageToVideoPlanner.overrideKeyframe(
        String((request.body as any)?.projectId ?? ""),
        (request.params as { keyframeId: string }).keyframeId
      );
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "人工通过失败" });
    }
  });

  app.post("/api/image-to-video/final-prompt", async (request, reply) => {
    try {
      return await imageToVideoPlanner.generateFinalPrompt(String((request.body as any)?.projectId ?? ""));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "最终提示词生成失败" });
    }
  });

  app.get("/api/classic-shots", async () => orchestrator.getClassicShots());

  app.post("/api/classic-shots/generate", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    return orchestrator.generateClassicShotProject(body);
  });

  app.post("/api/classic-shots/generate-from-video", async (request, reply) => {
    let workDir: string | null = null;

    try {
      const upload = await parseClassicShotVideoUpload(request);
      const taskId = randomUUID();
      workDir = join(dataDir, "tmp", "classic-shots", taskId);
      await mkdir(workDir, { recursive: true });
      const videoPath = join(workDir, upload.video.filename.replace(/[^\w.-]/g, "_") || "uploaded-video");

      await writeFile(videoPath, upload.video.buffer);

      const extracted = await classicShotVideoProcessor.extractFrames({
        videoPath,
        workDir,
        frameCount: upload.frameCount
      });

      return await orchestrator.generateClassicShotProjectFromVideo({
        input: `上传视频复刻：${upload.video.filename}`,
        targetPlatform: upload.targetPlatform,
        revisionInstruction: upload.revisionInstruction,
        videoReference: {
          fileName: upload.video.filename,
          durationSeconds: extracted.durationSeconds,
          extractedFrameCount: extracted.frames.length
        },
        frames: extracted.frames
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "classic shot video generation failed"
      });
    } finally {
      if (workDir) {
        await cleanupClassicShotVideoWorkDir(workDir);
      }
    }
  });

  app.get("/api/summaries", async (request) => {
    const query = request.query as Record<string, string | undefined>;

    return orchestrator.listSummaries({
      summaryType:
        query.summaryType === "daily" ||
        query.summaryType === "weekly" ||
        query.summaryType === "monthly" ||
        query.summaryType === "yearly"
          ? query.summaryType
          : undefined,
      q: query.q,
      start: query.start,
      end: query.end
    });
  });

  app.get("/api/summaries/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const entry = orchestrator.getSummary(params.id);

    if (!entry) {
      return reply.code(404).send({
        message: "summary not found"
      });
    }

    return entry;
  });

  app.post("/api/summaries", async (request, reply) => {
    try {
      return orchestrator.createSummary(request.body);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid summary"
      });
    }
  });

  app.patch("/api/summaries/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return orchestrator.updateSummary(params.id, request.body);
    } catch (error) {
      return reply.code(404).send({
        message: error instanceof Error ? error.message : "summary not found"
      });
    }
  });

  app.delete("/api/summaries/:id", async (request) => {
    const params = request.params as { id: string };

    return orchestrator.deleteSummary(params.id);
  });

  app.post("/api/summaries/generate-draft", async (request, reply) => {
    const body = (request.body ?? {}) as { summaryType?: any; rawInput?: any };

    try {
      return orchestrator.generateSummaryDraft(body);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "failed to generate summary draft"
      });
    }
  });

  app.post("/api/summaries/export", async () => orchestrator.exportSummaries());

  app.post("/api/summaries/import", async (request, reply) => {
    try {
      return orchestrator.importSummaries(request.body);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "invalid summary import payload"
      });
    }
  });

  app.post("/api/topics/generate", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    return orchestrator.generateTopics(body);
  });

  app.post("/api/history/generate", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    console.info("[history-generate] route:start", {
      body
    });
    return orchestrator.generateHistory(body);
  });

  app.post("/api/history/xhs/sync", async () => orchestrator.syncHistoryXhs());

  app.post("/api/news/refresh", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    return orchestrator.refreshNews(body);
  });

  app.post("/api/chat", async (request) => {
    const body = request.body as {
      message: string;
    };

    return orchestrator.handleChat(body.message);
  });

  app.post("/api/ledger/record", async (request, reply) => {
    const body = (request.body ?? {}) as {
      message?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (message.length === 0) {
      return reply.code(400).send({
        message: "message is required"
      });
    }

    return orchestrator.handleLedgerChat(message);
  });

  app.get("/api/ledger/timeline", async () => orchestrator.getLedgerTimeline());

  app.get("/api/ledger/reports", async () => orchestrator.getLedgerReports());

  app.get("/api/ledger/stages", async () => orchestrator.getLedgerStages());

  app.post("/api/ledger/chat", async (request) => {
    const body = (request.body ?? {}) as {
      message?: unknown;
    };

    return orchestrator.handleLedgerChat(typeof body.message === "string" ? body.message : "");
  });

  const mhxyAction = async (reply: { code(statusCode: number): { send(payload: unknown): unknown } }, action: () => unknown) => {
    try {
      return action();
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "梦幻西游账本操作失败"
      });
    }
  };

  app.get("/api/mhxy", async () => mhxyService.getDashboard());

  app.post("/api/mhxy/trades", async (request, reply) =>
    mhxyAction(reply, () => mhxyService.createTrade((request.body ?? {}) as any))
  );

  app.patch("/api/mhxy/trades/:id", async (request, reply) =>
    mhxyAction(reply, () =>
      mhxyService.updateTrade((request.params as { id: string }).id, (request.body ?? {}) as any)
    )
  );

  app.post("/api/mhxy/asset-flips", async (request, reply) =>
    mhxyAction(reply, () => mhxyService.createAssetFlip((request.body ?? {}) as any))
  );

  app.patch("/api/mhxy/asset-flips/:id", async (request, reply) =>
    mhxyAction(reply, () =>
      mhxyService.updateAssetFlip((request.params as { id: string }).id, (request.body ?? {}) as any)
    )
  );

  app.post("/api/mhxy/price-snapshots", async (request, reply) =>
    mhxyAction(reply, () => mhxyService.createPriceSnapshot((request.body ?? {}) as any))
  );

  app.post("/api/mhxy/inventory-transfers", async (request, reply) =>
    mhxyAction(reply, () => mhxyService.createInventoryTransfer((request.body ?? {}) as any))
  );

  app.patch("/api/mhxy/inventory-transfers/:id", async (request, reply) =>
    mhxyAction(reply, () =>
      mhxyService.updateInventoryTransfer(
        (request.params as { id: string }).id,
        (request.body ?? {}) as any
      )
    )
  );

  app.put("/api/mhxy/inventory-targets", async (request, reply) =>
    mhxyAction(reply, () => mhxyService.setInventoryTarget((request.body ?? {}) as any))
  );

  app.get("/api/stream", async (_request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const sendEvent = (event: { type: string; payload: unknown }) => {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    };

    sendEvent({
      type: "dashboard.bootstrap",
      payload: orchestrator.getDashboard()
    });

    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === "dashboard.updated" || event.type === "runtime.updated") {
        sendEvent({
          type: event.type,
          payload: orchestrator.getDashboard()
        });
      }
    });

    reply.raw.on("close", () => {
      unsubscribe();
    });

    return reply;
  });

  app.addHook("onClose", async () => {
    scheduler.stop();
    await workerPool.close();
  });

  if (options?.startSchedulers !== false) {
    scheduler.start();
  }

  return app;
}
