import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, NewsState } from "@agent-zy/shared-types";

import { agent } from "./index";

function mockAihotFetch(routes: Record<string, unknown>, status = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = routes[url] ?? { error: "missing route" };

    return {
      ok: status >= 200 && status < 300 && routes[url] !== undefined,
      status: routes[url] === undefined ? 404 : status,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "application/json" : null;
        }
      },
      text: async () => JSON.stringify(body),
      json: async () => body
    };
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createState(news?: Partial<NewsState>): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    ledger: {
      entries: [],
      modules: []
    },
    schedule: {
      items: [],
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
      status: "idle",
      ...news
    },
    topics: {
      current: [],
      history: [],
      lastGeneratedAt: null,
      nextRunAt: null,
      status: "idle",
      strategy: "news-to-content",
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

function createRequest(
  state: AppState,
  meta: AgentExecutionRequest["meta"],
  requestedAt = "2026-05-08T10:00:00.000Z"
): AgentExecutionRequest {
  return {
    taskId: `task-${requestedAt}`,
    trigger: "user",
    meta,
    requestedAt,
    state
  };
}

describe("news agent", () => {
  afterEach(() => {
    delete process.env.AIHOT_BASE_URL;
    delete process.env.AIHOT_ITEMS_FIXTURE_JSON;
    delete process.env.AIHOT_DAILY_FIXTURE_JSON;
    delete process.env.AIHOT_DAILIES_FIXTURE_JSON;
    vi.unstubAllGlobals();
  });

  it("refreshes AI HOT all items with browser user-agent and query parameters", async () => {
    const fetchMock = mockAihotFetch({
      "https://aihot.virxact.com/api/public/items?mode=all&category=paper&q=RAG&since=2026-05-01T00%3A00%3A00.000Z&take=30&cursor=abc": {
        count: 1,
        hasNext: true,
        nextCursor: "next",
        items: [
          {
            id: "cmow6i2aq036jslcxxneym5zm",
            title: "Claude v2.1.133 版本更新",
            title_en: "v2.1.133",
            url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.133",
            source: "Claude Code：GitHub Releases（RSS）",
            publishedAt: "2026-05-07T23:49:04.000Z",
            summary: "Claude 发布 v2.1.133 版本，新增多项配置与优化。",
            category: "ai-products"
          }
        ]
      }
    });

    const refreshed = await agent.execute(
      createRequest(createState(), {
        action: "refresh",
        view: "all",
        category: "paper",
        q: "RAG",
        since: "2026-05-01T00:00:00.000Z",
        take: 30,
        cursor: "abc"
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe(
      "https://aihot.virxact.com/api/public/items?mode=all&category=paper&q=RAG&since=2026-05-01T00%3A00%3A00.000Z&take=30&cursor=abc"
    );
    expect(calls[0][1]).toMatchObject({
      headers: {
        "User-Agent": expect.stringContaining("Mozilla/5.0")
      }
    });
    expect(refreshed.domainUpdates?.news).toMatchObject({
      feed: {
        count: 1,
        hasNext: true,
        nextCursor: "next",
        items: [
          {
            id: "cmow6i2aq036jslcxxneym5zm",
            title: "Claude v2.1.133 版本更新",
            source: "Claude Code：GitHub Releases（RSS）",
            url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.133",
            category: "ai-products"
          }
        ]
      },
      lastError: null,
      status: "idle"
    });
  });

  it("refreshes the latest daily report and archive", async () => {
    const fetchMock = mockAihotFetch({
      "https://aihot.virxact.com/api/public/daily": {
        date: "2026-05-08",
        generatedAt: "2026-05-08T11:00:00.000Z",
        windowStart: "2026-05-07T00:00:00.000Z",
        windowEnd: "2026-05-08T00:00:00.000Z",
        lead: {
          title: "今日 AI 摘要",
          summary: "AI 产品和模型更新密集。"
        },
        sections: [
          {
            label: "模型",
            items: [
              {
                title: "模型更新",
                summary: "新模型发布。",
                sourceUrl: "https://example.com/model",
                sourceName: "Example"
              }
            ]
          }
        ],
        flashes: ["一分钟速览"]
      },
      "https://aihot.virxact.com/api/public/dailies?take=14": {
        count: 1,
        items: [
          {
            date: "2026-05-08",
            generatedAt: "2026-05-08T11:00:00.000Z",
            leadTitle: "今日 AI 摘要"
          }
        ]
      }
    });

    const refreshed = await agent.execute(
      createRequest(createState(), {
        action: "refresh",
        view: "daily"
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.domainUpdates?.news).toMatchObject({
      daily: {
        date: "2026-05-08",
        lead: {
          title: "今日 AI 摘要"
        },
        sections: [
          {
            label: "模型",
            items: [
              {
                title: "模型更新",
                sourceName: "Example"
              }
            ]
          }
        ],
        flashes: ["一分钟速览"]
      },
      dailyArchive: [
        {
          date: "2026-05-08",
          leadTitle: "今日 AI 摘要"
        }
      ],
      lastError: null
    });
  });

  it("supports refreshing a daily report by date", async () => {
    const fetchMock = mockAihotFetch({
      "https://aihot.virxact.com/api/public/daily/2026-05-07": {
        date: "2026-05-07",
        generatedAt: "2026-05-07T11:00:00.000Z",
        windowStart: "2026-05-06T00:00:00.000Z",
        windowEnd: "2026-05-07T00:00:00.000Z",
        lead: "前一日 AI 摘要",
        sections: [],
        flashes: []
      },
      "https://aihot.virxact.com/api/public/dailies?take=14": {
        count: 0,
        items: []
      }
    });

    const refreshed = await agent.execute(
      createRequest(createState(), {
        action: "refresh",
        view: "daily",
        date: "2026-05-07"
      })
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("https://aihot.virxact.com/api/public/daily/2026-05-07");
    expect(refreshed.domainUpdates?.news?.daily?.lead.title).toBe("前一日 AI 摘要");
  });

  it("keeps existing news state and records an error when AI HOT is unavailable", async () => {
    mockAihotFetch(
      {
        "https://aihot.virxact.com/api/public/items?mode=all&take=50": {
          error: "upstream unavailable"
        }
      },
      503
    );
    const existingNews: Partial<NewsState> = {
      feed: {
        count: 1,
        hasNext: false,
        nextCursor: null,
        items: [
          {
            id: "existing",
            title: "已有热点",
            titleEn: null,
            summary: "保留旧数据",
            category: "industry",
            source: "AI HOT",
            url: "https://aihot.virxact.com",
            publishedAt: "2026-05-08T09:00:00.000Z"
          }
        ]
      }
    };

    const refreshed = await agent.execute(
      createRequest(createState(existingNews), {
        action: "refresh",
        view: "all"
      })
    );

    expect(refreshed.status).toBe("failed");
    expect(refreshed.domainUpdates?.news?.feed.items).toHaveLength(1);
    expect(refreshed.domainUpdates?.news?.lastError).toContain("HTTP 503");
  });
});
