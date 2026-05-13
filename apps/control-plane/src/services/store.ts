import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { SUB_AGENT_HOME_MODULE_DEFINITIONS } from "@agent-zy/agent-registry/sub-agents";
import type {
  AppState,
  ChatMessage,
  DashboardData,
  HomeModuleId,
  HomeModulePreference,
  HomeModuleSize,
  LedgerEntry,
  HistoryPushState,
  NotificationRecord,
  NewsState,
  TopicDimensionBucket,
  TopicDimensionDefinition,
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

const CORE_HOME_MODULE_DEFINITIONS = [
  {
    id: "chat",
    defaultSize: "max",
    defaultVisible: true
  }
] as const satisfies ReadonlyArray<{
  id: HomeModuleId;
  defaultSize: HomeModuleSize;
  defaultVisible: boolean;
}>;

const HOME_MODULE_DEFINITIONS = [
  ...SUB_AGENT_HOME_MODULE_DEFINITIONS.slice(0, 1),
  ...CORE_HOME_MODULE_DEFINITIONS,
  ...SUB_AGENT_HOME_MODULE_DEFINITIONS.slice(1)
] as const;

const HOME_MODULE_NAVIGATION_ROUTES = new Set<HomeModuleId>([
  "news",
  "topics",
  "ledger",
  "todo",
  "history"
]);

function canShowHomeModuleInNavigation(id: HomeModuleId) {
  return HOME_MODULE_NAVIGATION_ROUTES.has(id);
}

function getDefaultHomeLayout(): HomeModulePreference[] {
  return HOME_MODULE_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    visible: definition.defaultVisible,
    showInNavigation: canShowHomeModuleInNavigation(definition.id) && definition.defaultVisible,
    size: definition.defaultSize,
    collapsed: false,
    order: index
  }));
}

function normalizeOrder(layout: HomeModulePreference[]) {
  return [...layout]
    .sort((first, second) => first.order - second.order)
    .map((item, index) => ({
      ...item,
      order: index
    }));
}

function normalizeHomeLayout(layout: HomeModulePreference[] | undefined): HomeModulePreference[] {
  if (!layout || layout.length === 0) {
    return getDefaultHomeLayout();
  }

  const defaults = getDefaultHomeLayout();
  const storedById = new Map((layout ?? []).map((item) => [item.id, item]));
  const fallbackOrderOffset =
    (layout ?? []).reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1;

  return normalizeOrder(
    defaults.map((definition, index) => {
      const stored = storedById.get(definition.id);

      if (!stored) {
        return {
          ...definition,
          visible: false,
          showInNavigation: false,
          order: fallbackOrderOffset + index
        };
      }

      return {
        id: definition.id,
        visible: stored.visible,
        showInNavigation: canShowHomeModuleInNavigation(definition.id) && stored.showInNavigation,
        size: stored.size,
        collapsed: stored.collapsed,
        order: stored.order,
        ...(Object.prototype.hasOwnProperty.call(stored, "customName")
          ? { customName: stored.customName }
          : {})
      };
    })
  );
}

function createInitialState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: getDefaultHomeLayout(),
    ledger: {
      entries: [],
      modules: ["工作", "游戏", "生活"]
    },
    schedule: {
      items: seedScheduleItems(),
      pendingReview: null
    },
    news: {
      feed: {
        count: 0,
        hasNext: false,
        nextCursor: null,
        items: []
      },
      daily: null,
      dailyArchive: [],
      lastFetchedAt: null,
      lastUpdatedAt: null,
      lastError: null,
      status: "idle"
    },
    topics: {
      dimensions: [],
      current: [],
      currentByDimension: [],
      history: [],
      lastGeneratedAt: null,
      status: "idle",
      strategy: "manual-curation",
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

function normalizeNewsState(news: Partial<NewsState> | undefined): NewsState {
  return {
    feed: news?.feed ?? {
      count: 0,
      hasNext: false,
      nextCursor: null,
      items: []
    },
    daily: news?.daily ?? null,
    dailyArchive: news?.dailyArchive ?? [],
    lastFetchedAt: news?.lastFetchedAt ?? news?.lastUpdatedAt ?? null,
    lastUpdatedAt: news?.lastUpdatedAt ?? null,
    lastError: news?.lastError ?? null,
    status: news?.status ?? "idle"
  };
}

function normalizeTopicIdea(topic: TopicIdea): TopicIdea {
  return {
    ...topic,
    contentDirection: topic.contentDirection ?? topic.angle
  };
}

function normalizeTopicDimensions(
  dimensions: TopicDimensionDefinition[] | undefined
): TopicDimensionDefinition[] {
  return (dimensions ?? []).map((dimension) => ({
    id: dimension.id,
    label: dimension.label,
    description: dimension.description
  }));
}

function normalizeTopicBuckets(
  buckets: TopicDimensionBucket[] | undefined,
  dimensions: TopicDimensionDefinition[]
): TopicDimensionBucket[] {
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.id, dimension]));

  return (buckets ?? []).map((bucket) => {
    const matchedDimension = dimensionMap.get(bucket.dimensionId);

    return {
      dimensionId: bucket.dimensionId,
      label: matchedDimension?.label ?? bucket.label,
      description: matchedDimension?.description ?? bucket.description,
      items: (bucket.items ?? []).map(normalizeTopicIdea)
    };
  });
}

function normalizeTopicState(topics: Partial<TopicState> | undefined): TopicState {
  const dimensions = normalizeTopicDimensions(topics?.dimensions);

  return {
    dimensions,
    current: (topics?.current ?? []).map(normalizeTopicIdea),
    currentByDimension: normalizeTopicBuckets(topics?.currentByDimension, dimensions),
    history: (topics?.history ?? []).map(normalizeTopicIdea),
    lastGeneratedAt: topics?.lastGeneratedAt ?? null,
    status: topics?.status ?? "idle",
    strategy: "manual-curation",
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
  const { newsBodies: _newsBodies, ...stateWithoutLegacyNewsBodies } = state as AppState & {
    newsBodies?: unknown;
  };

  return {
    ...stateWithoutLegacyNewsBodies,
    homeLayout: normalizeHomeLayout(state.homeLayout),
    news,
    topics: normalizeTopicState(state.topics),
    historyPush: normalizeHistoryPushState(state.historyPush)
  };
}

export interface ControlPlaneStore {
  getState(): AppState;
  replaceState(state: AppState): void;
  setHomeLayout(layout: HomeModulePreference[]): void;
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
    setHomeLayout(layout) {
      state.homeLayout = normalizeHomeLayout(structuredClone(layout));
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
        homeLayout: state.homeLayout,
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
