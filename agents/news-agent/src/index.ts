import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  NewsCategory,
  NewsDailyArchiveItem,
  NewsDailyReport,
  NewsFeedItem,
  NewsFeedResponse,
  NewsState
} from "@agent-zy/shared-types";

const AIHOT_BASE_URL = "https://aihot.virxact.com";
const AIHOT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CATEGORY_VALUES = new Set<NewsCategory>([
  "ai-models",
  "ai-products",
  "industry",
  "paper",
  "tip"
]);

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

function emptyFeed(): NewsFeedResponse {
  return {
    count: 0,
    hasNext: false,
    nextCursor: null,
    items: []
  };
}

function toNewsState(news: Partial<NewsState> | undefined): NewsState {
  return {
    feed: news?.feed ?? emptyFeed(),
    daily: news?.daily ?? null,
    dailyArchive: news?.dailyArchive ?? [],
    lastFetchedAt: news?.lastFetchedAt ?? news?.lastUpdatedAt ?? null,
    lastUpdatedAt: news?.lastUpdatedAt ?? null,
    lastError: news?.lastError ?? null,
    status: news?.status ?? "idle"
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseCategory(value: string | null | undefined): NewsCategory {
  return value && CATEGORY_VALUES.has(value as NewsCategory)
    ? (value as NewsCategory)
    : "industry";
}

function parseTake(value: unknown, fallback = 50): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function baseUrl() {
  return process.env.AIHOT_BASE_URL ?? AIHOT_BASE_URL;
}

function buildItemsUrl(meta: AgentExecutionRequest["meta"]): string {
  const url = new URL("/api/public/items", baseUrl());
  const category = asString(meta?.category);
  const q = asString(meta?.q)?.trim();
  const since = asString(meta?.since)?.trim();
  const cursor = asString(meta?.cursor)?.trim();

  url.searchParams.set("mode", "all");

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

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  return url.href;
}

function buildDailyUrl(meta: AgentExecutionRequest["meta"]): string {
  const date = asString(meta?.date)?.trim();

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new URL(`/api/public/daily/${date}`, baseUrl()).href;
  }

  return new URL("/api/public/daily", baseUrl()).href;
}

function buildDailiesUrl(): string {
  const url = new URL("/api/public/dailies", baseUrl());
  url.searchParams.set("take", "14");
  return url.href;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, fixture: string | undefined): Promise<unknown> {
  if (fixture) {
    return JSON.parse(fixture) as unknown;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": AIHOT_USER_AGENT
    },
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.text();
  const parsed = parseJson(body);

  if (!response.ok) {
    const message =
      asString(asRecord(parsed)?.error) ??
      asString(asRecord(parsed)?.message) ??
      `AI HOT 请求失败，HTTP ${response.status}`;
    throw new Error(message.includes(`HTTP ${response.status}`) ? message : `${message} (HTTP ${response.status})`);
  }

  return parsed;
}

function parseFeedItem(value: unknown): NewsFeedItem | null {
  const item = asRecord(value);
  const id = asString(item?.id);
  const title = asString(item?.title);
  const url = asString(item?.url);
  const source = asString(item?.source);

  if (!id || !title || !url || !source) {
    return null;
  }

  return {
    id,
    title,
    titleEn: asString(item?.title_en),
    url,
    source,
    publishedAt: asString(item?.publishedAt) ?? new Date(0).toISOString(),
    summary: asString(item?.summary)?.trim() || "AI HOT 暂无摘要，建议打开原文查看细节。",
    category: parseCategory(asString(item?.category))
  };
}

function parseFeedPayload(payload: unknown): NewsFeedResponse {
  const record = asRecord(payload);

  if (!record || !Array.isArray(record.items)) {
    throw new Error("AI HOT 热点数据格式不可用");
  }

  const items = record.items
    .map(parseFeedItem)
    .filter((item): item is NewsFeedItem => item !== null);

  return {
    count: typeof record.count === "number" ? record.count : items.length,
    hasNext: record.hasNext === true,
    nextCursor: asString(record.nextCursor),
    items
  };
}

function parseDailyLead(value: unknown): NewsDailyReport["lead"] {
  if (typeof value === "string") {
    return {
      title: value,
      summary: value
    };
  }

  const record = asRecord(value);
  const title = asString(record?.title) ?? "AI HOT 日报";

  return {
    title,
    summary: asString(record?.summary) ?? title
  };
}

function parseDailyPayload(payload: unknown): NewsDailyReport {
  const record = asRecord(payload);
  const date = asString(record?.date);
  const generatedAt = asString(record?.generatedAt);

  if (!record || !date || !generatedAt) {
    throw new Error("AI HOT 日报数据格式不可用");
  }

  return {
    date,
    generatedAt,
    windowStart: asString(record.windowStart),
    windowEnd: asString(record.windowEnd),
    lead: parseDailyLead(record.lead),
    sections: Array.isArray(record.sections)
      ? record.sections.flatMap((sectionValue) => {
          const section = asRecord(sectionValue);
          const label = asString(section?.label);

          if (!label || !Array.isArray(section?.items)) {
            return [];
          }

          return [
            {
              label,
              items: section.items.flatMap((itemValue) => {
                const item = asRecord(itemValue);
                const title = asString(item?.title);
                const summary = asString(item?.summary);

                if (!title || !summary) {
                  return [];
                }

                return [
                  {
                    title,
                    summary,
                    sourceUrl: asString(item?.sourceUrl),
                    sourceName: asString(item?.sourceName) ?? "AI HOT"
                  }
                ];
              })
            }
          ];
        })
      : [],
    flashes: Array.isArray(record.flashes)
      ? record.flashes.filter((item): item is string => typeof item === "string")
      : []
  };
}

function parseArchivePayload(payload: unknown): NewsDailyArchiveItem[] {
  const record = asRecord(payload);

  if (!record || !Array.isArray(record.items)) {
    throw new Error("AI HOT 日报归档数据格式不可用");
  }

  return record.items.flatMap((value) => {
    const item = asRecord(value);
    const date = asString(item?.date);
    const generatedAt = asString(item?.generatedAt);
    const leadTitle = asString(item?.leadTitle);

    if (!date || !generatedAt || !leadTitle) {
      return [];
    }

    return [
      {
        date,
        generatedAt,
        leadTitle
      }
    ];
  });
}

async function refreshFeed(input: AgentExecutionRequest, news: NewsState): Promise<AgentExecutionResult> {
  const payload = await fetchJson(buildItemsUrl(input.meta), process.env.AIHOT_ITEMS_FIXTURE_JSON);
  const feed = parseFeedPayload(payload);

  return {
    status: "completed",
    summary: `刷新 AI HOT 全部 ${feed.items.length} 条`,
    assistantMessage:
      feed.items.length > 0
        ? `已从 AI HOT 拉取 ${feed.items.length} 条热点。`
        : "AI HOT 当前没有返回匹配热点。",
    notifications:
      input.trigger === "schedule" && feed.items.length > 0
        ? [
            {
              kind: "news-refresh",
              title: "AI HOT 已更新",
              body: `同步 ${feed.items.length} 条 AI 热点。`
            }
          ]
        : undefined,
    domainUpdates: {
      news: {
        ...news,
        feed,
        lastFetchedAt: input.requestedAt,
        lastUpdatedAt: input.requestedAt,
        lastError: null,
        status: "idle"
      }
    }
  };
}

async function refreshDaily(input: AgentExecutionRequest, news: NewsState): Promise<AgentExecutionResult> {
  const [dailyPayload, archivePayload] = await Promise.all([
    fetchJson(buildDailyUrl(input.meta), process.env.AIHOT_DAILY_FIXTURE_JSON),
    fetchJson(buildDailiesUrl(), process.env.AIHOT_DAILIES_FIXTURE_JSON)
  ]);
  const daily = parseDailyPayload(dailyPayload);
  const dailyArchive = parseArchivePayload(archivePayload);

  return {
    status: "completed",
    summary: `刷新 AI HOT 日报 ${daily.date}`,
    assistantMessage: `已同步 AI HOT ${daily.date} 日报。`,
    domainUpdates: {
      news: {
        ...news,
        daily,
        dailyArchive,
        lastFetchedAt: input.requestedAt,
        lastUpdatedAt: input.requestedAt,
        lastError: null,
        status: "idle"
      }
    }
  };
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const news = toNewsState(input.state.news);

    try {
      if (input.meta?.view === "daily") {
        return await refreshDaily(input, news);
      }

      return await refreshFeed(input, news);
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
            lastError: message,
            status: "idle"
          }
        }
      };
    }
  }
});

export default agent;
