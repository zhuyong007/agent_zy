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

export type FileOrganizerMode = "time" | "type";
export type FileOrganizerTimeGranularity = "day" | "month" | "year";
export type FileOrganizerTimeSource = "filename" | "file-birthtime" | "file-mtime" | "unknown";
export type FileOrganizerItemStatus = "move" | "unchanged" | "skipped";

export interface FileOrganizerPreviewInput {
  directoryPath: string;
  mode: FileOrganizerMode;
  timeGranularity?: FileOrganizerTimeGranularity;
}

export interface FileOrganizerPreviewItem {
  sourcePath: string;
  sourceName: string;
  targetPath: string;
  targetName: string;
  targetFolderName: string;
  status: FileOrganizerItemStatus;
  timeSource?: FileOrganizerTimeSource;
  size: number;
  modifiedAt: string;
  skipReason?: string;
}

export interface FileOrganizerPreviewResult {
  previewToken: string;
  directoryPath: string;
  mode: FileOrganizerMode;
  timeGranularity: FileOrganizerTimeGranularity | null;
  createdAt: string;
  expiresAt: string;
  summary: {
    total: number;
    move: number;
    unchanged: number;
    skipped: number;
  };
  items: FileOrganizerPreviewItem[];
}

export interface FileOrganizerExecuteResult {
  undoToken: string;
  summary: {
    moved: number;
    failed: number;
  };
  items: Array<{
    sourcePath: string;
    targetPath: string;
    status: "moved";
  }>;
}

