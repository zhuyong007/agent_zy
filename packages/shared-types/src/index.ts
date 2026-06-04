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

export type EventLogLevel = "debug" | "info" | "warn" | "error";

export interface EventLogRecord {
  id: string;
  timestamp: string;
  level: EventLogLevel;
  category: string;
  action: string;
  message: string;
  taskId?: string;
  agentId?: string;
  requestId?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface EventLogInput extends Omit<EventLogRecord, "id" | "timestamp"> {
  id?: string;
  timestamp?: string;
}

export interface EventLogQuery {
  level?: EventLogLevel;
  category?: string;
  agentId?: string;
  taskId?: string;
  requestId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface EventLogSummary {
  total: number;
  errorCount: number;
  latestTimestamp: string | null;
}

export interface EventLogQueryResult {
  items: EventLogRecord[];
  nextCursor: string | null;
  summary: EventLogSummary;
  warnings: string[];
}

export type PhotoRenameItemStatus = "rename" | "unchanged" | "skipped";
export type PhotoRenameTimeSource = "exif" | "video-metadata" | "file-mtime";
export type PhotoRenameMediaScope = "images" | "videos" | "all";

export interface PhotoRenamePreviewItem {
  sourcePath: string;
  sourceName: string;
  targetPath: string;
  targetName: string;
  status: PhotoRenameItemStatus;
  timeSource: PhotoRenameTimeSource;
  capturedAt: string;
  size: number;
  modifiedAt: string;
  skipReason?: string;
}

export interface PhotoRenamePreviewResult {
  previewToken: string;
  directoryPath: string;
  createdAt: string;
  expiresAt: string;
  summary: {
    total: number;
    rename: number;
    unchanged: number;
    skipped: number;
  };
  items: PhotoRenamePreviewItem[];
}

export interface PhotoRenameExecuteResult {
  undoToken: string;
  summary: {
    renamed: number;
    failed: number;
  };
  items: Array<{
    sourcePath: string;
    targetPath: string;
    status: "renamed";
  }>;
}

export interface PhotoRenameUndoResult {
  summary: {
    restored: number;
    failed: number;
  };
  items: Array<{
    sourcePath: string;
    targetPath: string;
    status: "restored";
  }>;
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

export interface HistoryPostCover {
  title: string;
  subtitle: string;
  imageText: string;
  prompt: string;
}

export interface HistoryPostPayload {
  topic: string;
  summary: string;
  cover?: HistoryPostCover;
  cardCount: number;
  cards: HistoryPostCard[];
  xiaohongshuCaption: string;
  generatedAt: string;
}

export type HistoryDynastyModuleType =
  | "王朝兴衰录"
  | "皇帝图鉴"
  | "风云人物"
  | "历史冷知识";

export interface HistoryDynastyModule extends HistoryPostPayload {
  type: HistoryDynastyModuleType;
}

export interface HistoryDynastyPayload {
  dynasty: string;
  modules: HistoryDynastyModule[];
}

export type HistoryNotificationPayload = HistoryPostPayload | HistoryDynastyPayload;

export interface HistoryPushState {
  lastTriggeredDate: string | null;
}

export interface HistoryXhsPostMetrics {
  id: string;
  title: string;
  publishedAt: string | null;
  url: string | null;
  views: number;
  likes: number;
  collects: number;
  comments: number;
  shares: number;
}

export interface HistoryXhsOverview {
  postCount: number;
  totalViews: number;
  totalLikes: number;
  totalCollects: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number | null;
}

export interface HistoryXhsState {
  posts: HistoryXhsPostMetrics[];
  overview: HistoryXhsOverview;
  lastSyncedAt: string | null;
  status: "idle" | "syncing" | "failed";
  lastError: string | null;
  sourceUrl: string;
}

export interface StoryboardShot {
  id: string;
  sceneId?: string;
  sceneAnchor?: string;
  characterRefs?: string[];
  propRefs?: string[];
  sceneRef?: string;
  title: string;
  purpose: string;
  duration: string;
  cameraMovement: string;
  shotType: string;
  composition: string;
  transition: string;
  audioHint: string;
  emotionalBeat: string;
  handoff?: string;
  prompt: {
    zh: string;
    en: string;
  };
}

export interface CinematicReferencePrompt {
  zh: string;
  en: string;
}

export interface CinematicReferenceViews {
  front: CinematicReferencePrompt;
  side: CinematicReferencePrompt;
  back: CinematicReferencePrompt;
}

export interface CinematicCharacterReference {
  id: string;
  name: string;
  description: string;
  views: CinematicReferenceViews;
}

export interface CinematicPropReference {
  id: string;
  name: string;
  description: string;
  views: CinematicReferenceViews;
}

export interface CinematicSceneReference {
  id: string;
  name: string;
  description: string;
  prompt: CinematicReferencePrompt;
}

export interface CinematicReferenceAssets {
  characters: CinematicCharacterReference[];
  props: CinematicPropReference[];
  scenes: CinematicSceneReference[];
}

export interface CinematicContinuity {
  actionLine: string;
  spatialLine: string;
  emotionalLine: string;
  visualLine: string;
  audioLine: string;
}

export interface CinematicScenePlan {
  sceneCount: number;
  maxDurationSeconds: number;
  scenes: Array<{
    id: string;
    name: string;
    anchor: string;
    role: string;
  }>;
}

export interface CinematicProject {
  id: string;
  title: string;
  concept: string;
  mood: string;
  script: string;
  storyboard: StoryboardShot[];
  referenceAssets?: CinematicReferenceAssets;
  scenePlan?: CinematicScenePlan;
  continuity?: CinematicContinuity;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  style: string;
  pace: string;
  targetShotCount: number;
}

export interface CinematicState {
  projects: CinematicProject[];
  recentProjectIds: string[];
  lastGeneratedAt: string | null;
  status: "idle" | "generating";
  lastError: string | null;
}

export interface CinematicDashboardSummary {
  projectCount: number;
  recentProjects: CinematicProject[];
  latestProject: CinematicProject | null;
  lastGeneratedAt: string | null;
  totalShotCount: number;
  todayInspiration: string;
}

export type ClassicShotTargetPlatform =
  | "jianying"
  | "jimeng"
  | "kling"
  | "runway"
  | "seedance"
  | "generic";

export interface ClassicShotSource {
  director: string;
  film: string;
  year: number;
  shotName: string;
  shotPosition: string;
  context?: string;
}

export interface ClassicShotAnalysis {
  cameraMovement: string;
  lighting: string;
  emotionCurve: string;
}

export interface ClassicShotStoryboard {
  id: string;
  title: string;
  function: string;
  prompt: string;
  movementKeywords: string[];
  visualKeywords: string[];
  sourceFrame?: {
    index: number;
    timestampSeconds: number;
  };
}

export interface ClassicShotContinuity {
  actionContinuity: string;
  cameraContinuity: string;
  lightingContinuity: string;
  colorContinuity: string;
  antiJumpGuidance: string;
}

export interface ClassicShotProject {
  id: string;
  rawInput: string;
  title: string;
  referenceType?: "classic-film" | "uploaded-video";
  source: ClassicShotSource;
  videoReference?: {
    fileName: string;
    durationSeconds: number;
    extractedFrameCount: number;
    revisionInstruction: string;
  };
  coreValue: string;
  analysis: ClassicShotAnalysis;
  minimumStoryboardCount: number;
  storyboard: ClassicShotStoryboard[];
  continuity: ClassicShotContinuity;
  storyboardVideoPrompt?: string;
  markdown: string;
  targetPlatform: ClassicShotTargetPlatform;
  createdAt: string;
  updatedAt: string;
}

export interface ClassicShotState {
  projects: ClassicShotProject[];
  recentProjectIds: string[];
  lastGeneratedAt: string | null;
  status: "idle" | "generating";
  lastError: string | null;
}

export interface ClassicShotDashboardSummary {
  projectCount: number;
  recentProjects: ClassicShotProject[];
  latestProject: ClassicShotProject | null;
  lastGeneratedAt: string | null;
  totalStoryboardCount: number;
  todayReference: string;
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
  payload?: HistoryNotificationPayload;
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
  cinematic: CinematicState;
  classicShots: ClassicShotState;
  summary: SummaryState;
  historyPush: HistoryPushState;
  historyXhs?: HistoryXhsState;
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
  cinematic: CinematicState & {
    dashboard: CinematicDashboardSummary;
  };
  classicShots: ClassicShotState & {
    dashboard: ClassicShotDashboardSummary;
  };
  summary: SummaryState & {
    dashboard: SummaryDashboard;
  };
  historyXhs?: HistoryXhsState;
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
