import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, NewsState } from "@agent-zy/shared-types";

import { agent } from "./index";

function mockAihotFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      }
    },
    text: async () => JSON.stringify(body),
    json: async () => body
  }));

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
      items: [],
      rawItems: [],
      sources: [],
      lastFetchedAt: null,
      lastUpdatedAt: null,
      lastSummarizedAt: null,
      lastSummaryInputItemIds: [],
      lastSummaryProvider: "none",
      lastSummaryError: null,
      status: "idle",
      ...news
    },
    newsBodies: [],
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
    vi.unstubAllGlobals();
  });

  it("refreshes AI HOT selected items with the required browser user-agent", async () => {
    const fetchMock = mockAihotFetch({
      count: 2,
      hasNext: false,
      nextCursor: null,
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
        },
        {
          id: "cmow5nur702z9slcxewvl62nn",
          title: "atomic.chat 为 LLaMA.cpp 引入多令牌预测技术",
          title_en: null,
          url: "https://x.com/rohanpaul_ai/status/2052533657525698802",
          source: "X：Rohan Paul (@rohanpaul_ai)",
          publishedAt: "2026-05-07T23:38:52.000Z",
          summary: "本地模型推理速度提升。",
          category: "tip"
        }
      ]
    });

    const refreshed = await agent.execute(
      createRequest(createState(), {
        action: "refresh"
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe(
      "https://aihot.virxact.com/api/public/items?mode=selected&take=50"
    );
    expect(calls[0][1]).toMatchObject({
      headers: {
        "User-Agent": expect.stringContaining("Mozilla/5.0")
      }
    });
    expect(refreshed.domainUpdates?.news).toMatchObject({
      items: [
        expect.objectContaining({
          id: "news-cmow6i2aq036jslcxxneym5zm",
          title: "Claude v2.1.133 版本更新",
          category: "ai-products",
          sources: ["Claude Code：GitHub Releases（RSS）"],
          rawItemIds: ["raw-cmow6i2aq036jslcxxneym5zm"]
        }),
        expect.objectContaining({
          id: "news-cmow5nur702z9slcxewvl62nn",
          category: "tip"
        })
      ],
      rawItems: expect.arrayContaining([
        expect.objectContaining({
          id: "raw-cmow6i2aq036jslcxxneym5zm",
          url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.133",
          sourceName: "Claude Code：GitHub Releases（RSS）"
        })
      ]),
      lastSummaryProvider: "aihot",
      lastSummaryError: null,
      status: "idle"
    });
  });

  it("supports AI HOT query parameters without client-side filtering", async () => {
    const fetchMock = mockAihotFetch({
      count: 0,
      hasNext: false,
      nextCursor: null,
      items: []
    });

    await agent.execute(
      createRequest(createState(), {
        action: "refresh",
        mode: "all",
        category: "paper",
        q: "RAG",
        since: "2026-05-01T00:00:00.000Z",
        take: 30
      })
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe(
      "https://aihot.virxact.com/api/public/items?mode=all&category=paper&q=RAG&since=2026-05-01T00%3A00%3A00.000Z&take=30"
    );
  });

  it("keeps existing news state and records an error when AI HOT is unavailable", async () => {
    mockAihotFetch({ error: "upstream unavailable" }, 503);
    const existingNews: Partial<NewsState> = {
      items: [
        {
          id: "news-existing",
          title: "已有热点",
          summary: "保留旧数据",
          category: "industry",
          importance: "medium",
          sourceCount: 1,
          sources: ["AI HOT"],
          rawItemIds: ["raw-existing"],
          updatedAt: "2026-05-08T09:00:00.000Z"
        }
      ],
      rawItems: [
        {
          id: "raw-existing",
          sourceId: "aihot",
          sourceName: "AI HOT",
          category: "industry",
          title: "已有热点",
          url: "https://aihot.virxact.com",
          publishedAt: "2026-05-08T09:00:00.000Z",
          fetchedAt: "2026-05-08T09:01:00.000Z",
          fingerprint: "existing"
        }
      ]
    };

    const refreshed = await agent.execute(
      createRequest(createState(existingNews), {
        action: "refresh"
      })
    );

    expect(refreshed.status).toBe("failed");
    expect(refreshed.domainUpdates?.news?.items).toHaveLength(1);
    expect(refreshed.domainUpdates?.news?.lastSummaryProvider).toBe("none");
    expect(refreshed.domainUpdates?.news?.lastSummaryError).toContain("HTTP 503");
  });

  it("generates cached analysis for an AI HOT item", async () => {
    const analyzed = await agent.execute(
      createRequest(
        createState({
          items: [
            {
              id: "news-aihot-1",
              title: "Claude Code 更新",
              summary: "开发工具能力变化。",
              category: "ai-products",
              importance: "high",
              sourceCount: 1,
              sources: ["AI HOT"],
              rawItemIds: ["raw-aihot-1"],
              updatedAt: "2026-05-08T09:00:00.000Z"
            }
          ]
        }),
        {
          action: "analyze",
          itemId: "news-aihot-1"
        }
      )
    );

    expect(analyzed.domainUpdates?.news?.items[0].analysis).toMatchObject({
      personalImpact: expect.any(String),
      possibleChanges: expect.any(String),
      relationToMe: expect.any(String)
    });
  });
});
