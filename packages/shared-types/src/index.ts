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
  | "ai"
  | "technology"
  | "economy"
  | "entertainment"
  | "world";
export type NewsImportance = "low" | "medium" | "high";

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  category: NewsCategory;
  enabled: boolean;
  createdAt: string;
  lastFetchedAt?: string;
}

export interface NewsRawItem {
  id: string;
  sourceId: string;
  sourceName: string;
  category: NewsCategory;
  title: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  fingerprint: string;
}

export type NewsArticleBodyStatus = "ready" | "failed";

export interface NewsArticleBody {
  rawItemId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  content: string;
  excerpt: string;
  fetchedAt: string;
  status: NewsArticleBodyStatus;
  error?: string;
}

export interface NewsAnalysis {
  generatedAt: string;
  perspectives: string[];
  personalImpact: string;
  possibleChanges: string;
  relationToMe: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: NewsCategory;
  importance: NewsImportance;
  sourceCount: number;
  sources: string[];
  rawItemIds: string[];
  updatedAt: string;
  analysis?: NewsAnalysis;
}

export interface NewsState {
  items: NewsItem[];
  rawItems: NewsRawItem[];
  sources: NewsSource[];
  lastFetchedAt: string | null;
  lastUpdatedAt: string | null;
  lastSummarizedAt: string | null;
  lastSummaryInputItemIds: string[];
  lastSummaryProvider: "llm" | "fallback" | "none";
  lastSummaryError: string | null;
  status: "idle" | "refreshing";
}

export interface NewsItemArticlesResponse {
  itemId: string;
  articles: NewsArticleBody[];
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
  newsBodies: NewsArticleBody[];
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
