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
  ModelProfile,
  ModelProviderId,
  ModelPurpose,
  ModelSettingsState,
  NotificationRecord,
  NewsState,
  SummaryDashboard,
  SummaryEntry,
  SummaryState,
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
import { getModelProvider } from "./model-providers";

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
  "history",
  "summary"
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
    summary: createEmptySummaryState(),
    historyPush: {
      lastTriggeredDate: null
    },
    nightlyReview: {
      lastTriggeredDate: null
    },
    modelSettings: createInitialModelSettingsState()
  };
}

function nowIso() {
  return new Date().toISOString();
}

function createInitialModelSettingsState(): ModelSettingsState {
  const createdAt = nowIso();

  if (process.env.MODELSCOPE_API_KEY) {
    const profile: ModelProfile = {
      id: "modelscope-default",
      displayName: "ModelScope 默认模型",
      provider: "modelscope",
      modelName: process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B",
      baseUrl: process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1",
      apiKeyRef: "env:MODELSCOPE_API_KEY",
      capabilities: ["chat", "text", "vision"],
      temperature: 0.7,
      maxTokens: 2000,
      enabled: true,
      isDefault: true,
      purpose: ["general", "summary", "vision"],
      createdAt,
      updatedAt: createdAt
    };

    return {
      profiles: [profile],
      defaultProfileId: profile.id,
      purposeDefaults: {
        general: profile.id,
        summary: profile.id,
        vision: profile.id
      },
      lastUpdatedAt: createdAt
    };
  }

  return {
    profiles: [
      {
        id: "modelscope-example",
        displayName: "ModelScope 示例配置",
        provider: "modelscope",
        modelName: process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B",
        baseUrl: process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1",
        apiKeyRef: null,
        capabilities: ["chat", "text", "vision"],
        temperature: 0.7,
        maxTokens: 2000,
        enabled: false,
        isDefault: false,
        purpose: ["general", "vision"],
        createdAt,
        updatedAt: createdAt
      }
    ],
    defaultProfileId: null,
    purposeDefaults: {},
    lastUpdatedAt: createdAt
  };
}