export interface FileOrganizerUndoResult {
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

export type MhxyTradeCurrency = "rmb" | "gameCoin";
export type MhxyTradeType = "buy" | "sell";
export type MhxyTradeAccountingMode = "directRmb" | "legacyRate" | "wallet";

export interface MhxyGameCoinAllocation {
  gameCoinPurchaseId: string;
  gameCoinAmount: number;
  rmbCost: number;
}

export interface MhxyTradeInput {
  type: MhxyTradeType;
  itemName: string;
  quantity: number;
  unitPrice: number;
  currency: MhxyTradeCurrency;
  feeRmb?: number;
  rmbPerGameCoinWan?: number;
  occurredAt: string;
  serverName?: string;
  characterName?: string;
  note?: string;
}

export interface MhxyTradeRecord extends Omit<MhxyTradeInput, "feeRmb"> {
  id: string;
  accountingMode?: MhxyTradeAccountingMode;
  rmbAmount: number | null;
  feeRmb: number;
  gameCoinAmountWan?: number;
  effectiveRmbPerGameCoinWan?: number;
  gameCoinAllocations?: MhxyGameCoinAllocation[];
  createdAt: string;
  updatedAt: string;
}

interface MhxyPriceSnapshotBase {
  itemName: string;
  capturedAt: string;
  serverName?: string;
  note?: string;
}

export type MhxyPriceSnapshotInput = MhxyPriceSnapshotBase & (
  | {
      currency: "rmb";
      rmbUnitPrice: number;
      gameCoinUnitPriceWan?: never;
      rmbPerGameCoinWan?: never;
    }
  | {
      currency: "gameCoin";
      rmbUnitPrice?: never;
      gameCoinUnitPriceWan: number;
      rmbPerGameCoinWan: number;
    }
);

export type MhxyPriceSnapshot = MhxyPriceSnapshotBase & {
  id: string;
  rmbUnitPrice: number;
  createdAt: string;
  updatedAt: string;
} & (
    | {
        currency: "rmb";
        gameCoinUnitPriceWan?: never;
        rmbPerGameCoinWan?: never;
      }
    | {
        currency: "gameCoin";
        gameCoinUnitPriceWan: number;
        rmbPerGameCoinWan: number;
      }
  );

export interface MhxyInventoryTransferInput {
  itemName: string;
  quantity: number;
  sourceServerName: string;
  sourceCharacterName: string;
  targetServerName: string;
  targetCharacterName: string;
  transferCostRmb: number;
  occurredAt: string;
  note?: string;
}

export interface MhxyInventoryTransferRecord extends MhxyInventoryTransferInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface MhxyInventoryTarget {
  itemName: string;
  serverName: string;
  characterName: string;
  expectedSellServerName: string;
  updatedAt: string;
}

export interface MhxyTradeResult {
  tradeId: string;
  costBasisRmb: number;
  netIncomeRmb: number;
  realizedProfitRmb: number;
}

export interface MhxyInventoryPosition {
  itemName: string;
  serverName: string;
  characterName: string;
  quantity: number;
  inventoryCostRmb: number;
  averageUnitCostRmb: number;
  expectedSellServerName: string;
  latestRmbUnitPrice: number | null;
  valuationSourceName: string | null;
  marketValueRmb: number | null;
  unrealizedProfitRmb: number | null;
}

export type MhxyAssetFlipCategory = "role" | "summon" | "equipment";
export type MhxyAssetFlipStatus = "holding" | "sold";
export type MhxyAssetPurchaseCurrency = "rmb" | "gameCoin";

export interface MhxyGameCoinPurchaseInput {
  acquiredAt: string;
  gameCoinAmount: number;
  rmbCost: number;
  serverName?: string;
  characterName?: string;
  note?: string;
}

export interface MhxyGameCoinPurchaseRecord extends MhxyGameCoinPurchaseInput {
  id: string;
  rmbPerGameCoinWan?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MhxyGameCoinPurchasePosition extends MhxyGameCoinPurchaseRecord {
  remainingGameCoinAmount: number;
  remainingRmbCost: number;
}

export type MhxyGameCoinWalletPurpose = "procurement" | "liquidation";

export interface MhxyGameCoinWalletPosition {
  purpose: MhxyGameCoinWalletPurpose;
  serverName: string;
  characterName: string;
  gameCoinAmount: number;
  rmbCostBasis: number;
  averageRmbPerGameCoinWan: number;
}

export interface MhxyGameCoinCashoutInput {
  occurredAt: string;
  serverName: string;
  characterName: string;
  gameCoinAmount: number;
  rmbReceived: number;
  note?: string;
}

export interface MhxyGameCoinCashoutRecord extends MhxyGameCoinCashoutInput {
  id: string;
  rmbPerGameCoinWan: number;
  costBasisRmb: number;
  realizedProfitRmb: number;
  createdAt: string;
  updatedAt: string;
}

export interface MhxyGameCoinCashoutSummary {
  gameCoinAmount: number;
  rmbReceived: number;
  realizedProfitRmb: number;
}

export type MhxyAssetGameCoinAllocation = MhxyGameCoinAllocation;

export interface MhxyAssetFlipInput {
  category: MhxyAssetFlipCategory;
  name: string;
  buyAt: string;
  purchaseCurrency?: MhxyAssetPurchaseCurrency;
  buyPriceRmb?: number;
  gameCoinCost?: number;
  sellAt?: string;
  sellPriceRmb?: number;
  serverName?: string;
  characterName?: string;
  note?: string;
}

export interface MhxyAssetFlipRecord extends Omit<MhxyAssetFlipInput, "buyPriceRmb"> {
  id: string;
  buyPriceRmb: number;
  purchaseCurrency: MhxyAssetPurchaseCurrency;
  gameCoinAllocations?: MhxyAssetGameCoinAllocation[];
  sellPriceRmb?: number;
  status: MhxyAssetFlipStatus;
  profitRmb: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MhxyAssetFlipSummary {
  holdingCount: number;
  soldCount: number;
  holdingCostRmb: number;
  realizedProfitRmb: number;
  realizedRevenueRmb: number;
}

export interface MhxyDashboardSummary {
  inventoryCostRmb: number;
  realizedProfitRmb: number;
  marketValueRmb: number;
  unrealizedProfitRmb: number;
  pendingValuationCount: number;
}

export interface MhxyCombinedSummary {
  holdingCostRmb: number;
  realizedProfitRmb: number;
  gameCoinBalanceCostRmb: number;
  mainLedgerMarketValueRmb: number;
  mainLedgerUnrealizedProfitRmb: number;
}

export interface MhxyDataSet {
  trades: MhxyTradeRecord[];
  priceSnapshots: MhxyPriceSnapshot[];
  inventoryTransfers: MhxyInventoryTransferRecord[];
  inventoryTargets: MhxyInventoryTarget[];
  assetFlips: MhxyAssetFlipRecord[];
  gameCoinPurchases: MhxyGameCoinPurchaseRecord[];
  gameCoinCashouts?: MhxyGameCoinCashoutRecord[];
}

export interface MhxyDashboard {
  trades: MhxyTradeRecord[];
  tradeResults: MhxyTradeResult[];
  priceSnapshots: MhxyPriceSnapshot[];
  inventoryTransfers: MhxyInventoryTransferRecord[];
  inventoryTargets: MhxyInventoryTarget[];
  inventory: MhxyInventoryPosition[];
  summary: MhxyDashboardSummary;
  assetFlips: MhxyAssetFlipRecord[];
  assetFlipSummary: MhxyAssetFlipSummary;
  gameCoinPurchases: MhxyGameCoinPurchasePosition[];
  gameCoinCashouts: MhxyGameCoinCashoutRecord[];
  gameCoinWallets: MhxyGameCoinWalletPosition[];
  gameCoinCashoutSummary: MhxyGameCoinCashoutSummary;
  gameCoinBalance: {
    gameCoinAmount: number;
    rmbCost: number;
  };
  combinedSummary: MhxyCombinedSummary;
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
  permalink?: string | null;
  source: string;
  publishedAt: string;
  summary: string;
  category: NewsCategory;
  score?: number | null;
  selected?: boolean | null;
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

export type HistoryCommentReplyFactStatus = "ready" | "needs-verification";
export type HistoryCommentReplyInputMode = "manual" | "screenshot";

export interface HistoryCommentExtractionComment {
  commenterName: string | null;
  commentText: string;
}

export interface HistoryCommentTargetCandidate {
  targetNotificationId: string;
  targetModuleType: HistoryDynastyModuleType | null;
  sourceTitle: string;
  score: number;
}

export interface HistoryCommentExtraction {
  detectedNoteTitle: string | null;
  comments: HistoryCommentExtractionComment[];
  targetCandidates: HistoryCommentTargetCandidate[];
  warnings: string[];
}

export interface HistoryCommentReplyRecord {
  id: string;
  targetNotificationId: string;
  targetModuleType: HistoryDynastyModuleType | null;
  sourceTitle: string;
  commenterName: string | null;
  commentText: string;
  replyText: string;
  inputMode: HistoryCommentReplyInputMode;
  detectedNoteTitle: string | null;
  factualStatus: HistoryCommentReplyFactStatus;
  verificationNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryCommentReplyState {
  records: HistoryCommentReplyRecord[];
}

export type ImageToVideoProjectStage =
  | "INIT"
  | "FIRST_IMAGE_UPLOADED"
  | "IMAGE_ANALYZED"
  | "VIDEO_PLAN_GENERATED"
  | "WAITING_FOR_KEYFRAMES"
  | "MATERIALS_READY"
  | "FINAL_PROMPT_GENERATED";

export type ImageToVideoOperation = "analyzing" | "planning" | "planning-keyframes" | "reviewing" | "finalizing";
export type ImageRoleSuggestion = "首帧" | "中间帧" | "尾帧" | "风格参考";
export type KeyframeRole = "首帧" | "中间帧" | "尾帧";
export type KeyframeStatus = "PENDING" | "UPLOADED" | "REVIEWING" | "APPROVED" | "REJECTED" | "APPROVED_BY_USER";

export interface ImageToVideoAsset {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  url: string;
  createdAt: string;
}

export interface ImageAnalysisResult {
  imageId: string;
  suitableForVideo: boolean;
  unsuitableReason: string | null;
  roleSuggestion: ImageRoleSuggestion;
  subjectDescription: string;
  sceneDescription: string;
  composition: string;
  lighting: string;
  mood: string;
  style: string;
  motionPotential: string;
  risks: string[];
}

export interface VideoPlanKeyframeRecommendation {
  keyframeId: string;
  timestamp: number;
  role: KeyframeRole;
  reason: string;
}

export interface VideoPlan {
  videoDuration: number;
  coreConcept: string;
  visualStyle: string;
  cameraMovement: string;
  subjectMovement: string;
  sceneMovement: string;
  rhythm: string;
  emotionalArc: string;
  recommendedKeyframes: VideoPlanKeyframeRecommendation[];
  bgmSuggestion: string;
  soundEffectSuggestion: string;
  reason: string;
}

export interface KeyframeReviewResult {
  keyframeId: string;
  approved: boolean;
  score: number;
  problems: string[];
  improvementAdvice: string;
  revisedGenerationPrompt: string;
  revisedNegativePrompt: string;
  reviewedAt?: string;
}

export interface KeyframeRequirement {
  keyframeId: string;
  timestamp: number;
  role: KeyframeRole;
  requiredImageDescription: string;
  purpose: string;
  transitionRelation: string;
  generationPrompt: string;
  negativePrompt: string;
  status: KeyframeStatus;
  imageAssetId?: string;
  reviewResult?: KeyframeReviewResult;
  reviewHistory?: KeyframeReviewResult[];
}

export interface FinalVideoPrompt {
  duration: number;
  keyframeTimeline: Array<{
    keyframeId: string;
    timestamp: number;
    description: string;
  }>;
  promptText: string;
  negativePrompt: string;
  bgm: string;
  soundEffects: string[];
  usageNotes: string;
}

export interface ImageToVideoProject {
  id: string;
  title: string;
  stage: ImageToVideoProjectStage;
  activeOperation: ImageToVideoOperation | null;
  lastError: string | null;
  originalImageAssetId: string | null;
  assets: ImageToVideoAsset[];
  imageAnalysis: ImageAnalysisResult | null;
  videoPlan: VideoPlan | null;
  keyframes: KeyframeRequirement[];
  finalPrompt: FinalVideoPrompt | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageToVideoState {
  projects: ImageToVideoProject[];
  recentProjectIds: string[];
}

export interface ImageToVideoDashboardSummary {
  projectCount: number;
  latestProject: ImageToVideoProject | null;
  waitingKeyframeCount: number;
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

export interface BrowserAutomationObservation {
  url: string;
  title: string;
  text: string;
  screenshotDataUrl?: string;
  capturedAt: string;
}

export interface BrowserAutomationStepBase {
  id: string;
  label?: string;
  timeoutMs?: number;
}

export interface BrowserAutomationImageTarget {
  imageDataUrl: string;
  prompt?: string;
}

export interface BrowserAutomationOpenUrlStep extends BrowserAutomationStepBase {
  type: "openUrl";
  url: string;
}

export interface BrowserAutomationClickStep extends BrowserAutomationStepBase {
  type: "click";
  selector?: string;
  imageTarget?: BrowserAutomationImageTarget;
  targetPrompt?: string;
  x?: number;
  y?: number;
}

export interface BrowserAutomationTypeStep extends BrowserAutomationStepBase {
  type: "type";
  selector?: string;
  imageTarget?: BrowserAutomationImageTarget;
  targetPrompt?: string;
  text: string;
  clearBeforeType?: boolean;
}

export interface BrowserAutomationPressStep extends BrowserAutomationStepBase {
  type: "press";
  key: string;
}

export interface BrowserAutomationDelayStep extends BrowserAutomationStepBase {
  type: "delay";
  durationMs: number;
}

export interface BrowserAutomationExtractStep extends BrowserAutomationStepBase {
  type: "extract";
  name: string;
  selector?: string;
}

export interface BrowserAutomationWaitForConditionStep extends BrowserAutomationStepBase {
  type: "waitForCondition";
  conditionPrompt: string;
  intervalMs: number;
  timeoutMs: number;
  onMatched?: string[];
  onTimeout: "fail" | string[];
}

export interface BrowserAutomationIfElseStep extends BrowserAutomationStepBase {
  type: "ifElse";
  conditionPrompt: string;
  thenStepIds: string[];
  elseStepIds: string[];
}

export type BrowserAutomationStep =
  | BrowserAutomationOpenUrlStep
  | BrowserAutomationClickStep
  | BrowserAutomationTypeStep
  | BrowserAutomationPressStep
  | BrowserAutomationDelayStep
  | BrowserAutomationExtractStep
  | BrowserAutomationWaitForConditionStep
  | BrowserAutomationIfElseStep;

export interface BrowserAutomationWorkflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  steps: BrowserAutomationStep[];
  createdAt: string;
  updatedAt: string;
}

export type BrowserAutomationRunStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export interface BrowserAutomationRunLog {
  id: string;
  stepId?: string;
  level: EventLogLevel;
  message: string;
  createdAt: string;
  details?: Record<string, unknown>;
}

export interface BrowserAutomationRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: BrowserAutomationRunStatus;
  trigger: TaskTrigger;
  taskId?: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  logs: BrowserAutomationRunLog[];
  lastObservation: BrowserAutomationObservation | null;
  extracted: Record<string, string>;
}

export interface BrowserAutomationTriggerRule {
  id: string;
  name: string;
  workflowId: string;
  enabled: boolean;
  match: {
    agentId?: string;
    status?: TaskStatus;
    trigger?: TaskTrigger;
    summaryIncludes?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BrowserAutomationState {
  workflows: BrowserAutomationWorkflow[];
  runs: BrowserAutomationRun[];
  triggerRules: BrowserAutomationTriggerRule[];
  lastUpdatedAt: string | null;
}

export type ScreenMonitorSessionStatus = "running" | "stopped";
export type ScreenMonitorObservationStatus = "completed" | "failed";
export type ScreenMonitorObservationTrigger = "initial" | "interval" | "manual";

export interface ScreenMonitorObservation {
  id: string;
  sessionId: string;
  checkedAt: string;
  status: ScreenMonitorObservationStatus;
  trigger: ScreenMonitorObservationTrigger;
  resultText: string;
  confidence: number | null;
  done: boolean;
  announcement: string;
  reason: string;
  announced: boolean;
  error: string | null;
}

export interface ScreenMonitorSession {
  id: string;
  prompt: string;
  intervalMs: number;
  muted: boolean;
  status: ScreenMonitorSessionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  stoppedAt: string | null;
  lastObservationId: string | null;
  lastResultText: string | null;
  lastAnnouncement: string | null;
  lastError: string | null;
  observations: ScreenMonitorObservation[];
}

export interface ScreenMonitorState {
  sessions: ScreenMonitorSession[];
  activeSessionId: string | null;
  lastUpdatedAt: string | null;
}

export type DataSyncModule = "history" | "mhxy" | "browser-automation";
export type DataSyncActivityStatus = "idle" | "syncing" | "synced" | "conflict" | "failed";
export type DataSyncResolutionChoice = "local" | "remote";

export interface DataSyncResolution {
  key: string;
  choice: DataSyncResolutionChoice;
}

export interface DataSyncConflict {
  key: string;
  recordType: string;
  recordId: string;
  baseline: Record<string, unknown> | null;
  local: Record<string, unknown> | null;
  remote: Record<string, unknown> | null;
}

export interface DataSyncModuleStatus {
  module: DataSyncModule;
  status: DataSyncActivityStatus;
  lastSyncedAt: string | null;
  lastCommit: string | null;
  error: string | null;
}

export interface DataSyncStatusResponse {
  enabled: boolean;
  branch: string;
  modules: Record<DataSyncModule, DataSyncModuleStatus>;
}

export type DataSyncResult =
  | {
      status: "synced";
      module: DataSyncModule;
      commitSha: string;
      pulledCount: number;
      pushedCount: number;
      deletedCount: number;
      lastSyncedAt: string;
    }
  | {
      status: "conflict";
      module: DataSyncModule;
      conflictToken: string;
      remoteCommitSha: string | null;
      conflicts: DataSyncConflict[];
    }
  | {
      status: "failed";
      module: DataSyncModule;
      error: string;
    };

export type PromptTemplateAnalysisStatus = "pending" | "completed" | "failed";

export interface PromptTemplateVariable {
  id: string;
  key: string;
  label: string;
  description: string;
  defaultValue: string;
  required: boolean;
}

export interface PromptTemplateRecord {
  id: string;
  title: string;
  originalPrompt: string;
  templatePrompt: string;
  variables: PromptTemplateVariable[];
  analysisStatus: PromptTemplateAnalysisStatus;
  analysisError: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface PromptTemplateState {
  items: PromptTemplateRecord[];
  lastUpdatedAt: string | null;
}

export interface PromptTemplateApplyResult {
  templateId: string;
  finalPrompt: string;
  values: Record<string, string>;
  generatedAt: string;
}

export type ChildMealPlanType = "today" | "tomorrow" | "three_days" | "seven_days";
export type ChildMealType = "breakfast" | "lunch" | "dinner" | "snack" | "milk" | "fruit";
export type ChildMealAcceptance = "喜欢" | "一般" | "不喜欢" | "拒绝";

export interface ChildProfile {
  id: string;
  name: string;
  birthDate: string;
  height: string;
  weight: string;
  region: string;
  premature: boolean;
  chewingAbility: string;
  allergies: string[];
  dislikedFoods: string[];
  favoriteFoods: string[];
  milkNote: string;
  sleepNote: string;
  wakeTime: string;
  bedtime: string;
  napNote: string;
  householdIngredients: string[];
  householdRestrictions: string[];
  cookingEquipment: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChildSummary {
  birthDate: string;
  ageText: string;
  monthAge: number;
  stage: string;
  importantNotes: string[];
}

export interface ChildNote {
  id: string;
  childId: string;
  date: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChildMealRecord {
  id: string;
  childId: string;
  date: string;
  mealType: ChildMealType;
  foodName: string;
  ingredients: string[];
  cookingMethods: string[];
  amount: string;
  acceptance: ChildMealAcceptance;
  discomfort: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedMeal {
  mealType: ChildMealType;
  mealName: string;
  ingredients: string[];
  cookingMethods: string[];
  textureAdvice: string;
  simpleSteps: string[];
  nutritionPurpose: string;
  safetyNotes: string[];
}

export interface MealPlanDay {
  date: string;
  dailyNutritionFocus: string;
  avoidRepeatReason: string;
  meals: PlannedMeal[];
  cookingOrder: string[];
  fruitSuggestion: string;
  milkAndWaterNote: string;
  parentNotes: string[];
}

export interface ChildMealPlan {
  id?: string;
  childId?: string;
  childSummary: ChildSummary;
  planType: ChildMealPlanType;
  dateRange: { start: string; end: string };
  days: MealPlanDay[];
  weeklyBalanceSummary: {
    proteinRotation: string[];
    vegetableRotation: string[];
    fruitRotation: string[];
    stapleFoodRotation: string[];
  };
  warnings: string[];
  notMedicalAdvice: string;
  generatedReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChildMealHistoryStats {
  frequentIngredients30d: Array<{ name: string; count: number }>;
  rejectedFoods: string[];
  discomfortFoods: string[];
  likedFoods: string[];
  proteinRotation: string[];
  vegetableRotation: string[];
  fruitRotation: string[];
}

export interface ChildMealState {
  profile: ChildProfile;
  notes: ChildNote[];
  records: ChildMealRecord[];
  plans: ChildMealPlan[];
  lastUpdatedAt: string | null;
}

export interface ChildMealOverview {
  profile: ChildProfile;
  childSummary: ChildSummary;
  recentNotes: ChildNote[];
  todayRecords: ChildMealRecord[];
  recentRecords: ChildMealRecord[];
  savedPlans: ChildMealPlan[];
  historyStats: ChildMealHistoryStats;
  warnings: string[];
}

export type InterviewSkillCategory = "基础高频" | "全栈模块" | "AI 模块" | "实战模块";
export type InterviewQuestionType = "short-answer" | "code";
export type InterviewQuestionDifficulty = "basic" | "middle" | "advanced";
export type InterviewSessionStatus = "active" | "completed";
export type InterviewMastery = "未掌握" | "基本掌握" | "掌握";

export interface InterviewSkillModule {
  id: string;
  label: string;
  category: InterviewSkillCategory;
  description: string;
  targetSkills: string[];
  defaultWeight: number;
  weaknessBoost: number;
}

export interface InterviewQuestion {
  id: string;
  sessionId: string;
  date: string;
  moduleId: string;
  type: InterviewQuestionType;
  difficulty: InterviewQuestionDifficulty;
  prompt: string;
  targetSkill: string;
  expectedPoints: string[];
  referenceAnswer: string;
  rubric: string[];
  createdAt: string;
}

export interface InterviewAnswer {
  id: string;
  questionId: string;
  sessionId: string;
  date: string;
  answerText: string;
  aiScore: number | null;
  manualScore: number | null;
  finalScore: number | null;
  feedback: string;
  strengths: string[];
  gaps: string[];
  mistakeTags: string[];
  referenceAnswer: string;
  mastery: InterviewMastery;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewModuleScore {
  moduleId: string;
  label: string;
  completedCount: number;
  averageScore: number | null;
}

export interface InterviewDailyReport {
  id: string;
  date: string;
  sessionId: string;
  completedCount: number;
  totalCount: number;
  averageScore: number | null;
  moduleScores: InterviewModuleScore[];
  weakPoints: string[];
  summary: string;
  nextSuggestions: string[];
  updatedAt: string;
}

export interface InterviewDailySession {
  id: string;
  date: string;
  moduleIds: string[];
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  report: InterviewDailyReport;
  status: InterviewSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewWeakModule {
  id: string;
  label: string;
  category: InterviewSkillCategory;
  score: number | null;
  reason: string;
}

export interface InterviewState {
  skillModules: InterviewSkillModule[];
  sessions: InterviewDailySession[];
  lastUpdatedAt: string | null;
}

export interface InterviewOverview {
  skillModules: InterviewSkillModule[];
  weakModules: InterviewWeakModule[];
  todaySession: InterviewDailySession | null;
  recentReports: InterviewDailyReport[];
  wrongAnswers: InterviewAnswer[];
  todayReport: InterviewDailyReport | null;
  streakDays: number;
  estimatedMinutes: number;
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
  imageToVideo?: ImageToVideoState;
  browserAutomation?: BrowserAutomationState;
  screenMonitor?: ScreenMonitorState;
  promptTemplates?: PromptTemplateState;
  childMeal?: ChildMealState;
  interview?: InterviewState;
  summary: SummaryState;
  historyPush: HistoryPushState;
  historyXhs?: HistoryXhsState;
  historyCommentReplies?: HistoryCommentReplyState;
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
  imageToVideo?: ImageToVideoState & {
    dashboard: ImageToVideoDashboardSummary;
  };
  browserAutomation?: BrowserAutomationState;
  screenMonitor?: ScreenMonitorState;
  promptTemplates?: PromptTemplateState;
  childMeal?: ChildMealState;
  interview?: InterviewState;
  summary: SummaryState & {
    dashboard: SummaryDashboard;
  };
  historyXhs?: HistoryXhsState;
  historyCommentReplies?: HistoryCommentReplyState;
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
