import { nanoid } from "nanoid";

import type {
  ChatMessage,
  ChatResponse,
  NewsArticleBody,
  NewsItemArticlesResponse,
  NewsCategory,
  NewsState,
  NotificationRecord,
  TopicState,
  TaskRecord,
  TaskTrigger
} from "@agent-zy/shared-types";
import type { AgentManifest } from "@agent-zy/agent-sdk";
import type { AgentRegistry } from "@agent-zy/agent-registry";
import { createTaskRecord, transitionTaskStatus } from "@agent-zy/task-core";
import type { HybridRouter } from "@agent-zy/router-core";

import type { AgentWorkerPool } from "../runtime/agent-pool";
import type { EventBus } from "./events";
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
  getNews(): NewsState;
  addNewsSource(source: {
    name: string;
    url: string;
    category: NewsCategory;
  }): Promise<NewsState>;
  updateNewsSource(
    sourceId: string,
    patch: Partial<{
      name: string;
      url: string;
      category: NewsCategory;
      enabled: boolean;
    }>
  ): Promise<NewsState>;
  removeNewsSource(sourceId: string): Promise<NewsState>;
  refreshNews(meta?: Record<string, unknown>): Promise<NewsState>;
  fetchNewsItemArticles(itemId: string): Promise<NewsItemArticlesResponse>;
  analyzeNewsItem(itemId: string): Promise<NewsState>;
  getTopics(): TopicState;
  generateTopics(meta?: Record<string, unknown>): Promise<TopicState>;
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
}): ControlPlaneOrchestrator {
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

  return {
    async handleChat(message) {
      const userMessage = createMessage("user", message);
      options.store.addMessage(userMessage);

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

      const task = createTaskRecord({
        id: nanoid(),
        agentId: manifest.id,
        summary: `主 agent 路由到 ${manifest.name}`,
        input: {
          message
        }
      });

      options.store.upsertTask(task);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      const executed = await executeTask({
        manifest,
        task,
        message
      });

      return {
        route: {
          agentId: route.agentId,
          confidence: route.confidence,
          reason: route.reason
        },
        task: executed.task,
        message: executed.assistantMessage
      };
    },
    async runSystemTask(input) {
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
    getNews() {
      return options.store.getState().news;
    },
    async addNewsSource(source) {
      await this.runSystemTask({
        agentId: "news-agent",
        trigger: "system",
        summary: "添加热点信源",
        meta: {
          action: "add-source",
          source
        }
      });

      return options.store.getState().news;
    },
    async updateNewsSource(sourceId, patch) {
      await this.runSystemTask({
        agentId: "news-agent",
        trigger: "system",
        summary: "更新热点信源",
        meta: {
          action: "update-source",
          sourceId,
          patch
        }
      });

      return options.store.getState().news;
    },
    async removeNewsSource(sourceId) {
      await this.runSystemTask({
        agentId: "news-agent",
        trigger: "system",
        summary: "删除热点信源",
        meta: {
          action: "remove-source",
          sourceId
        }
      });

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
    async fetchNewsItemArticles(itemId) {
      await this.runSystemTask({
        agentId: "news-agent",
        trigger: "user",
        summary: "抓取新闻全文",
        meta: {
          action: "fetch-articles",
          itemId
        }
      });

      const state = options.store.getState();
      const item = state.news.items.find((candidate) => candidate.id === itemId);

      if (!item) {
        throw new Error(`Unknown news item: ${itemId}`);
      }

      const articlesByRawItemId = new Map<string, NewsArticleBody>(
        state.newsBodies.map((article) => [article.rawItemId, article])
      );

      return {
        itemId,
        articles: item.rawItemIds
          .map((rawItemId) => articlesByRawItemId.get(rawItemId))
          .filter((article): article is NewsArticleBody => article !== undefined)
      };
    },
    async analyzeNewsItem(itemId) {
      await this.runSystemTask({
        agentId: "news-agent",
        trigger: "user",
        summary: "分析热点新闻",
        meta: {
          action: "analyze",
          itemId
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
    cancelNotification(notificationId) {
      options.store.cancelNotification(notificationId);
      options.eventBus.emit("dashboard.updated", options.store.getState());

      return this.getDashboard();
    },
    getDashboard() {
      return options.store.getDashboard(
        options.registry.list(),
        options.workerPool.getViews(options.registry.list())
      );
    }
  };
}
