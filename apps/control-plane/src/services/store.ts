import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type {
  AppState,
  ChatMessage,
  DashboardData,
  LedgerEntry,
  NewsArticleBody,
  HistoryPushState,
  NotificationRecord,
  NewsState,
  TopicIdea,
  TopicState,
  ScheduleItem,
  TaskRecord
} from "@agent-zy/shared-types";
import type { AgentExecutionResult, AgentManifest } from "@agent-zy/agent-sdk";
import { groupTasksByStatus } from "@agent-zy/task-core";

function todayLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function seedScheduleItems(): ScheduleItem[] {
  const today = todayLocalDate();

  return [
    {
      id: "schedule_1",
      title: "梳理今天的重点任务",
      date: today,
      suggestedWindow: "09:00-10:00",
      urgency: "high",
      status: "pending"
    },
    {
      id: "schedule_2",
      title: "完成一个推进型任务",
      date: today,
      suggestedWindow: "14:00-16:00",
      urgency: "medium",
      status: "pending"
    },
    {
      id: "schedule_3",
      title: "晚间复盘并确认待办完成情况",
      date: today,
      suggestedWindow: "21:30-22:00",
      urgency: "medium",
      status: "pending"
    }
  ];
}

function createInitialState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    ledger: {
      entries: [],
      modules: ["工作", "游戏", "生活"]
    },
    schedule: {
      items: seedScheduleItems(),
      pendingReview: null
    },
    news: {
      items: [],
      rawItems: [],
      sources: [],
      lastFetchedAt: null,
      lastUpdatedAt: null,
      lastSummarizedAt: null,
      lastSummaryInputItemIds: [],
      lastSummaryProvider: "none",
      lastSummaryError: null,
      status: "idle"
    },
    newsBodies: [],
    topics: {
      current: [],
      history: [],
      lastGeneratedAt: null,
      nextRunAt: null,
      status: "idle",
      strategy: "news-to-content",
      lastError: null
    },
    historyPush: {
      lastTriggeredDate: null
    },
    nightlyReview: {
      lastTriggeredDate: null
    }
  };
}

function isLegacyPlaceholderSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "example.com" || host.endsWith(".example.com");
  } catch {
    return false;
  }
}

function migrateLegacyNewsState(news: NewsState): NewsState {
  const rawItemsBySourceId = new Map<string, NewsState["rawItems"]>();

  for (const rawItem of news.rawItems) {
    rawItemsBySourceId.set(rawItem.sourceId, [
      ...(rawItemsBySourceId.get(rawItem.sourceId) ?? []),
      rawItem
    ]);
  }

  const legacySourceIds = new Set(
    news.sources
      .filter((source) => {
        if (isLegacyPlaceholderSourceUrl(source.url)) {
          return true;
        }

        const rawItems = rawItemsBySourceId.get(source.id) ?? [];
        const isSyntheticFeed = /^data:/i.test(source.url);

        return (
          isSyntheticFeed &&
          rawItems.length > 0 &&
          rawItems.every((rawItem) => isLegacyPlaceholderSourceUrl(rawItem.url))
        );
      })
      .map((source) => source.id)
  );

  if (legacySourceIds.size === 0) {
    return news;
  }

  const sources = news.sources.filter((source) => !legacySourceIds.has(source.id));
  const rawItems = news.rawItems.filter((rawItem) => !legacySourceIds.has(rawItem.sourceId));
  const rawById = new Map(rawItems.map((rawItem) => [rawItem.id, rawItem]));
  const items = news.items
    .map((item) => {
      const matchedRawItems = item.rawItemIds
        .map((rawItemId) => rawById.get(rawItemId))
        .filter((rawItem): rawItem is NewsState["rawItems"][number] => rawItem !== undefined);

      if (matchedRawItems.length === 0) {
        return null;
      }

      const sourceNames = [...new Set(matchedRawItems.map((rawItem) => rawItem.sourceName))];

      return {
        ...item,
        rawItemIds: matchedRawItems.map((rawItem) => rawItem.id),
        sources: sourceNames,
        sourceCount: sourceNames.length
      };
    })
    .filter((item): item is NewsState["items"][number] => item !== null);
  const lastSummaryInputItemIds = news.lastSummaryInputItemIds.filter((rawItemId) =>
    rawById.has(rawItemId)
  );

  return {
    ...news,
    items,
    rawItems,
    sources,
    lastSummarizedAt: items.length > 0 ? news.lastSummarizedAt : null,
    lastSummaryInputItemIds,
    lastSummaryProvider:
      lastSummaryInputItemIds.length > 0 ? news.lastSummaryProvider : "none",
    lastSummaryError: lastSummaryInputItemIds.length > 0 ? news.lastSummaryError : null
  };
}

