import { describe, expect, it } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, NewsState, TopicState } from "@agent-zy/shared-types";

import { agent } from "./index";

function createTopicState(topics?: Partial<TopicState>): TopicState {
  return {
    dimensions: [],
    current: [],
    currentByDimension: [],
    history: [],
    lastGeneratedAt: null,
    status: "idle",
    strategy: "manual-curation",
    lastError: null,
    ...topics
  };
}

function createNewsState(news?: Partial<NewsState>): NewsState {
  return {
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
  };
}

function createState(state?: {
  news?: Partial<NewsState>;
  topics?: Partial<TopicState>;
}): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: {
      entries: [],
      modules: []
    },
    schedule: {
      items: [],
      pendingReview: null
    },
    news: createNewsState(state?.news),
    topics: createTopicState(state?.topics),
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
  requestedAt = "2026-05-06T06:00:00.000Z"
): AgentExecutionRequest {
  return {
    taskId: `task-${requestedAt}`,
    trigger: "system",
    meta: {
      action: "generate"
    },
    requestedAt,
    state
  };
}

describe("topic agent", () => {
  it("generates grouped topic ideas across three dimensions", async () => {
    const result = await agent.execute(
      createRequest(
        createState({
          news: {
            feed: {
              count: 1,
              hasNext: false,
              nextCursor: null,
              items: [
                {
                  id: "news-ai-agent",
                  title: "AI agents reshape personal workspaces",
                  titleEn: null,
                  summary: "多个信源显示，AI agents 正在进入个人桌面工作台。",
                  category: "ai-products",
                  source: "AI Daily",
                  url: "https://example.com/ai-agent",
                  publishedAt: "2026-05-06T05:30:00.000Z"
                }
              ]
            }
          }
        })
      )
    );

    const topics = result.domainUpdates?.topics;
    const technologyBucket = topics?.currentByDimension[0];
    const firstTopic = technologyBucket?.items[0];

    expect(result.status).toBe("completed");
    expect(topics?.dimensions.map((item) => item.label)).toEqual(["技术", "有趣", "故事"]);
    expect(topics?.currentByDimension).toHaveLength(3);
    expect(topics?.current).toHaveLength(3);
    expect(technologyBucket?.label).toBe("技术");
    expect(firstTopic).toMatchObject({
      dimensionId: "technology",
      title: expect.stringContaining("AI agents reshape personal workspaces"),
      audience: expect.any(String),
      angle: expect.any(String),
      contentDirection: expect.any(String),
      hook: expect.any(String),
      whyNow: expect.stringContaining("AI Daily"),
      sourceNewsItemIds: ["news-ai-agent"],
      scoreLabel: "high",
      batchId: "topic-batch-2026-05-06T06:00:00.000Z"
    });
    expect(firstTopic?.contentDirection).toContain("实际问题");
    expect(topics?.history.slice(0, 3).map((item) => item.id)).toEqual(
      topics?.current.map((item) => item.id)
    );
  });

  it("uses evergreen ideas when news is empty", async () => {
    const result = await agent.execute(createRequest(createState()));

    const topics = result.domainUpdates?.topics;
    expect(topics?.current).toHaveLength(3);
    expect(topics?.currentByDimension[0]?.items[0].title).toContain("AI");
    expect(topics?.currentByDimension[0]?.items[0].sourceNewsItemIds).toEqual([]);
    expect(topics?.lastError).toBeNull();
  });

  it("uses current AI model and technology signals in the technology dimension", async () => {
    const result = await agent.execute(
      createRequest(
        createState({
          news: {
            feed: {
              count: 1,
              hasNext: false,
              nextCursor: null,
              items: [
                {
                  id: "news-gpt51-coding",
                  title: "OpenAI GPT-5.1 improves coding agents for enterprise teams",
                  titleEn: null,
                  summary:
                    "GPT-5.1、Gemini 3 与 Claude Code 的更新都指向更强的代码审查、自动修复和企业知识库集成。",
                  category: "ai-products",
                  source: "OpenAI Blog",
                  url: "https://example.com/gpt51",
                  publishedAt: "2026-05-06T05:30:00.000Z"
                }
              ]
            }
          }
        })
      )
    );

    const topic = result.domainUpdates?.topics?.currentByDimension[0]?.items[0];

    expect(topic?.dimensionId).toBe("technology");
    expect(topic?.title).toContain("GPT-5.1");
    expect(topic?.contentDirection).toContain("GPT-5.1");
    expect(topic?.contentDirection).toContain("Gemini 3");
    expect(topic?.contentDirection).toContain("代码审查");
    expect(topic?.contentDirection).toContain("实际问题");
    expect(topic?.whyNow).toContain("OpenAI Blog");
  });

  it("keeps history while avoiding duplicate topic ids", async () => {
    const existing = {
      id: "topic-existing",
      batchId: "topic-batch-old",
      dimensionId: "story",
      title: "旧选题",
      hook: "旧钩子",
      summary: "旧摘要",
      audience: "AI 自媒体创作者",
      angle: "旧角度",
      contentDirection: "旧内容方向",
      whyNow: "旧原因",
      sourceNewsItemIds: [],
      sourceTitles: [],
      score: 72,
      scoreLabel: "medium" as const,
      status: "new" as const,
      createdAt: "2026-05-06T03:00:00.000Z"
    };
    const first = await agent.execute(
      createRequest(
        createState({
          topics: {
            history: [existing]
          }
        }),
        "2026-05-06T06:00:00.000Z"
      )
    );
    const second = await agent.execute(
      createRequest(
        createState({
          topics: first.domainUpdates?.topics
        }),
        "2026-05-06T06:00:00.000Z"
      )
    );

    const ids = second.domainUpdates?.topics?.history.map((item) => item.id) ?? [];
    expect(ids.filter((id) => id === "topic-existing")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
