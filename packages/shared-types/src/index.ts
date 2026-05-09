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

export interface LedgerEntry {
  id: string;
  module: string;
  direction: LedgerDirection;
  amount: number;
  note: string;
  createdAt: string;
  taskId: string;
}

export interface LedgerState {
  entries: LedgerEntry[];
  modules: string[];
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

export interface TopicIdea {
  id: string;
  batchId: string;
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

export interface TopicState {
  current: TopicIdea[];
  history: TopicIdea[];
  lastGeneratedAt: string | null;
  nextRunAt: string | null;
  status: "idle" | "generating";
  strategy: "news-to-content";
  lastError: string | null;
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
  ledger: LedgerState;
  schedule: ScheduleState;
  news: NewsState;
  topics: TopicState;
  historyPush: HistoryPushState;
  nightlyReview: NightlyReviewState;
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
  ledger: LedgerState & {
    summary: {
      todayExpense: number;
      todayIncome: number;
      balance: number;
    };
  };
  schedule: ScheduleState & {
    todayItems: ScheduleItem[];
  };
  news: NewsState;
  topics: TopicState;
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
