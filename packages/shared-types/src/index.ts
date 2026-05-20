export type TaskTrigger = "user" | "schedule" | "system";
export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_feedback"
  | "completed"
  | "failed";

export interface TaskHistoryEntry {
  status: TaskStatus;
  at: string;
  note: string;
}

export interface TaskRecord {
  id: string;
  agentId: string;
  summary: string;
  trigger: TaskTrigger;
  input: Record<string, unknown>;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  history: TaskHistoryEntry[];
  resultSummary?: string;
}

export interface KanbanGroups {
  todo: TaskRecord[];
  inProgress: TaskRecord[];
  waitingFeedback: TaskRecord[];
  done: TaskRecord[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  agentId?: string;
}

export type LedgerDirection = "expense" | "income";
export type LedgerSourceType =
  | "chat"
  | "ledger_quick_input"
  | "voice"
  | "ocr"
  | "manual_edit";
export type LedgerFactDirection = "expense" | "income" | "transfer" | "refund";

export interface LedgerFactRecord {
  id: string;
  sourceType: LedgerSourceType;
  rawText: string;
  normalizedText: string;
  direction: LedgerFactDirection;
  amountCents: number;
  currency: "CNY";
  occurredAt: string;
  recordedAt: string;
  accountHint?: string;
  counterparty?: string;
  status: "confirmed" | "needs_review";
  taskId?: string;
  revisionOf?: string;
}

export interface LedgerSemanticRecord {
  factId: string;
  primaryCategory: string;
  secondaryCategories: string[];
  tags: string[];
  people: string[];
  scene?: string;
  emotion?: string;
  consumptionType?: string;
  businessType?: string;
  lifeStageIds: string[];
  confidence: number;
  reasoningSummary: string;
  parserVersion: string;
}

export interface LifeStageRecord {
  id: string;
  name: string;
  startAt: string;
  endAt?: string;
  status: "active" | "closed";
  description: string;
  tags: string[];
}

export interface LedgerReportRecord {
  id: string;
  kind: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  summary: string;
  insights: string[];
  risks: string[];
  opportunities: string[];
  promptVersion: string;
}

export interface LedgerCoachMemory {
  id: string;
  date: string;
  type: "pattern" | "risk" | "milestone" | "preference";
  title: string;
  content: string;
  relatedFactIds: string[];
  score: number;
}

export interface LedgerDashboardSummary {
  todayIncomeCents: number;
  todayExpenseCents: number;
  rolling7dNetCents: number;
  recentFacts: Array<{
    id: string;
    direction: LedgerDirection;
    amountCents: number;
    occurredAt: string;
    summary: string;
  }>;
  coachTip: string | null;
  pendingReviewCount: number;
}

export interface LedgerEntry {
  id: string;
  module: string;
  direction: LedgerDirection;
  // Legacy compatibility layer: unit follows the pre-existing implementation.
  amount: number;
  note: string;
  createdAt: string;
  taskId: string;
}

export interface LedgerLegacySummary {
  // Legacy compatibility layer: values follow the pre-existing implementation.
  todayExpense: number;
  todayIncome: number;
  balance: number;
}

export interface LedgerState {
  entries: LedgerEntry[];
  modules: string[];
  // Legacy compatibility layer; new fact-layer monetary fields use *Cents.
  summary?: LedgerLegacySummary;
  dashboard?: LedgerDashboardSummary;
}

export type ScheduleUrgency = "low" | "medium" | "high";
export type ScheduleItemStatus = "pending" | "done";

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  suggestedWindow: string;
  urgency: ScheduleUrgency;
  status: ScheduleItemStatus;
  completedAt?: string;
}

export interface PendingReview {
  date: string;
  prompt: string;
  askedAt: string;
  taskId: string;
}

export interface ScheduleState {
  items: ScheduleItem[];
  pendingReview: PendingReview | null;
}

export type NewsCategory =
  | "ai-models"
  | "ai-products"
  | "industry"
  | "paper"
  | "tip";

export interface NewsFeedItem {
  id: string;
  title: string;
  titleEn: string | null;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
  category: NewsCategory;
}

export interface NewsFeedResponse {
  count: number;
  hasNext: boolean;
  nextCursor: string | null;
  items: NewsFeedItem[];
}

export interface NewsDailyLead {
  title: string;
  summary: string;
}

export interface NewsDailySectionItem {
  title: string;
  summary: string;
  sourceUrl: string | null;
  sourceName: string;
}

export interface NewsDailySection {
  label: string;
  items: NewsDailySectionItem[];
}

export interface NewsDailyReport {
  date: string;
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  lead: NewsDailyLead;
  sections: NewsDailySection[];
  flashes: string[];
}

export interface NewsDailyArchiveItem {
  date: string;
  generatedAt: string;
  leadTitle: string;
}

export interface NewsState {
  feed: NewsFeedResponse;
  daily: NewsDailyReport | null;
  dailyArchive: NewsDailyArchiveItem[];
  lastFetchedAt: string | null;
  lastUpdatedAt: string | null;
  lastError: string | null;
  status: "idle" | "refreshing";
}

export type TopicScoreLabel = "low" | "medium" | "high";
export type TopicIdeaStatus = "new" | "saved" | "dismissed";
export type TopicDimensionId = string;

export interface TopicDimensionDefinition {
  id: TopicDimensionId;
  label: string;
  description: string;
}

export interface TopicIdea {
  id: string;
  batchId: string;
  dimensionId: TopicDimensionId;
  title: string;
  hook: string;
  summary: string;
  audience: string;
  angle: string;
  contentDirection: string;
  whyNow: string;
  sourceNewsItemIds: string[];
  sourceTitles: string[];
  score: number;
  scoreLabel: TopicScoreLabel;
  status: TopicIdeaStatus;
  createdAt: string;
}

