import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState } from "@agent-zy/shared-types";

import { agent } from "./index";

function createState(): AppState {
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
      status: "idle"
    },
    topics: {
      dimensions: [],
      current: [],
      currentByDimension: [],
      history: [],
      lastGeneratedAt: null,
      status: "idle",
      strategy: "manual-curation",
      lastError: null
    },
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

function mockStructuredModelResponse(content: unknown) {
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
                content
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
    delete process.env.HISTORY_TOPIC_ARCHIVE_PATH;
    vi.unstubAllGlobals();
  });

  it("generates a persistent history post notification from ModelScope JSON", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
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

    const archive = JSON.parse(readFileSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH, "utf8")) as {
      entries: Array<{ topic: string; generatedCount: number }>;
    };

    expect(archive.entries).toContainEqual(
      expect.objectContaining({
        topic: "玄奘取经为什么重要",
        generatedCount: 1
      })
    );
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

  it("accepts content-block array responses that contain JSON text", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    mockStructuredModelResponse([
      {
        type: "text",
        text: JSON.stringify({
          topic: "郑和下西洋真正留下了什么",
          summary: "不只是一场航海壮举，也是一套关于交流、秩序和影响力的实践。",
          cardCount: 1,
          cards: [
            {
              title: "先讲留下了什么",
              imageText: "郑和下西洋，留下的不只是船队规模",
              prompt: "明代宝船，海上航线，知识卡片"
            }
          ],
          xiaohongshuCaption: "今天用一张图讲清郑和下西洋真正留下了什么。"
        })
      }
    ]);

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "每日历史知识点：郑和下西洋真正留下了什么"
    });
  });

  it("accepts single-item JSON array payloads", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    mockModelResponse([
      {
        topic: "玛雅历法为什么如此精密",
        summary: "历法背后是长期观测与系统化知识的累积。",
        cardCount: 1,
        cards: [
          {
            title: "先讲为什么精密",
            imageText: "精密历法来自长期观测，而不是神秘传说",
            prompt: "玛雅文明，天文观测，知识海报"
          }
        ],
        xiaohongshuCaption: "今天讲清玛雅历法为什么会精密到令人惊讶。"
      }
    ]);

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "每日历史知识点：玛雅历法为什么如此精密"
    });
  });

  it("prefers an unused topic when the requested topic already exists in the archive", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    writeFileSync(
      process.env.HISTORY_TOPIC_ARCHIVE_PATH,
      JSON.stringify(
        {
          entries: [
            {
              topic: "玄奘取经为什么重要",
              firstGeneratedAt: "2026-05-01T00:00:00.000Z",
              lastGeneratedAt: "2026-05-01T00:00:00.000Z",
              generatedCount: 1
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const prompt = body.messages?.find((item) => item.role === "user")?.content ?? "";
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return {
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
                  content: JSON.stringify({
                    topic,
                    summary: `${topic} 的摘要`,
                    cardCount: 1,
                    cards: [
                      {
                        title: "一张图讲清",
                        imageText: `${topic} 图片文案`,
                        prompt: `${topic} 提示词`
                      }
                    ],
                    xiaohongshuCaption: `${topic} 正文`
                  })
                }
              }
            ]
          })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]?.payload?.topic).not.toBe("玄奘取经为什么重要");
  });

  it("falls back to the least recently generated topic when all topics are archived", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    writeFileSync(
      process.env.HISTORY_TOPIC_ARCHIVE_PATH,
      JSON.stringify(
        {
          entries: [
            {
              topic: "玄奘取经为什么重要",
              firstGeneratedAt: "2026-04-01T00:00:00.000Z",
              lastGeneratedAt: "2026-04-01T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "张骞出使西域如何改变丝绸之路",
              firstGeneratedAt: "2026-04-02T00:00:00.000Z",
              lastGeneratedAt: "2026-04-02T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "活字印刷术如何重塑知识传播",
              firstGeneratedAt: "2026-04-03T00:00:00.000Z",
              lastGeneratedAt: "2026-04-03T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "郑和下西洋真正留下了什么",
              firstGeneratedAt: "2026-04-04T00:00:00.000Z",
              lastGeneratedAt: "2026-04-04T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "罗马道路为什么能支撑帝国治理",
              firstGeneratedAt: "2026-04-05T00:00:00.000Z",
              lastGeneratedAt: "2026-04-05T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "文艺复兴为什么从意大利兴起",
              firstGeneratedAt: "2026-04-06T00:00:00.000Z",
              lastGeneratedAt: "2026-04-06T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "工业革命怎样改变普通人的一天",
              firstGeneratedAt: "2026-04-07T00:00:00.000Z",
              lastGeneratedAt: "2026-04-07T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "玛雅历法为什么如此精密",
              firstGeneratedAt: "2026-04-08T00:00:00.000Z",
              lastGeneratedAt: "2026-04-08T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "大运河如何连接中国南北经济",
              firstGeneratedAt: "2026-04-09T00:00:00.000Z",
              lastGeneratedAt: "2026-04-09T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "拿破仑法典为什么影响至今",
              firstGeneratedAt: "2026-04-10T00:00:00.000Z",
              lastGeneratedAt: "2026-04-10T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "敦煌藏经洞如何保存千年文明切片",
              firstGeneratedAt: "2026-04-11T00:00:00.000Z",
              lastGeneratedAt: "2026-04-11T00:00:00.000Z",
              generatedCount: 2
            },
            {
              topic: "阿拉伯学者如何保存并发展古希腊知识",
              firstGeneratedAt: "2026-04-12T00:00:00.000Z",
              lastGeneratedAt: "2026-04-12T00:00:00.000Z",
              generatedCount: 2
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const prompt = body.messages?.find((item) => item.role === "user")?.content ?? "";
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return {
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
                  content: JSON.stringify({
                    topic,
                    summary: `${topic} 的摘要`,
                    cardCount: 1,
                    cards: [
                      {
                        title: "一张图讲清",
                        imageText: `${topic} 图片文案`,
                        prompt: `${topic} 提示词`
                      }
                    ],
                    xiaohongshuCaption: `${topic} 正文`
                  })
                }
              }
            ]
          })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]?.payload?.topic).toBe("玄奘取经为什么重要");
  });

  it("fails the task when persisting the topic archive fails", async () => {
    process.env.MODELSCOPE_API_KEY = "test-token";
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = archiveDir;
    mockModelResponse({
      topic: "玄奘取经为什么重要",
      summary: "玄奘西行不只是宗教故事，也推动了中印知识交流。",
      cardCount: 1,
      cards: [
        {
          title: "一张图讲清路线",
          imageText: "从长安到那烂陀：一次跨越万里的求知",
          prompt: "竖版小红书封面，唐代僧人远行，地图路线，中文标题留白"
        }
      ],
      xiaohongshuCaption: "今天讲一个改变知识流动的历史瞬间：玄奘西行。"
    });

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
  });
});