function createEmptySummaryState(): SummaryState {
  return {
    entries: [],
    drafts: [],
    lastUpdatedAt: null,
    settings: {
      defaultSummaryType: "daily"
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

function uniqueLimited(items: string[], limit: number): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function sortSummaryEntries(entries: SummaryEntry[]): SummaryEntry[] {
  return [...entries].sort((left, right) => {
    const periodDelta = right.periodStart.localeCompare(left.periodStart);

    if (periodDelta !== 0) {
      return periodDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function getWeekBounds(now: Date): { start: string; end: string } {
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  const start = new Date(date.getTime());
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start.getTime());
  end.setDate(start.getDate() + 6);

  return {
    start: todayLocalDate(start),
    end: todayLocalDate(end)
  };
}

function hasFinalSummary(entry: SummaryEntry): boolean {
  return entry.finalSummary.trim().length > 0;
}

function getSummaryStatus(entries: SummaryEntry[], drafts: SummaryEntry[], type: SummaryEntry["summaryType"], period: {
  start: string;
  end: string;
}): "missing" | "draft" | "final" {
  const matchesPeriod = (entry: SummaryEntry) =>
    entry.summaryType === type && entry.periodStart <= period.end && entry.periodEnd >= period.start;

  if (entries.some((entry) => matchesPeriod(entry) && hasFinalSummary(entry))) {
    return "final";
  }

  if (drafts.some(matchesPeriod)) {
    return "draft";
  }

  return "missing";
}

function buildSummaryDashboard(summary: SummaryState, now = new Date(Date.now())): SummaryDashboard {
  const entries = sortSummaryEntries(summary.entries);
  const latestSummary = entries[0] ?? null;
  const weekBounds = getWeekBounds(now);
  const today = todayLocalDate(now);

  return {
    todaySummaryStatus: getSummaryStatus(entries, summary.drafts, "daily", {
      start: today,
      end: today
    }),
    weekSummaryStatus: getSummaryStatus(entries, summary.drafts, "weekly", weekBounds),
    latestSummary,
    recentKeywords: uniqueLimited(entries.flatMap((entry) => entry.keywords), 8),
    recentMoodTags: uniqueLimited(entries.flatMap((entry) => entry.moodTags), 8),
    totalCount: entries.length,
    dailyCount: entries.filter((entry) => entry.summaryType === "daily").length,
    weeklyCount: entries.filter((entry) => entry.summaryType === "weekly").length,
    monthlyCount: entries.filter((entry) => entry.summaryType === "monthly").length,
    yearlyCount: entries.filter((entry) => entry.summaryType === "yearly").length
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

function normalizeSummaryEntry(entry: SummaryEntry): SummaryEntry {
  return {
    ...entry,
    structuredFields: entry.structuredFields ?? {},
    moodTags: entry.moodTags ?? [],
    energyLevel: typeof entry.energyLevel === "number" ? entry.energyLevel : null,
    keywords: entry.keywords ?? [],
    version: entry.version ?? 1
  };
}

function normalizeSummaryState(summary: Partial<SummaryState> | undefined): SummaryState {
  return {
    entries: sortSummaryEntries((summary?.entries ?? []).map(normalizeSummaryEntry)),
    drafts: sortSummaryEntries((summary?.drafts ?? []).map(normalizeSummaryEntry)),
    lastUpdatedAt: summary?.lastUpdatedAt ?? null,
    settings: {
      defaultSummaryType: summary?.settings?.defaultSummaryType ?? "daily"
    }
  };
}

function normalizeHistoryPushState(
  historyPush: Partial<HistoryPushState> | undefined
): HistoryPushState {
  return {
    lastTriggeredDate: historyPush?.lastTriggeredDate ?? null
  };
}

const MODEL_PURPOSES: ModelPurpose[] = [
  "general",
  "summary",
  "ledger",
  "todo",
  "router",
  "embedding",
  "vision"
];

function isModelProviderId(value: unknown): value is ModelProviderId {
  return (
    value === "modelscope" ||
    value === "deepseek" ||
    value === "openai" ||
    value === "doubao" ||
    value === "ollama" ||
    value === "openai-compatible"
  );
}

function isModelPurpose(value: unknown): value is ModelPurpose {
  return MODEL_PURPOSES.includes(value as ModelPurpose);
}

function normalizeModelProfile(profile: Partial<ModelProfile>, fallbackIndex: number): ModelProfile {
  const now = nowIso();
  const provider = isModelProviderId(profile.provider) ? profile.provider : "modelscope";
  const providerDefinition = getModelProvider(provider);
  const capabilities = (profile.capabilities ?? []).filter((capability) =>
    providerDefinition?.supportedCapabilities.includes(capability)
  );

  return {
    id: typeof profile.id === "string" && profile.id ? profile.id : `model-profile-${fallbackIndex}`,
    displayName:
      typeof profile.displayName === "string" && profile.displayName.trim()
        ? profile.displayName.trim()
        : providerDefinition?.name ?? "模型配置",
    provider,
    modelName:
      typeof profile.modelName === "string" && profile.modelName.trim()
        ? profile.modelName.trim()
        : providerDefinition?.defaultModels[0] ?? "",
    baseUrl:
      typeof profile.baseUrl === "string" ? profile.baseUrl : providerDefinition?.defaultBaseUrl ?? "",
    apiKeyRef: typeof profile.apiKeyRef === "string" ? profile.apiKeyRef : null,
    capabilities: capabilities.length > 0 ? capabilities : providerDefinition?.supportedCapabilities.slice(0, 2) ?? ["chat"],
    temperature: typeof profile.temperature === "number" ? profile.temperature : null,
    maxTokens: typeof profile.maxTokens === "number" ? profile.maxTokens : null,
    enabled: Boolean(profile.enabled),
    isDefault: Boolean(profile.isDefault),
    purpose: (profile.purpose ?? []).filter(isModelPurpose),
    createdAt: typeof profile.createdAt === "string" ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : now
  };
}

function normalizeModelSettingsState(
  modelSettings: Partial<ModelSettingsState> | undefined
): ModelSettingsState {
  if (!modelSettings?.profiles || modelSettings.profiles.length === 0) {
    return createInitialModelSettingsState();
  }

  const profiles = modelSettings.profiles.map(normalizeModelProfile);
  const defaultProfileId =
    typeof modelSettings.defaultProfileId === "string" &&
    profiles.some((profile) => profile.id === modelSettings.defaultProfileId && profile.enabled)
      ? modelSettings.defaultProfileId
      : profiles.find((profile) => profile.isDefault && profile.enabled)?.id ?? null;

  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      isDefault: profile.id === defaultProfileId
    })),
    defaultProfileId,
    purposeDefaults: Object.fromEntries(
      Object.entries(modelSettings.purposeDefaults ?? {}).filter(
        ([purpose, profileId]) =>
          isModelPurpose(purpose) &&
          typeof profileId === "string" &&
          profiles.some((profile) => profile.id === profileId)
      )
    ),
    lastUpdatedAt: modelSettings.lastUpdatedAt ?? null
  };
}

function buildModelSettingsDashboard(modelSettings: ModelSettingsState) {
  const defaultProfile =
    modelSettings.profiles.find((profile) => profile.id === modelSettings.defaultProfileId) ?? null;

  return {
    defaultProfile: defaultProfile
      ? {
          id: defaultProfile.id,
          displayName: defaultProfile.displayName,
          provider: defaultProfile.provider,
          modelName: defaultProfile.modelName
        }
      : null,
    enabledCount: modelSettings.profiles.filter((profile) => profile.enabled).length,
    totalCount: modelSettings.profiles.length,
    configuredPurposeCount: Object.keys(modelSettings.purposeDefaults).length,
    purposeCount: MODEL_PURPOSES.length,
    missingApiKeyCount: modelSettings.profiles.filter((profile) => {
      const provider = getModelProvider(profile.provider);
      return Boolean(profile.enabled && provider?.requiresApiKey && !profile.apiKeyRef);
    }).length
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
    summary: normalizeSummaryState(state.summary),
    historyPush: normalizeHistoryPushState(state.historyPush),
    nightlyReview: state.nightlyReview ?? {
      lastTriggeredDate: null
    },
    modelSettings: normalizeModelSettingsState(state.modelSettings)
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
  setSummaryState(summary: SummaryState): SummaryState;
  createModelProfile(profile: Omit<ModelProfile, "createdAt" | "updatedAt">): ModelProfile;
  updateModelProfile(id: string, patch: Partial<ModelProfile>): ModelProfile;
  deleteModelProfile(id: string): { ok: true };
  setDefaultModelProfile(id: string): ModelSettingsState;
  setPurposeDefault(purpose: ModelPurpose, profileId: string | null): ModelSettingsState;
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

      if (result.domainUpdates?.summary) {
        state.summary = result.domainUpdates.summary;
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
    setSummaryState(summary) {
      state.summary = normalizeSummaryState(summary);
      persist();

      return structuredClone(state.summary);
    },
    createModelProfile(profile) {
      const now = nowIso();
      const normalized = normalizeModelProfile(
        {
          ...profile,
          createdAt: now,
          updatedAt: now
        },
        state.modelSettings.profiles.length + 1
      );
      state.modelSettings.profiles = state.modelSettings.profiles.filter(
        (item) => item.id !== normalized.id && item.id !== "modelscope-example"
      );
      state.modelSettings.profiles.unshift(normalized);

      if (normalized.isDefault) {
        state.modelSettings.defaultProfileId = normalized.id;
        state.modelSettings.profiles = state.modelSettings.profiles.map((item) => ({
          ...item,
          isDefault: item.id === normalized.id
        }));
      }

      for (const purpose of normalized.purpose) {
        state.modelSettings.purposeDefaults[purpose] = normalized.id;
      }

      state.modelSettings.lastUpdatedAt = now;
      state.modelSettings = normalizeModelSettingsState(state.modelSettings);
      persist();

      return structuredClone(normalized);
    },
    updateModelProfile(id, patch) {
      const index = state.modelSettings.profiles.findIndex((profile) => profile.id === id);

      if (index < 0) {
        throw new Error("model profile not found");
      }

      const now = nowIso();
      const next = normalizeModelProfile(
        {
          ...state.modelSettings.profiles[index],
          ...patch,
          id,
          updatedAt: now
        },
        index
      );

      state.modelSettings.profiles[index] = next;

      if (next.isDefault) {
        state.modelSettings.defaultProfileId = next.id;
        state.modelSettings.profiles = state.modelSettings.profiles.map((profile) => ({
          ...profile,
          isDefault: profile.id === next.id
        }));
      }

      for (const purpose of next.purpose) {
        state.modelSettings.purposeDefaults[purpose] = next.id;
      }

      state.modelSettings.lastUpdatedAt = now;
      state.modelSettings = normalizeModelSettingsState(state.modelSettings);
      persist();

      return structuredClone(next);
    },
    deleteModelProfile(id) {
      state.modelSettings.profiles = state.modelSettings.profiles.filter((profile) => profile.id !== id);

      if (state.modelSettings.defaultProfileId === id) {
        state.modelSettings.defaultProfileId = null;
      }

      for (const [purpose, profileId] of Object.entries(state.modelSettings.purposeDefaults)) {
        if (profileId === id) {
          delete state.modelSettings.purposeDefaults[purpose as ModelPurpose];
        }
      }

      state.modelSettings.lastUpdatedAt = nowIso();
      state.modelSettings = normalizeModelSettingsState(state.modelSettings);
      persist();

      return { ok: true };
    },
    setDefaultModelProfile(id) {
      const profile = state.modelSettings.profiles.find((item) => item.id === id);

      if (!profile) {
        throw new Error("model profile not found");
      }

      state.modelSettings.defaultProfileId = id;
      state.modelSettings.profiles = state.modelSettings.profiles.map((item) => ({
        ...item,
        isDefault: item.id === id
      }));
      state.modelSettings.lastUpdatedAt = nowIso();
      persist();

      return structuredClone(state.modelSettings);
    },
    setPurposeDefault(purpose, profileId) {
      if (profileId === null) {
        delete state.modelSettings.purposeDefaults[purpose];
      } else if (state.modelSettings.profiles.some((profile) => profile.id === profileId)) {
        state.modelSettings.purposeDefaults[purpose] = profileId;
      } else {
        throw new Error("model profile not found");
      }

      state.modelSettings.lastUpdatedAt = nowIso();
      persist();

      return structuredClone(state.modelSettings);
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
        summary: {
          ...state.summary,
          dashboard: buildSummaryDashboard(state.summary, now)
        },
        modelSettingsDashboard: buildModelSettingsDashboard(state.modelSettings),
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