function normalizeNewsState(news: Partial<NewsState> | undefined): NewsState {
  const normalized: NewsState = {
    items: news?.items ?? [],
    rawItems: news?.rawItems ?? [],
    sources: news?.sources ?? [],
    lastFetchedAt: news?.lastFetchedAt ?? news?.lastUpdatedAt ?? null,
    lastUpdatedAt: news?.lastUpdatedAt ?? null,
    lastSummarizedAt: news?.lastSummarizedAt ?? null,
    lastSummaryInputItemIds: news?.lastSummaryInputItemIds ?? [],
    lastSummaryProvider: news?.lastSummaryProvider ?? (news?.lastSummarizedAt ? "fallback" : "none"),
    lastSummaryError: news?.lastSummaryError ?? null,
    status: news?.status ?? "idle"
  };

  const resetEmptySummaryState =
    normalized.items.length === 0 && normalized.rawItems.length === 0
      ? {
          ...normalized,
          lastSummarizedAt: null,
          lastSummaryInputItemIds: [],
          lastSummaryProvider: "none" as const,
          lastSummaryError: null
        }
      : normalized;

  return migrateLegacyNewsState(resetEmptySummaryState);
}

function normalizeNewsBodies(
  newsBodies: NewsArticleBody[] | undefined,
  news: NewsState
): NewsArticleBody[] {
  const rawItemsById = new Map(news.rawItems.map((rawItem) => [rawItem.id, rawItem]));
  const sourcesById = new Map(news.sources.map((source) => [source.id, source]));
  const deduped = new Map<string, NewsArticleBody>();

  for (const body of newsBodies ?? []) {
    const rawItem = rawItemsById.get(body.rawItemId);
    const source = sourcesById.get(body.sourceId);

    if (!rawItem || !source || rawItem.sourceId !== source.id) {
      continue;
    }

    deduped.set(body.rawItemId, {
      ...body,
      sourceName: source.name,
      title: rawItem.title,
      url: rawItem.url,
      excerpt: body.excerpt ?? "",
      fetchedAt: body.fetchedAt ?? rawItem.fetchedAt,
      status: body.status ?? "failed"
    });
  }

  return [...deduped.values()].sort((left, right) =>
    right.fetchedAt.localeCompare(left.fetchedAt)
  );
}

function normalizeTopicIdea(topic: TopicIdea): TopicIdea {
  return {
    ...topic,
    contentDirection: topic.contentDirection ?? topic.angle
  };
}

function normalizeTopicState(topics: Partial<TopicState> | undefined): TopicState {
  return {
    current: (topics?.current ?? []).map(normalizeTopicIdea),
    history: (topics?.history ?? []).map(normalizeTopicIdea),
    lastGeneratedAt: topics?.lastGeneratedAt ?? null,
    nextRunAt: topics?.nextRunAt ?? null,
    status: topics?.status ?? "idle",
    strategy: "news-to-content",
    lastError: topics?.lastError ?? null
  };
}

function normalizeHistoryPushState(
  historyPush: Partial<HistoryPushState> | undefined
): HistoryPushState {
  return {
    lastTriggeredDate: historyPush?.lastTriggeredDate ?? null
  };
}

function normalizeAppState(state: AppState): AppState {
  const news = normalizeNewsState(state.news);

  return {
    ...state,
    news,
    newsBodies: normalizeNewsBodies(state.newsBodies, news),
    topics: normalizeTopicState(state.topics),
    historyPush: normalizeHistoryPushState(state.historyPush)
  };
}

export interface ControlPlaneStore {
  getState(): AppState;
  replaceState(state: AppState): void;
  upsertTask(task: TaskRecord): void;
  addMessage(message: ChatMessage): void;
  addNotifications(notifications: NotificationRecord[]): void;
  cancelNotification(notificationId: string): void;
  applyAgentResult(result: AgentExecutionResult): void;
  setNightlyReviewDate(date: string): void;
  getDashboard(
    manifests: AgentManifest[],
    runtimeViews: DashboardData["agents"]
  ): DashboardData;
}

