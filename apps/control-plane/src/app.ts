import Fastify from "fastify";
import cors from "@fastify/cors";

import { manifest as ledgerManifest } from "@agent-zy/ledger-agent/manifest";
import { manifest as historyManifest } from "@agent-zy/history-agent/manifest";
import { manifest as newsManifest } from "@agent-zy/news-agent/manifest";
import { manifest as scheduleManifest } from "@agent-zy/schedule-agent/manifest";
import { createAgentRegistry } from "@agent-zy/agent-registry";
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
  registry.registerMany([ledgerManifest, scheduleManifest, newsManifest, historyManifest]);

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

  app.delete("/api/notifications/:id", async (request) => {
    const params = request.params as {
      id: string;
    };

    return orchestrator.cancelNotification(params.id);
  });

  app.get("/api/news", async () => orchestrator.getNews());

  app.post("/api/news/sources", async (request) => {
    const body = request.body as {
      name: string;
      url: string;
      category: "ai" | "technology" | "economy" | "entertainment" | "world";
    };

    return orchestrator.addNewsSource(body);
  });

  app.patch("/api/news/sources/:id", async (request) => {
    const params = request.params as {
      id: string;
    };
    const body = (request.body ?? {}) as Partial<{
      name: string;
      url: string;
      category: "ai" | "technology" | "economy" | "entertainment" | "world";
      enabled: boolean;
    }>;

    return orchestrator.updateNewsSource(params.id, body);
  });

  app.delete("/api/news/sources/:id", async (request) => {
    const params = request.params as {
      id: string;
    };

    return orchestrator.removeNewsSource(params.id);
  });

  app.post("/api/news/refresh", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    return orchestrator.refreshNews(body);
  });

  app.post("/api/news/items/:id/articles", async (request) => {
    const params = request.params as {
      id: string;
    };

    return orchestrator.fetchNewsItemArticles(params.id);
  });

  app.post("/api/news/items/:id/analyze", async (request) => {
    const params = request.params as {
      id: string;
    };

    return orchestrator.analyzeNewsItem(params.id);
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
