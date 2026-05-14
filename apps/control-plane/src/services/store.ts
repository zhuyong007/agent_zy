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
  LedgerDashboardSummary,
  LedgerEntry,
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord,
  HistoryPushState,
  LifeStageRecord,
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

import { createLedgerRepository } from "./ledger-repository";

function isEnoentError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

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
      modules: [],
      dashboard: createEmptyLedgerDashboardSummary()
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

function createEmptyLedgerDashboardSummary(): LedgerDashboardSummary {
  return {
    todayIncomeCents: 0,
    todayExpenseCents: 0,
    rolling7dNetCents: 0,
    recentFacts: [],
    coachTip: null,
    pendingReviewCount: 0
  };
}

function getBusinessDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return todayLocalDate(date);
}

function isLedgerDashboardDirection(
  direction: LedgerFactRecord["direction"]
): direction is "expense" | "income" {
  return direction === "expense" || direction === "income";
}

function buildLegacyLedgerSummary(entries: LedgerEntry[], today: string) {
  return entries
    .filter((entry) => getBusinessDateKey(entry.createdAt) === today)
    .reduce(
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
}

function buildLedgerSummaryFromFacts(facts: LedgerFactRecord[], today: string) {
  return facts.reduce(
    (accumulator, fact) => {
      if (fact.status !== "confirmed" || !isLedgerDashboardDirection(fact.direction)) {
        return accumulator;
      }

      const amount = fact.amountCents / 100;

      if (getBusinessDateKey(fact.occurredAt) === today) {
        if (fact.direction === "expense") {
          accumulator.todayExpense += amount;
        } else {
          accumulator.todayIncome += amount;
        }
      }

      if (fact.direction === "expense") {
        accumulator.balance -= amount;
      } else {
        accumulator.balance += amount;
      }

      return accumulator;
    },
    {
      todayExpense: 0,
      todayIncome: 0,
      balance: 0
    }
  );
}

function buildLedgerDashboardSummary(
  facts: LedgerFactRecord[],
  semantics: LedgerSemanticRecord[],
  now = new Date(Date.now())
): LedgerDashboardSummary {
  if (facts.length === 0) {
    return createEmptyLedgerDashboardSummary();
  }

  const today = getBusinessDateKey(now);
  const sevenDayWindowStart = new Date(now.getTime());
  sevenDayWindowStart.setHours(0, 0, 0, 0);
  sevenDayWindowStart.setDate(sevenDayWindowStart.getDate() - 6);

  const semanticByFactId = new Map(semantics.map((semantic) => [semantic.factId, semantic]));
  const pendingReviewCount = facts.filter((fact) => fact.status === "needs_review").length;
  const dashboardFacts = facts.filter(
    (fact) => fact.status === "confirmed" && isLedgerDashboardDirection(fact.direction)
  );
  let recentDiningExpenseCount = 0;
  const sortedFacts = [...dashboardFacts].sort((left, right) => {
    const occurredDelta = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();

    if (occurredDelta !== 0) {
      return occurredDelta;
    }

    return new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime();
  });

  const summary = sortedFacts.reduce<LedgerDashboardSummary>(
    (summary, fact) => {
      const semantic = semanticByFactId.get(fact.id);
      const occurredAt = new Date(fact.occurredAt);
      const occurredAtTime = occurredAt.getTime();

      if (getBusinessDateKey(fact.occurredAt) === today) {
        if (fact.direction === "income") {
          summary.todayIncomeCents += fact.amountCents;
        } else {
          summary.todayExpenseCents += fact.amountCents;
        }
      }

      if (!Number.isNaN(occurredAtTime) && occurredAtTime >= sevenDayWindowStart.getTime()) {
        summary.rolling7dNetCents += fact.direction === "income" ? fact.amountCents : -fact.amountCents;

        if (
          fact.direction === "expense" &&
          semantic?.primaryCategory === "餐饮" &&
          semantic.confidence >= 0.7
        ) {
          recentDiningExpenseCount += 1;
        }
      }

      if (summary.recentFacts.length < 3) {
        const direction = fact.direction === "income" ? "income" : "expense";

        summary.recentFacts.push({
          id: fact.id,
          direction,
          amountCents: fact.amountCents,
          occurredAt: fact.occurredAt,
          summary:
            semantic?.primaryCategory && semantic.primaryCategory.trim().length > 0
              ? `${semantic.primaryCategory} · ${fact.rawText}`
              : fact.rawText
        });
      }

      return summary;
    },
    {
      ...createEmptyLedgerDashboardSummary(),
      pendingReviewCount
    }
  );

  if (recentDiningExpenseCount >= 2) {
    return {
      ...summary,
      coachTip: "最近餐饮支出较频繁，留意外食节奏。"
    };
  }

  if (summary.pendingReviewCount > 0) {
    return {
      ...summary,
      coachTip: "你有待确认的账目，建议补充金额或场景。"
    };
  }

  return summary;
}

function normalizeLedgerState(state: AppState["ledger"] | undefined): AppState["ledger"] {
  return {
    entries: state?.entries ?? [],
    modules: state?.modules ?? ["工作", "游戏", "生活"],
    ...(state?.summary ? { summary: state.summary } : {}),
    dashboard: state?.dashboard ?? createEmptyLedgerDashboardSummary()
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

function bootstrapLegacyLedgerFact(entry: LedgerEntry): LedgerFactRecord {
  const note = entry.note.trim();

  return {
    id: entry.id,
    // Legacy entries already exist in state.json, so bootstrap them as confirmed manual facts.
    sourceType: "manual_edit",
    rawText: note,
    normalizedText: note,
    direction: entry.direction,
    amountCents: Math.round(entry.amount * 100),
    currency: "CNY",
    occurredAt: entry.createdAt,
    recordedAt: entry.createdAt,
    status: "confirmed",
    ...(entry.taskId ? { taskId: entry.taskId } : {})
  };
}

function bootstrapLedgerRepositoryFromLegacyState(
  state: AppState,
  ledgerRepository: ReturnType<typeof createLedgerRepository>
): void {
  if (state.ledger.entries.length === 0) {
    return;
  }

  if (ledgerRepository.readFacts().length > 0) {
    return;
  }

  ledgerRepository.writeFacts(state.ledger.entries.map(bootstrapLegacyLedgerFact));
}

function normalizeAppState(state: AppState): AppState {
  const news = normalizeNewsState(state.news);
  const { newsBodies: _newsBodies, ...stateWithoutLegacyNewsBodies } = state as AppState & {
    newsBodies?: unknown;
  };

  return {
    ...stateWithoutLegacyNewsBodies,
    homeLayout: normalizeHomeLayout(state.homeLayout),
    ledger: normalizeLedgerState(state.ledger),
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
  appendLedgerFact(fact: LedgerFactRecord): LedgerFactRecord;
  appendLedgerSemantic(semantic: LedgerSemanticRecord): LedgerSemanticRecord;
  getLedgerFacts(): LedgerFactRecord[];
  getLedgerSemantics(): LedgerSemanticRecord[];
  getLedgerReports(): LedgerReportRecord[];
  getLedgerStages(): LifeStageRecord[];
  upsertLedgerReport(report: LedgerReportRecord): LedgerReportRecord;
  setNightlyReviewDate(date: string): void;
  getDashboard(
    manifests: AgentManifest[],
    runtimeViews: DashboardData["agents"]
  ): DashboardData;
}

export function createControlPlaneStore(dataDir: string): ControlPlaneStore {
  const filePath = resolve(dataDir, "state.json");
  mkdirSync(dirname(filePath), { recursive: true });
  const ledgerRepository = createLedgerRepository(dataDir);

  let state = loadState(filePath);
  bootstrapLedgerRepositoryFromLegacyState(state, ledgerRepository);

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
    appendLedgerFact(fact) {
      const facts = ledgerRepository.readFacts();
      const nextFacts = facts.filter((item) => item.id !== fact.id);

      nextFacts.unshift(structuredClone(fact));
      ledgerRepository.writeFacts(nextFacts);

      return fact;
    },
    appendLedgerSemantic(semantic) {
      const semantics = ledgerRepository.readSemantics();
      const nextSemantics = semantics.filter((item) => item.factId !== semantic.factId);

      nextSemantics.unshift(structuredClone(semantic));
      ledgerRepository.writeSemantics(nextSemantics);

      return semantic;
    },
    getLedgerFacts() {
      return structuredClone(ledgerRepository.readFacts());
    },
    getLedgerSemantics() {
      return structuredClone(ledgerRepository.readSemantics());
    },
    getLedgerReports() {
      return structuredClone(ledgerRepository.readReports());
    },
    getLedgerStages() {
      return structuredClone(ledgerRepository.readStages());
    },
    upsertLedgerReport(report) {
      const reports = ledgerRepository.readReports();
      const nextReports = reports.filter((item) => item.id !== report.id);

      nextReports.unshift(structuredClone(report));
      ledgerRepository.writeReports(nextReports);

      return report;
    },
    setNightlyReviewDate(date) {
      state.nightlyReview.lastTriggeredDate = date;
      persist();
    },
    getDashboard(manifests, runtimeViews) {
      const groups = groupTasksByStatus(state.tasks);
      const now = new Date(Date.now());
      const today = todayLocalDate(now);
      const facts = ledgerRepository.readFacts();
      const semantics = ledgerRepository.readSemantics();
      const summary = buildLedgerSummaryFromFacts(facts, today);
      const dashboard = buildLedgerDashboardSummary(facts, semantics, now);

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
          summary,
          dashboard
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
  let raw: string;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (!isEnoentError(error)) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load control-plane state at ${filePath}: ${reason}`);
    }

    const state = createInitialState();
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    return state;
  }

  try {
    return normalizeAppState(JSON.parse(raw) as AppState);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse control-plane state at ${filePath}: ${reason}`);
  }
}
