import { describe, expect, it } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, NewsState, TopicState } from "@agent-zy/shared-types";

import { agent } from "./index";

function createTopicState(topics?: Partial<TopicState>): TopicState {
  return {
    current: [],
    history: [],
    lastGeneratedAt: null,
    nextRunAt: null,
    status: "idle",
    strategy: "news-to-content",
    lastError: null,
    ...topics
  };
}

function createNewsState(news?: Partial<NewsState>): NewsState {
  return {
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
    ledger: {
      entries: [],
      modules: []
    },
    schedule: {
      items: [],
      pendingReview: null
    },
    news: createNewsState(state?.news),
    newsBodies: [],
    topics: createTopicState(state?.topics),
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
    trigger: "schedule",
    meta: {
      action: "generate"
    },
    requestedAt,
    state
  };
}

describe("topic agent", () => {
  it("turns AI news into scored self-media topic ideas", async () => {
    const result = await agent.execute(
      createRequest(
        createState({
          news: {
            items: [
              {
                id: "news-ai-agent",
                title: "AI agents reshape personal workspaces",
                summary: "多个信源显示，AI agents 正在进入个人桌面工作台。",
                category: "ai",
                importance: "high",
                sourceCount: 3,
                sources: ["AI Daily", "Model Wire"],
                rawItemIds: ["raw-ai-agent"],
                updatedAt: "2026-05-06T05:30:00.000Z"
              }
            ]
          }
        })
      )
    );

    const topics = result.domainUpdates?.topics;
    const firstTopic = topics?.current[0];
    expect(result.status).toBe("completed");
    expect(topics?.current).toHaveLength(5);
    expect(firstTopic).toMatchObject({
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
    expect(topics?.history.slice(0, 5).map((item) => item.id)).toEqual(
      topics?.current.map((item) => item.id)
    );
    expect(topics?.nextRunAt).toBe("2026-05-06T09:00:00.000Z");
  });

  it("uses evergreen AI media ideas when news is empty", async () => {
    const result = await agent.execute(createRequest(createState()));

    const topics = result.domainUpdates?.topics;
    expect(topics?.current).toHaveLength(5);
    expect(topics?.current[0].title).toContain("AI");
    expect(topics?.current[0].sourceNewsItemIds).toEqual([]);
    expect(topics?.lastError).toBeNull();
  });

  it("uses current AI model and technology signals in the content direction", async () => {
    const result = await agent.execute(
      createRequest(
        createState({
          news: {
            items: [
              {
                id: "news-gpt51-coding",
                title: "OpenAI GPT-5.1 improves coding agents for enterprise teams",
                summary:
                  "GPT-5.1、Gemini 3 与 Claude Code 的更新都指向更强的代码审查、自动修复和企业知识库集成。",
                category: "ai",
                importance: "high",
                sourceCount: 4,
                sources: ["OpenAI Blog", "AI Daily"],
                rawItemIds: ["raw-gpt51-coding"],
                updatedAt: "2026-05-06T05:30:00.000Z"
              }
            ]
          }
        })
      )
    );

    const topic = result.domainUpdates?.topics?.current[0];

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
