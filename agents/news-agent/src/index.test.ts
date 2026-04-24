import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, NewsState } from "@agent-zy/shared-types";

import { agent } from "./index";

function mockFetch(body: string, contentType: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      }
    },
    text: async () => body
  }));

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockFetchHandler(
  handler: (url: string, init?: RequestInit) => Promise<{
    body: string;
    contentType: string;
    status?: number;
  }>
) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const result = await handler(url, init);

    return {
      ok: (result.status ?? 200) >= 200 && (result.status ?? 200) < 300,
      status: result.status ?? 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? result.contentType : null;
        }
      },
      text: async () => result.body,
      json: async () => JSON.parse(result.body)
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
    nightlyReview: {
      lastTriggeredDate: null
    }
  };
}

function createRequest(
  state: AppState,
  meta: AgentExecutionRequest["meta"],
  requestedAt = "2026-04-23T10:00:00.000Z"
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
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_MODEL;
    vi.unstubAllGlobals();
  });

  it("does not create sample news when no sources exist", async () => {
    const refreshed = await agent.execute(
      createRequest(createState(), {
        action: "refresh"
      })
    );

    expect(refreshed.domainUpdates?.news?.sources).toHaveLength(0);
    expect(refreshed.domainUpdates?.news?.rawItems).toHaveLength(0);
    expect(refreshed.domainUpdates?.news?.items).toHaveLength(0);
    expect(refreshed.domainUpdates?.news?.lastSummaryInputItemIds).toHaveLength(0);
    expect(refreshed.domainUpdates?.news?.lastSummaryProvider).toBe("none");
  });

  it("fetches RSS items from source URLs and clusters the same story across multiple sources", async () => {
    const fetchMock = mockFetch(
      `<?xml version="1.0"?>
      <rss>
        <channel>
          <item>
            <title>AI agents reshape personal workspaces</title>
            <link>https://news.example.com/ai-agents</link>
            <pubDate>Thu, 23 Apr 2026 10:25:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`,
      "application/rss+xml"
    );
    const first = await agent.execute(
      createRequest(createState(), {
        action: "add-source",
        source: {
          name: "AI Daily",
          url: "https://example.com/ai",
          category: "ai"
        }
      })
    );
    const second = await agent.execute(
      createRequest(
        createState(first.domainUpdates?.news),
        {
          action: "add-source",
          source: {
            name: "Model Wire",
            url: "https://example.com/model",
            category: "ai"
          }
        },
        "2026-04-23T10:01:00.000Z"
      )
    );

    const refreshed = await agent.execute(
      createRequest(
        createState(second.domainUpdates?.news),
        {
          action: "refresh"
        },
        "2026-04-23T10:30:00.000Z"
      )
    );

    expect(refreshed.domainUpdates?.news?.rawItems).toHaveLength(2);
    expect(refreshed.domainUpdates?.news?.items).toHaveLength(1);
    expect(refreshed.domainUpdates?.news?.items[0]).toMatchObject({
      title: "AI热点：AI agents reshape personal workspaces",
      category: "ai",
      sourceCount: 2,
      sources: ["AI Daily", "Model Wire"]
    });
    expect(refreshed.domainUpdates?.news?.lastSummaryInputItemIds).toHaveLength(2);
    expect(refreshed.domainUpdates?.news?.lastSummaryProvider).toBe("fallback");
    expect(refreshed.domainUpdates?.news?.lastSummaryError).toContain("MODELSCOPE_API_KEY");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("summarizes only raw items discovered in the current refresh", async () => {
    mockFetch(
      `<?xml version="1.0"?>
      <rss>
        <channel>
          <item>
            <title>AI agents reshape personal workspaces</title>
            <link>https://example.com/ai#old</link>
            <pubDate>Thu, 23 Apr 2026 09:00:00 GMT</pubDate>
          </item>
          <item>
            <title>New model routing reaches desktop agents</title>
            <link>https://example.com/ai#new</link>
            <pubDate>Thu, 23 Apr 2026 09:45:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`,
      "application/rss+xml"
    );
    const existingRawItem = {
      id: "raw-old",
      sourceId: "source-ai",
      sourceName: "AI Daily",
      category: "ai" as const,
      title: "AI agents reshape personal workspaces",
      url: "https://example.com/ai#old",
      publishedAt: "2026-04-23T09:00:00.000Z",
      fetchedAt: "2026-04-23T09:30:00.000Z",
      fingerprint: "old"
    };
    const state = createState({
      sources: [
        {
          id: "source-ai",
          name: "AI Daily",
          url: "https://example.com/ai",
          category: "ai",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z",
          lastFetchedAt: "2026-04-23T09:30:00.000Z"
        }
      ],
      rawItems: [existingRawItem],
      lastFetchedAt: "2026-04-23T09:30:00.000Z"
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh"
        },
        "2026-04-23T10:00:00.000Z"
      )
    );

    const news = refreshed.domainUpdates?.news;
    expect(news?.rawItems).toHaveLength(2);
    expect(news?.lastSummaryInputItemIds).toHaveLength(1);
    expect(news?.lastSummaryInputItemIds).not.toContain("raw-old");
    expect(news?.lastSummaryProvider).toBe("fallback");
  });

  it("bootstraps latest items on first fetch even when they are older than 30 minutes", async () => {
    mockFetch(
      `<?xml version="1.0"?>
      <rss>
        <channel>
          <item>
            <title>Foundational model rollout reaches enterprise desktops</title>
            <link>https://example.com/ai#bootstrap</link>
            <pubDate>Thu, 23 Apr 2026 07:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`,
      "application/rss+xml"
    );
    const state = createState({
      sources: [
        {
          id: "source-ai",
          name: "AI Daily",
          url: "https://example.com/ai",
          category: "ai",
          enabled: true,
          createdAt: "2026-04-23T06:00:00.000Z"
        }
      ]
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh"
        },
        "2026-04-23T10:00:00.000Z"
      )
    );

    expect(refreshed.domainUpdates?.news?.rawItems).toHaveLength(1);
    expect(refreshed.domainUpdates?.news?.lastSummaryInputItemIds).toEqual([
      refreshed.domainUpdates?.news?.rawItems[0].id
    ]);
  });

  it("uses ModelScope to summarize only incremental items into Chinese display copy", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    process.env.MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1";
    let modelRequestBody = "";
    mockFetchHandler(async (url, init) => {
      if (url.includes("api-inference.modelscope.cn")) {
        modelRequestBody = String(init?.body ?? "");
        return {
          contentType: "application/json",
          body: JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    {
                      title: "模型路由进入桌面智能体",
                      summary: "多个信源显示，模型路由能力正在进入个人桌面智能体，可能改变个人工作台的信息处理方式。",
                      category: "ai",
                      importance: "high",
                      rawItemIds: ["raw-new"]
                    }
                  ])
                }
              }
            ]
          })
        };
      }

      return {
        contentType: "application/rss+xml",
        body: `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>Old agent routing update</title>
              <link>https://example.com/ai#old</link>
              <pubDate>Thu, 23 Apr 2026 09:00:00 GMT</pubDate>
            </item>
            <item>
              <title>New model routing reaches desktop agents</title>
              <link>https://example.com/ai#new</link>
              <pubDate>Thu, 23 Apr 2026 09:45:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`
      };
    });
    const existingRawItem = {
      id: "raw-old",
      sourceId: "source-ai",
      sourceName: "AI Daily",
      category: "ai" as const,
      title: "Old agent routing update",
      url: "https://example.com/ai#old",
      publishedAt: "2026-04-23T09:00:00.000Z",
      fetchedAt: "2026-04-23T09:30:00.000Z",
      fingerprint: "old"
    };
    const state = createState({
      sources: [
        {
          id: "source-ai",
          name: "AI Daily",
          url: "https://example.com/ai",
          category: "ai",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z",
          lastFetchedAt: "2026-04-23T09:30:00.000Z"
        }
      ],
      rawItems: [existingRawItem],
      lastFetchedAt: "2026-04-23T09:30:00.000Z"
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh"
        },
        "2026-04-23T10:00:00.000Z"
      )
    );

    expect(modelRequestBody).toContain("New model routing reaches desktop agents");
    expect(modelRequestBody).not.toContain("Old agent routing update");
    expect(refreshed.domainUpdates?.news?.items[0]).toMatchObject({
      title: "模型路由进入桌面智能体",
      summary: "多个信源显示，模型路由能力正在进入个人桌面智能体，可能改变个人工作台的信息处理方式。",
      importance: "high"
    });
    expect(refreshed.domainUpdates?.news?.lastSummaryProvider).toBe("llm");
    expect(refreshed.domainUpdates?.news?.lastSummaryError).toBeNull();
  });

  it("can manually re-summarize existing raw items when no new items are fetched", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    let modelRequestBody = "";
    mockFetchHandler(async (url, init) => {
      if (url.includes("api-inference.modelscope.cn")) {
        modelRequestBody = String(init?.body ?? "");
        return {
          contentType: "application/json",
          body: JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    {
                      title: "桌面智能体正在重塑工作台",
                      summary: "这条旧抓取新闻被手动重新整理为中文摘要，便于页面直接阅读。",
                      category: "ai",
                      importance: "medium",
                      rawItemIds: ["raw-existing"]
                    }
                  ])
                }
              }
            ]
          })
        };
      }

      return {
        contentType: "application/rss+xml",
        body: `<?xml version="1.0"?><rss><channel></channel></rss>`
      };
    });
    const state = createState({
      sources: [
        {
          id: "source-ai",
          name: "AI Daily",
          url: "https://example.com/ai",
          category: "ai",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z",
          lastFetchedAt: "2026-04-23T09:30:00.000Z"
        }
      ],
      rawItems: [
        {
          id: "raw-existing",
          sourceId: "source-ai",
          sourceName: "AI Daily",
          category: "ai",
          title: "AI agents reshape personal workspaces",
          url: "https://example.com/ai#existing",
          publishedAt: "2026-04-23T09:00:00.000Z",
          fetchedAt: "2026-04-23T09:30:00.000Z",
          fingerprint: "existing"
        }
      ],
      items: [
        {
          id: "news-old",
          title: "AI agents reshape personal workspaces",
          summary: "old summary",
          category: "ai",
          importance: "low",
          sourceCount: 1,
          sources: ["AI Daily"],
          rawItemIds: ["raw-existing"],
          updatedAt: "2026-04-23T09:00:00.000Z"
        }
      ]
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh",
          forceSummary: true
        },
        "2026-04-23T10:00:00.000Z"
      )
    );

    expect(modelRequestBody).toContain("AI agents reshape personal workspaces");
    expect(refreshed.domainUpdates?.news?.items[0]).toMatchObject({
      title: "桌面智能体正在重塑工作台",
      summary: "这条旧抓取新闻被手动重新整理为中文摘要，便于页面直接阅读。",
      importance: "medium"
    });
    expect(refreshed.domainUpdates?.news?.lastSummaryInputItemIds).toEqual(["raw-existing"]);
    expect(refreshed.domainUpdates?.news?.lastSummaryProvider).toBe("llm");
  });

  it("extracts a news item from an HTML page title", async () => {
    mockFetch(
      `<!doctype html>
      <html>
        <head>
          <meta property="og:title" content="Chip platforms accelerate edge computing upgrades">
          <title>Fallback title</title>
        </head>
        <body>article page</body>
      </html>`,
      "text/html"
    );
    const state = createState({
      sources: [
        {
          id: "source-tech",
          name: "Tech Page",
          url: "https://example.com/tech-story",
          category: "technology",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z"
        }
      ]
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh"
        },
        "2026-04-23T10:00:00.000Z"
      )
    );

    expect(refreshed.domainUpdates?.news?.rawItems[0]).toMatchObject({
      title: "Chip platforms accelerate edge computing upgrades",
      url: "https://example.com/tech-story"
    });
  });

  it("parses Atom feed entries whose titles are wrapped in CDATA", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title type="html"><![CDATA[Saros is pure action nirvana]]></title>
          <link rel="alternate" type="text/html" href="https://example.com/reviews/saros" />
          <updated>2026-04-23T23:33:53-04:00</updated>
        </entry>
      </feed>`,
      "application/xml"
    );
    const state = createState({
      sources: [
        {
          id: "source-atom",
          name: "Atom Feed",
          url: "https://example.com/feed",
          category: "technology",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z"
        }
      ]
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh"
        },
        "2026-04-24T07:00:00.000Z"
      )
    );

    expect(refreshed.domainUpdates?.news?.rawItems[0]).toMatchObject({
      title: "Saros is pure action nirvana",
      url: "https://example.com/reviews/saros"
    });
  });

  it("falls back to local summary and records error when model request fails", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    mockFetchHandler(async (url) => {
      if (url.includes("api-inference.modelscope.cn")) {
        return {
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "upstream unavailable"
          })
        };
      }

      return {
        contentType: "application/rss+xml",
        body: `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>New model routing reaches desktop agents</title>
              <link>https://example.com/ai#new</link>
              <pubDate>Thu, 23 Apr 2026 09:45:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`
      };
    });
    const state = createState({
      sources: [
        {
          id: "source-ai",
          name: "AI Daily",
          url: "https://example.com/ai",
          category: "ai",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z",
          lastFetchedAt: "2026-04-23T09:30:00.000Z"
        }
      ]
    });

    const refreshed = await agent.execute(
      createRequest(
        state,
        {
          action: "refresh"
        },
        "2026-04-23T10:00:00.000Z"
      )
    );

    expect(refreshed.domainUpdates?.news?.items[0].title).toBe(
      "AI热点：New model routing reaches desktop agents"
    );
    expect(refreshed.domainUpdates?.news?.items[0].summary).toContain(
      "New model routing reaches desktop agents"
    );
    expect(refreshed.domainUpdates?.news?.lastSummaryProvider).toBe("fallback");
    expect(refreshed.domainUpdates?.news?.lastSummaryError).toContain("HTTP 500");
  });

  it("fetches and caches full article bodies on demand", async () => {
    const fetchMock = mockFetchHandler(async (url) => {
      if (url === "https://example.com/story") {
        return {
          contentType: "text/html",
          body: `<!doctype html>
          <html>
            <body>
              <article>
                <p>First paragraph from the full article.</p>
                <p>Second paragraph explains why the update matters.</p>
              </article>
            </body>
          </html>`
        };
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const state = createState({
      sources: [
        {
          id: "source-ai",
          name: "AI Daily",
          url: "https://example.com/feed",
          category: "ai",
          enabled: true,
          createdAt: "2026-04-23T08:00:00.000Z"
        }
      ],
      rawItems: [
        {
          id: "raw-story",
          sourceId: "source-ai",
          sourceName: "AI Daily",
          category: "ai",
          title: "AI desktop agent launch update",
          url: "https://example.com/story",
          publishedAt: "2026-04-23T10:00:00.000Z",
          fetchedAt: "2026-04-23T10:05:00.000Z",
          fingerprint: "story"
        }
      ],
      items: [
        {
          id: "news-story",
          title: "AI热点：AI desktop agent launch update",
          summary: "summary",
          category: "ai",
          importance: "medium",
          sourceCount: 1,
          sources: ["AI Daily"],
          rawItemIds: ["raw-story"],
          updatedAt: "2026-04-23T10:00:00.000Z"
        }
      ]
    });

    const fetched = await agent.execute(
      createRequest(
        state,
        {
          action: "fetch-articles",
          itemId: "news-story"
        },
        "2026-04-23T10:10:00.000Z"
      )
    );

    expect((fetched.domainUpdates as any)?.newsBodies).toEqual([
      expect.objectContaining({
        rawItemId: "raw-story",
        sourceName: "AI Daily",
        url: "https://example.com/story",
        content: expect.stringContaining("First paragraph from the full article."),
        excerpt: expect.stringContaining("First paragraph from the full article.")
      })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cachedState = {
      ...state,
      newsBodies: (fetched.domainUpdates as any)?.newsBodies
    } as AppState;
    await agent.execute(
      createRequest(
        cachedState,
        {
          action: "fetch-articles",
          itemId: "news-story"
        },
        "2026-04-23T10:11:00.000Z"
      )
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updates source metadata across cached news entries", async () => {
    const updated = await agent.execute(
      createRequest(
        {
          ...createState({
            sources: [
              {
                id: "source-ai",
                name: "AI Daily",
                url: "https://example.com/feed",
                category: "ai",
                enabled: true,
                createdAt: "2026-04-23T08:00:00.000Z"
              }
            ],
            rawItems: [
              {
                id: "raw-story",
                sourceId: "source-ai",
                sourceName: "AI Daily",
                category: "ai",
                title: "AI desktop agent launch update",
                url: "https://example.com/story",
                publishedAt: "2026-04-23T10:00:00.000Z",
                fetchedAt: "2026-04-23T10:05:00.000Z",
                fingerprint: "story"
              }
            ],
            items: [
              {
                id: "news-story",
                title: "AI热点：AI desktop agent launch update",
                summary: "summary",
                category: "ai",
                importance: "medium",
                sourceCount: 1,
                sources: ["AI Daily"],
                rawItemIds: ["raw-story"],
                updatedAt: "2026-04-23T10:00:00.000Z"
              }
            ]
          }),
          newsBodies: [
            {
              rawItemId: "raw-story",
              sourceId: "source-ai",
              sourceName: "AI Daily",
              title: "AI desktop agent launch update",
              url: "https://example.com/story",
              content: "full text",
              excerpt: "full text",
              fetchedAt: "2026-04-23T10:10:00.000Z",
              status: "ready"
            }
          ]
        } as AppState,
        {
          action: "update-source",
          sourceId: "source-ai",
          patch: {
            name: "AI Brief",
            enabled: false
          }
        },
        "2026-04-23T10:12:00.000Z"
      )
    );

    expect(updated.domainUpdates?.news?.sources[0]).toMatchObject({
      id: "source-ai",
      name: "AI Brief",
      enabled: false
    });
    expect(updated.domainUpdates?.news?.rawItems[0]).toMatchObject({
      sourceName: "AI Brief"
    });
    expect(updated.domainUpdates?.news?.items[0].sources).toEqual(["AI Brief"]);
    expect((updated.domainUpdates as any)?.newsBodies[0]).toMatchObject({
      sourceName: "AI Brief"
    });
  });

  it("removes a source together with related stories and cached article bodies", async () => {
    const removed = await agent.execute(
      createRequest(
        {
          ...createState({
            sources: [
              {
                id: "source-ai",
                name: "AI Daily",
                url: "https://example.com/feed",
                category: "ai",
                enabled: true,
                createdAt: "2026-04-23T08:00:00.000Z"
              }
            ],
            rawItems: [
              {
                id: "raw-story",
                sourceId: "source-ai",
                sourceName: "AI Daily",
                category: "ai",
                title: "AI desktop agent launch update",
                url: "https://example.com/story",
                publishedAt: "2026-04-23T10:00:00.000Z",
                fetchedAt: "2026-04-23T10:05:00.000Z",
                fingerprint: "story"
              }
            ],
            items: [
              {
                id: "news-story",
                title: "AI热点：AI desktop agent launch update",
                summary: "summary",
                category: "ai",
                importance: "medium",
                sourceCount: 1,
                sources: ["AI Daily"],
                rawItemIds: ["raw-story"],
                updatedAt: "2026-04-23T10:00:00.000Z"
              }
            ]
          }),
          newsBodies: [
            {
              rawItemId: "raw-story",
              sourceId: "source-ai",
              sourceName: "AI Daily",
              title: "AI desktop agent launch update",
              url: "https://example.com/story",
              content: "full text",
              excerpt: "full text",
              fetchedAt: "2026-04-23T10:10:00.000Z",
              status: "ready"
            }
          ]
        } as AppState,
        {
          action: "remove-source",
          sourceId: "source-ai"
        },
        "2026-04-23T10:12:00.000Z"
      )
    );

    expect(removed.domainUpdates?.news?.sources).toHaveLength(0);
    expect(removed.domainUpdates?.news?.rawItems).toHaveLength(0);
    expect(removed.domainUpdates?.news?.items).toHaveLength(0);
    expect((removed.domainUpdates as any)?.newsBodies).toHaveLength(0);
  });

  it("caches manual analysis for a news item", async () => {
    const state = createState({
      items: [
        {
          id: "news-ai-agents",
          title: "AI agents reshape personal workspaces",
          summary: "多个信源关注 AI Agent 正在进入个人工作台。",
          category: "ai",
          importance: "high",
          sourceCount: 2,
          sources: ["AI Daily", "Model Wire"],
          rawItemIds: ["raw-1", "raw-2"],
          updatedAt: "2026-04-23T10:00:00.000Z",
          analysis: {
            generatedAt: "2026-04-23T10:02:00.000Z",
            perspectives: ["已有分析"],
            personalImpact: "可复用旧分析。",
            possibleChanges: "无需再次生成。",
            relationToMe: "缓存命中。"
          }
        }
      ]
    });

    const analyzed = await agent.execute(
      createRequest(
        state,
        {
          action: "analyze",
          itemId: "news-ai-agents"
        },
        "2026-04-23T10:05:00.000Z"
      )
    );

    expect(analyzed.assistantMessage).toContain("已返回缓存分析");
    expect(analyzed.domainUpdates?.news?.items[0].analysis?.generatedAt).toBe(
      "2026-04-23T10:02:00.000Z"
    );
  });
});