export function createControlPlaneStore(dataDir: string): ControlPlaneStore {
  const filePath = resolve(dataDir, "state.json");
  mkdirSync(dirname(filePath), { recursive: true });

  let state = loadState(filePath);

  function persist() {
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    getState() {
      return structuredClone(state);
    },
    replaceState(nextState) {
      state = normalizeAppState(structuredClone(nextState));
      persist();
    },
    upsertTask(task) {
      const index = state.tasks.findIndex((item) => item.id === task.id);

      if (index >= 0) {
        state.tasks[index] = task;
      } else {
        state.tasks.unshift(task);
      }

      persist();
    },
    addMessage(message) {
      state.messages = [...state.messages, message].slice(-40);
      persist();
    },
    addNotifications(notifications) {
      const merged = new Map<string, NotificationRecord>();

      for (const notification of [...notifications, ...state.notifications]) {
        if (!merged.has(notification.id)) {
          merged.set(notification.id, notification);
        }
      }

      const sorted = [...merged.values()].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
      const persistent = sorted.filter((notification) => notification.persistent);
      const regular = sorted
        .filter((notification) => !notification.persistent)
        .slice(0, 20);

      state.notifications = [...persistent, ...regular].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
      persist();
    },
    cancelNotification(notificationId) {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== notificationId
      );
      persist();
    },
    applyAgentResult(result) {
      if (result.domainUpdates?.ledger) {
        state.ledger = result.domainUpdates.ledger;
      }

      if (result.domainUpdates?.schedule) {
        state.schedule = result.domainUpdates.schedule;
      }

      if (result.domainUpdates?.news) {
        state.news = result.domainUpdates.news;
      }

      if (result.domainUpdates?.newsBodies) {
        state.newsBodies = result.domainUpdates.newsBodies;
      } else if (result.domainUpdates?.news) {
        state.newsBodies = normalizeNewsBodies(state.newsBodies, state.news);
      }

      if (result.domainUpdates?.topics) {
        state.topics = result.domainUpdates.topics;
      }

      if (result.domainUpdates?.historyPush) {
        state.historyPush = result.domainUpdates.historyPush;
      }

      state = normalizeAppState(state);

      persist();
    },
    setNightlyReviewDate(date) {
      state.nightlyReview.lastTriggeredDate = date;
      persist();
    },
    getDashboard(manifests, runtimeViews) {
      const groups = groupTasksByStatus(state.tasks);
      const today = todayLocalDate();
      const todayEntries = state.ledger.entries.filter(
        (entry) => entry.createdAt.slice(0, 10) === today
      );

      const summary = todayEntries.reduce(
        (accumulator, entry) => {
          if (entry.direction === "expense") {
            accumulator.todayExpense += entry.amount;
            accumulator.balance -= entry.amount;
          } else {
            accumulator.todayIncome += entry.amount;
            accumulator.balance += entry.amount;
          }

          return accumulator;
        },
        {
          todayExpense: 0,
          todayIncome: 0,
          balance: 0
        }
      );

      return {
        tasks: groups,
        recentTasks: state.tasks.slice(0, 8),
        messages: state.messages.slice(-20),
        notifications: (() => {
          const sorted = [...state.notifications].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          );
          const persistent = sorted.filter((notification) => notification.persistent);
          const regular = sorted
            .filter((notification) => !notification.persistent)
            .slice(0, 12);

          return [...persistent, ...regular].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          );
        })(),
        ledger: {
          ...state.ledger,
          summary
        },
        schedule: {
          ...state.schedule,
          todayItems: state.schedule.items.filter((item) => item.date === today)
        },
        news: state.news,
        topics: state.topics,
        agents: manifests.map((manifest) => {
          const runtimeView = runtimeViews.find((item) => item.id === manifest.id);

          return (
            runtimeView ?? {
              id: manifest.id,
              name: manifest.name,
              status: "idle",
              activeTaskId: null,
              lastStartedAt: null,
              capabilities: manifest.capabilities
            }
          );
        })
      };
    }
  };
}

function loadState(filePath: string): AppState {
  try {
    const raw = readFileSync(filePath, "utf8");
    return normalizeAppState(JSON.parse(raw) as AppState);
  } catch {
    const state = createInitialState();
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    return state;
  }
}
