import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState } from "@agent-zy/shared-types";

import { agent } from "./index";

function createState(): AppState {
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
      status: "idle"
    },
    newsBodies: [],
    nightlyReview: {
      lastTriggeredDate: null
    },
    historyPush: {
      lastTriggeredDate: null
    }
  };
}

function createRequest(state = createState()): AgentExecutionRequest {
  return {
    taskId: "task-history",
    trigger: "schedule",
    requestedAt: "2026-05-06T23:00:00.000Z",
    meta: {
      localDate: "2026-05-07"
    },
    state
  };
}

function mockModelResponse(content: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get() {
          return "application/json";
        }
      },
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(content)
              }
            }
          ]
        })
    }))
  );
}

describe("history agent", () => {
  afterEach(() => {
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_MODEL;
    vi.unstubAllGlobals();
  });

  it("generates a persistent history post notification from ModelScope JSON", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    mockModelResponse({
      topic: "玄奘取经为什么重要",
      summary: "玄奘西行不只是宗教故事，也推动了中印知识交流。",
      cardCount: 3,
      cards: [
        {
          title: "一张地图讲清路线",
          imageText: "从长安到那烂陀：一次跨越万里的求知",
          prompt: "竖版小红书封面，唐代僧人远行，地图路线，中文标题留白"
        },
        {
          title: "一张图讲清背景",
          imageText: "为什么他要冒险出发？",
          prompt: "唐代长安与佛经卷轴，知识传播主题，温暖色调"
        },
        {
          title: "一张图讲清影响",
          imageText: "带回的不只是经书，还有世界知识",
          prompt: "古代书房，卷轴、地图、星象元素，小红书知识卡片"
        }
      ],
      xiaohongshuCaption: "今天讲一个改变知识流动的历史瞬间：玄奘西行。"
    });

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.notifications).toEqual([
      expect.objectContaining({
        kind: "history-post",
        persistent: true,
        title: "每日历史知识点：玄奘取经为什么重要",
        payload: expect.objectContaining({
          topic: "玄奘取经为什么重要",
          cardCount: 3,
          generatedAt: "2026-05-06T23:00:00.000Z"
        })
      })
    ]);
    expect(result.domainUpdates?.historyPush).toEqual({
      lastTriggeredDate: "2026-05-07"
    });
  });

  it("fails without creating a notification when ModelScope is not configured", async () => {
    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.domainUpdates?.historyPush).toBeUndefined();
  });

  it("rejects model output that needs more than five images", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    mockModelResponse({
      topic: "超长选题",
      summary: "这条输出不符合图片数量限制。",
      cardCount: 6,
      cards: Array.from({ length: 6 }, (_, index) => ({
        title: `第 ${index + 1} 张`,
        imageText: `文字 ${index + 1}`,
        prompt: `提示词 ${index + 1}`
      })),
      xiaohongshuCaption: "不应通过"
    });

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("5");
  });
});