export interface TopicDimensionBucket {
  dimensionId: TopicDimensionId;
  label: string;
  description: string;
  items: TopicIdea[];
}

export interface TopicState {
  dimensions: TopicDimensionDefinition[];
  current: TopicIdea[];
  currentByDimension: TopicDimensionBucket[];
  history: TopicIdea[];
  lastGeneratedAt: string | null;
  status: "idle" | "generating";
  strategy: "manual-curation";
  lastError: string | null;
}

export type SummaryType = "daily" | "weekly" | "monthly" | "yearly";

export type SummaryStatus = "missing" | "draft" | "final";

export type SummaryStructuredFields = Record<string, string | string[] | number | null>;

export interface SummaryEntry {
  id: string;
  summaryType: SummaryType;
  periodStart: string;
  periodEnd: string;
  title: string;
  rawInput: string;
  structuredFields: SummaryStructuredFields;
  aiDraft: string;
  finalSummary: string;
  moodTags: string[];
  energyLevel: number | null;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SummaryState {
  entries: SummaryEntry[];
  drafts: SummaryEntry[];
  lastUpdatedAt: string | null;
  settings: {
    defaultSummaryType: SummaryType;
  };
}

export interface SummaryDashboard {
  todaySummaryStatus: SummaryStatus;
  weekSummaryStatus: SummaryStatus;
  latestSummary: SummaryEntry | null;
  recentKeywords: string[];
  recentMoodTags: string[];
  totalCount: number;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
  yearlyCount: number;
}

export interface HistoryPostCard {
  title: string;
  imageText: string;
  prompt: string;
}

export interface HistoryPostPayload {
  topic: string;
  summary: string;
  cardCount: number;
  cards: HistoryPostCard[];
  xiaohongshuCaption: string;
  generatedAt: string;
}

export interface HistoryPushState {
  lastTriggeredDate: string | null;
}

export type ModelProviderId =
  | "modelscope"
  | "deepseek"
  | "openai"
  | "doubao"
  | "ollama"
  | "openai-compatible";

export type ModelCapability = "chat" | "text" | "embedding" | "vision" | "tool-use";

export type ModelPurpose =
  | "general"
  | "summary"
  | "ledger"
  | "todo"
  | "router"
  | "embedding"
  | "vision";

export interface ModelProfile {
  id: string;
  displayName: string;
  provider: ModelProviderId;
  modelName: string;
  baseUrl: string;
  apiKeyRef: string | null;
  capabilities: ModelCapability[];
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  isDefault: boolean;
  purpose: ModelPurpose[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelProviderDefinition {
  id: ModelProviderId;
  name: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  authType: "bearer" | "none";
  supportedCapabilities: ModelCapability[];
  defaultModels: string[];
  docsHint: string;
  compatibleMode: "openai" | "ollama";
}

export interface ModelSettingsState {
  profiles: ModelProfile[];
  defaultProfileId: string | null;
  purposeDefaults: Partial<Record<ModelPurpose, string>>;
  agentDefaults: Record<string, string>;
  lastUpdatedAt: string | null;
}

export interface ModelSettingsDashboard {
  defaultProfile: Pick<ModelProfile, "id" | "displayName" | "provider" | "modelName"> | null;
  enabledCount: number;
  totalCount: number;
  configuredPurposeCount: number;
  purposeCount: number;
  configuredAgentCount: number;
  missingApiKeyCount: number;
}

export type HomeModuleId = string;
export type HomeModuleSize = "max" | "large" | "medium" | "smaller" | "small";

export interface HomeModulePreference {
  id: HomeModuleId;
  visible: boolean;
  showInNavigation: boolean;
  size: HomeModuleSize;
  collapsed: boolean;
  order: number;
  customName?: string;
}

export type NotificationKind =
  | "nightly-review"
  | "task-update"
  | "news-refresh"
  | "topic-push"
  | "history-post";

export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  taskId?: string;
  persistent?: boolean;
  payload?: HistoryPostPayload;
}

export interface NightlyReviewState {
  lastTriggeredDate: string | null;
}

export interface AppState {
  tasks: TaskRecord[];
  messages: ChatMessage[];
  notifications: NotificationRecord[];
  homeLayout: HomeModulePreference[];
  ledger: LedgerState;
  schedule: ScheduleState;
  news: NewsState;
  topics: TopicState;
  summary: SummaryState;
  historyPush: HistoryPushState;
  nightlyReview: NightlyReviewState;
  modelSettings: ModelSettingsState;
}

export interface AgentRuntimeView {
  id: string;
  name: string;
  status: "idle" | "busy";
  activeTaskId: string | null;
  lastStartedAt: string | null;
  capabilities: string[];
}

export interface DashboardData {
  tasks: KanbanGroups;
  recentTasks: TaskRecord[];
  messages: ChatMessage[];
  notifications: NotificationRecord[];
  homeLayout: HomeModulePreference[];
  ledger: LedgerState & {
    summary: LedgerLegacySummary;
    dashboard: LedgerDashboardSummary;
  };
  schedule: ScheduleState & {
    todayItems: ScheduleItem[];
  };
  news: NewsState;
  topics: TopicState;
  summary: SummaryState & {
    dashboard: SummaryDashboard;
  };
  modelSettingsDashboard?: ModelSettingsDashboard;
  agents: AgentRuntimeView[];
}

export interface ChatResponse {
  route: {
    agentId: string;
    reason: string;
    confidence: number;
  };
  task: TaskRecord;
  message: ChatMessage;
}
