import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  NewsAnalysis,
  NewsCategory,
  NewsImportance,
  NewsItem,
  NewsRawItem,
  NewsState
} from "@agent-zy/shared-types";

const AIHOT_BASE_URL = "https://aihot.virxact.com";
const AIHOT_SOURCE_ID = "aihot";
const AIHOT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  "ai-models": "模型发布/更新",
  "ai-products": "产品发布/更新",
  industry: "行业动态",
  paper: "论文研究",
  tip: "技巧与观点"
};

const CATEGORY_VALUES = new Set<NewsCategory>(
  Object.keys(CATEGORY_LABELS) as NewsCategory[]
);

interface AihotItem {
  id: string;
  title: string;
  title_en?: string | null;
  url: string;
  source: string;
  publishedAt?: string | null;
  summary?: string | null;
  category?: string | null;
}

interface AihotItemsResponse {
  count: number;
  hasNext: boolean;
  nextCursor: string | null;
  items: AihotItem[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNewsState(news: Partial<NewsState> | undefined): NewsState {
  return {
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
}

function parseCategory(value: string | null | undefined): NewsCategory {
  return value && CATEGORY_VALUES.has(value as NewsCategory)
    ? (value as NewsCategory)
    : "industry";
}

function parseTake(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function parseMode(value: unknown): "selected" | "all" {
  return value === "all" ? "all" : "selected";
}

function buildAihotItemsUrl(meta: AgentExecutionRequest["meta"]): string {
  const baseUrl = process.env.AIHOT_BASE_URL ?? AIHOT_BASE_URL;
  const url = new URL("/api/public/items", baseUrl);
  const mode = parseMode(meta?.mode);
  const category = asString(meta?.category);
  const q = asString(meta?.q)?.trim();
  const since = asString(meta?.since)?.trim();

  url.searchParams.set("mode", mode);

  if (category && CATEGORY_VALUES.has(category as NewsCategory)) {
    url.searchParams.set("category", category);
  }

  if (q) {
    url.searchParams.set("q", q.slice(0, 200));
  }

  if (since) {
    url.searchParams.set("since", since);
  }

  url.searchParams.set("take", String(parseTake(meta?.take)));

  return url.href;
}

function parseAihotItemsPayload(payload: unknown): AihotItemsResponse | null {
  const record = asRecord(payload);

  if (!record || !Array.isArray(record.items)) {
    return null;
  }

  const items = record.items.flatMap((value) => {
    const item = asRecord(value);
    const id = asString(item?.id);
    const title = asString(item?.title);
    const url = asString(item?.url);
    const source = asString(item?.source);

    if (!id || !title || !url || !source) {
      return [];
    }

    return [
      {
        id,
        title,
        title_en: asString(item?.title_en),
        url,
        source,
        publishedAt: asString(item?.publishedAt),
        summary: asString(item?.summary),
        category: asString(item?.category)
      }
    ];
  });

  return {
    count: typeof record.count === "number" ? record.count : items.length,
    hasNext: record.hasNext === true,
    nextCursor: asString(record.nextCursor),
    items
  };
}

async function fetchAihotItems(url: string): Promise<AihotItemsResponse> {
  if (process.env.AIHOT_ITEMS_FIXTURE_JSON) {
    const payload = parseAihotItemsPayload(JSON.parse(process.env.AIHOT_ITEMS_FIXTURE_JSON));

    if (!payload) {
      throw new Error("AI HOT 测试夹具格式不可用");
    }

    return payload;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": AIHOT_USER_AGENT
    },
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.text();
  const parsed = (() => {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    const message =
      asString(asRecord(parsed)?.error) ??
      asString(asRecord(parsed)?.message) ??
      `AI HOT 请求失败，HTTP ${response.status}`;
    throw new Error(message.includes(`HTTP ${response.status}`) ? message : `${message} (HTTP ${response.status})`);
  }

  const payload = parseAihotItemsPayload(parsed);

  if (!payload) {
    throw new Error("AI HOT 返回数据格式不可用");
  }

  return payload;
}

function inferImportance(index: number, item: AihotItem): NewsImportance {
  if (index < 3 || /openai|anthropic|claude|gpt|sora|gemini/i.test(`${item.title} ${item.source}`)) {
    return "high";
  }

  if (index < 10) {
    return "medium";
  }

  return "low";
}

function mapAihotItemToRawItem(item: AihotItem, requestedAt: string): NewsRawItem {
  const category = parseCategory(item.category);

  return {
    id: `raw-${item.id}`,
    sourceId: AIHOT_SOURCE_ID,
    sourceName: item.source,
    category,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt ?? requestedAt,
    fetchedAt: requestedAt,
    fingerprint: item.id
  };
}

function mapAihotItemToNewsItem(
  item: AihotItem,
  rawItem: NewsRawItem,
  index: number,
  previousItems: NewsItem[]
): NewsItem {
  const id = `news-${item.id}`;
  const cachedAnalysis = previousItems.find((previous) => previous.id === id)?.analysis;

  return {
    id,
    title: item.title,
    summary:
      item.summary?.trim() ||
      `${CATEGORY_LABELS[rawItem.category]}出现新动态，建议打开原文确认细节。`,
    category: rawItem.category,
    importance: inferImportance(index, item),
    sourceCount: 1,
    sources: [item.source],
    rawItemIds: [rawItem.id],
    updatedAt: rawItem.publishedAt,
    analysis: cachedAnalysis
  };
}

function sortNewsItems(items: NewsItem[]): NewsItem[] {
  const importanceRank: Record<NewsImportance, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  return [...items].sort(
    (left, right) =>
      importanceRank[right.importance] - importanceRank[left.importance] ||
      right.updatedAt.localeCompare(left.updatedAt)
  );
}

async function refreshNews(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
  const news = toNewsState(input.state.news);
  const url = buildAihotItemsUrl(input.meta);

  try {
    const payload = await fetchAihotItems(url);
    const rawItems = payload.items.map((item) => mapAihotItemToRawItem(item, input.requestedAt));
    const items = sortNewsItems(
      payload.items.map((item, index) =>
        mapAihotItemToNewsItem(item, rawItems[index], index, news.items)
      )
    );

    return {
      status: "completed",
      summary: `刷新 AI HOT ${items.length} 条`,
      assistantMessage:
        items.length > 0
          ? `已从 AI HOT 拉取 ${items.length} 条热点。`
          : "AI HOT 当前没有返回匹配热点。",
      notifications:
        input.trigger === "schedule" && items.length > 0
          ? [
              {
                kind: "news-refresh",
                title: "AI HOT 已更新",
                body: `同步 ${items.length} 条 AI 热点。`
              }
            ]
          : undefined,
      domainUpdates: {
        news: {
          ...news,
          items,
          rawItems,
          sources: [],
          lastFetchedAt: input.requestedAt,
          lastUpdatedAt: input.requestedAt,
          lastSummarizedAt: input.requestedAt,
          lastSummaryInputItemIds: rawItems.map((item) => item.id),
          lastSummaryProvider: "aihot",
          lastSummaryError: null,
          status: "idle"
        }
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI HOT 请求异常";

    return {
      status: "failed",
      summary: "AI HOT 刷新失败",
      assistantMessage: `AI HOT 刷新失败：${message}`,
      domainUpdates: {
        news: {
          ...news,
          lastUpdatedAt: input.requestedAt,
          lastSummaryProvider: "none",
          lastSummaryError: message,
          status: "idle"
        }
      }
    };
  }
}

function createAnalysis(item: NewsItem, requestedAt: string): NewsAnalysis {
  return {
    generatedAt: requestedAt,
    perspectives: [
      `信息判断：${item.title} 属于 ${CATEGORY_LABELS[item.category]}，适合先核对原文再决定是否跟进。`,
      `产品机会：如果该动态影响工具链或内容生产，可以沉淀为工作台监控、选题或提醒能力。`,
      `风险提醒：AI HOT 摘要用于快速筛选，引用前仍应回到原文链接确认。`
    ],
    personalImpact: "这条热点可以作为个人 Agent 工作台的能力边界、自动化优先级或内容选题输入。",
    possibleChanges: "它可能影响模型选型、产品集成、内容方向或信息源监控策略。",
    relationToMe: "与你的关系在于：把外部 AI 动态转成可执行的下一步，而不是只停留在资讯阅读。"
  };
}

function analyzeNews(input: AgentExecutionRequest): AgentExecutionResult {
  const news = toNewsState(input.state.news);
  const itemId = String(input.meta?.itemId ?? "");
  const item = news.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    return {
      status: "failed",
      summary: "未找到 AI HOT 条目",
      assistantMessage: "没有找到要分析的 AI HOT 条目。"
    };
  }

  if (item.analysis) {
    return {
      status: "completed",
      summary: "返回缓存 AI HOT 分析",
      assistantMessage: `已返回缓存分析：${item.title}`,
      domainUpdates: {
        news
      }
    };
  }

  return {
    status: "completed",
    summary: "生成 AI HOT 分析",
    assistantMessage: `已完成分析：${item.title}`,
    domainUpdates: {
      news: {
        ...news,
        items: news.items.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                analysis: createAnalysis(candidate, input.requestedAt)
              }
            : candidate
        ),
        lastUpdatedAt: input.requestedAt
      }
    }
  };
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (input.meta?.action === "analyze") {
      return analyzeNews(input);
    }

    return refreshNews(input);
  }
});

export default agent;
