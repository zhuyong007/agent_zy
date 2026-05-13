import Fastify from "fastify";
import cors from "@fastify/cors";

import { createAgentRegistry } from "@agent-zy/agent-registry";
import { SUB_AGENT_MANIFESTS } from "@agent-zy/agent-registry/sub-agents";
import { createHeuristicRouterModel, createHybridRouter } from "@agent-zy/router-core";

import { createAgentWorkerPool } from "./runtime/agent-pool";
import { createEventBus } from "./services/events";
import { createControlPlaneOrchestrator } from "./services/orchestrator";
import { createControlPlaneScheduler } from "./services/scheduler";
import { createControlPlaneStore } from "./services/store";

export function createControlPlaneApp(options?: {
  dataDir?: string;
  startSchedulers?: boolean;
}) {
  const app = Fastify();
  const eventBus = createEventBus();
  const registry = createAgentRegistry();
  registry.registerMany(SUB_AGENT_MANIFESTS);

  const store = createControlPlaneStore(options?.dataDir ?? ".agent-zy-data");
  const router = createHybridRouter({
    model: createHeuristicRouterModel()
  });
  const workerPool = createAgentWorkerPool({
    eventBus
  });
  const orchestrator = createControlPlaneOrchestrator({
    store,
    registry,
    router,
    workerPool,
    eventBus
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

  app.get("/api/dashboard", async () => orchestrator.getDashboard());

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

  app.get("/api/topics", async () => orchestrator.getTopics());

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
