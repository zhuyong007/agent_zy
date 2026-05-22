import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";

import { createAgentRegistry } from "@agent-zy/agent-registry";
import { SUB_AGENT_MANIFESTS } from "@agent-zy/agent-registry/sub-agents";
import { createHeuristicRouterModel, createHybridRouter } from "@agent-zy/router-core";

import { createAgentWorkerPool } from "./runtime/agent-pool";
import { createEventBus } from "./services/events";
import { createLedgerReportService } from "./services/ledger-report-service";
import { createLedgerSemanticService } from "./services/ledger-semantic-service";
import { createModelSecretsRepository } from "./services/model-secrets";
import { getModelProvider, listModelProviders } from "./services/model-providers";
import { createModelRuntime } from "./services/model-runtime";
import { createControlPlaneOrchestrator } from "./services/orchestrator";
import { createControlPlaneScheduler } from "./services/scheduler";
import { createControlPlaneStore } from "./services/store";
import { createSummaryService } from "./services/summary-service";
import { normalizeExternalUrl, openExternalUrlInBrowser, type ExternalUrlOpener } from "./services/browser-opener";
import { restartProjectWithScript, type ProjectRestarter } from "./services/system-restart";

export function createControlPlaneApp(options?: {
  dataDir?: string;
  startSchedulers?: boolean;
  openExternalUrl?: ExternalUrlOpener;
  restartProject?: ProjectRestarter;
}) {
  const app = Fastify();
  const eventBus = createEventBus();
  const registry = createAgentRegistry();
  registry.registerMany(SUB_AGENT_MANIFESTS);

  const dataDir = options?.dataDir ?? ".agent-zy-data";
  const store = createControlPlaneStore(dataDir);
  const modelSecrets = createModelSecretsRepository(dataDir);
  const modelRuntime = createModelRuntime({
    store,
    secrets: modelSecrets
  });
  const ledgerSemanticService = createLedgerSemanticService();
  const ledgerReportService = createLedgerReportService();
  const summaryService = createSummaryService(store);
  const router = createHybridRouter({
    model: createHeuristicRouterModel()
  });
  const workerPool = createAgentWorkerPool({
    eventBus,
    modelRuntime
  });
  const orchestrator = createControlPlaneOrchestrator({
    store,
    registry,
    router,
    workerPool,
    eventBus,
    ledgerSemanticService,
    ledgerReportService,
    summaryService
  });
  const scheduler = createControlPlaneScheduler({
    orchestrator,
    store
  });

  void app.register(cors, {
    origin: true
  });

  app.get("/api/health", async () => ({
    ok: true
  }));

  app.post("/api/system/restart", async (_request, reply) => {
    await (options?.restartProject ?? restartProjectWithScript)();

    return reply.code(202).send({
      ok: true
    });
  });

  app.get("/api/dashboard", async () => orchestrator.getDashboard());

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

  app.post("/api/cinematic/generate", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    return orchestrator.generateCinematicProject(body);
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
