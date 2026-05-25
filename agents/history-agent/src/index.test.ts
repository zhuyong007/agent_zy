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
    cinematic: {
      projects: [],
      recentProjectIds: [],
      lastGeneratedAt: null,
      status: "idle",
      lastError: null
    },
    summary: {
      entries: [],
      drafts: [],
      lastUpdatedAt: null,
      settings: {
        defaultSummaryType: "daily"
      }
    },
    nightlyReview: {
      lastTriggeredDate: null
    },
    historyPush: {
      lastTriggeredDate: null
    },
    modelSettings: {
      profiles: [],
      defaultProfileId: null,
      purposeDefaults: {},
      agentDefaults: {},
      lastUpdatedAt: null
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

function longImagePrompt(topic: string) {
  return `${topic}，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，背景包含地图、书卷、建筑纹样与柔和光线，暖金与青灰配色，画面上方预留中文标题区域，下方保留解释文字空间，质感像博物馆展陈海报，细节丰富但不拥挤。`;
}

function mockModelRuntimeText(textFactory: string | ((prompt: string) => string)) {
  (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__ = {
    generateText: vi.fn(async (input: { prompt: string; systemPrompt?: string }) => {
      const prompt = input.prompt ?? "";
      const combinedPrompt = `${input.systemPrompt ?? ""}\n${prompt}`;
      const text = typeof textFactory === "function" ? textFactory(combinedPrompt) : textFactory;

      return { text };
    })
  };

  return () => {
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;
  };
}

function mockModelResponse(content: unknown) {
  return mockModelRuntimeText(JSON.stringify(content));
}

function mockStructuredModelResponse(content: unknown) {
  return mockModelRuntimeText(JSON.stringify(content));
}

describe("history agent", () => {
  afterEach(() => {
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_MODEL;
    delete process.env.HISTORY_TOPIC_ARCHIVE_PATH;
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;
    vi.unstubAllGlobals();
  });

  it("generates a persistent history post notification from model runtime JSON", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse({
      topic: "玄奘取经为什么重要",
      summary: "玄奘西行不只是宗教故事，也推动了中印知识交流。",
      cardCount: 3,
      cards: [
        {
          title: "一张地图讲清路线",
          imageText: "从长安到那烂陀：一次跨越万里的求知",
          prompt: longImagePrompt("玄奘西行路线")
        },
        {
          title: "一张图讲清背景",
          imageText: "为什么他要冒险出发？",
          prompt: longImagePrompt("唐代长安与佛经卷轴")
        },
        {
          title: "一张图讲清影响",
          imageText: "带回的不只是经书，还有世界知识",
          prompt: longImagePrompt("古代书房与世界知识")
        }
      ],
      xiaohongshuCaption: "今天讲一个改变知识流动的历史瞬间：玄奘西行。"
    });

    const result = await agent.execute(createRequest());
    restore();

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

  it("fails without creating a notification when model runtime is unavailable", async () => {
    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.domainUpdates?.historyPush).toBeUndefined();
  });

  it("rejects model output that needs more than five images", async () => {
    const restore = mockModelResponse({
      topic: "超长选题",
      summary: "这条输出不符合图片数量限制。",
      cardCount: 6,
      cards: Array.from({ length: 6 }, (_, index) => ({
        title: `第 ${index + 1} 张`,
        imageText: `文字 ${index + 1}`,
        prompt: longImagePrompt(`超长选题第 ${index + 1} 张`)
      })),
      xiaohongshuCaption: "不应通过"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("5");
  });

  it("repairs image prompts to 100-200 Chinese characters before returning payloads", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse({
      topic: "Prompt repair topic",
      summary: "Short model prompts should not fail the whole task.",
      cardCount: 1,
      cards: [
        {
          title: "Card title",
          imageText: "Image text",
          prompt: "短提示"
        }
      ],
      xiaohongshuCaption: "Caption body"
    });

    const result = await agent.execute(createRequest());
    restore();

    const prompt = result.notifications?.[0]?.payload?.cards[0]?.prompt ?? "";
    const chineseCharacterCount = Array.from(prompt.matchAll(/[\u3400-\u9fff]/gu)).length;

    expect(result.status).toBe("completed");
    expect(prompt).toContain("图片描述");
    expect(prompt).toContain("文字形式展示");
    expect(chineseCharacterCount).toBeGreaterThanOrEqual(100);
    expect(chineseCharacterCount).toBeLessThanOrEqual(200);
  });

  it("removes word-count notes from returned image prompts", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse({
      topic: "字数残留测试",
      summary: "模型有时会把字数要求写进生图提示词。",
      cardCount: 1,
      cards: [
        {
          title: "去掉字数",
          imageText: "画面文字展示知识范围",
          prompt:
            "图片描述：汉代商队穿过西域绿洲驿站，竖版小红书历史知识卡片，主体清晰居中，暖金光线，青灰地图背景，画面上方预留标题，图中文字以文字形式展示路线背景和交流影响，约120字"
        }
      ],
      xiaohongshuCaption: "字数残留测试正文"
    });

    const result = await agent.execute(createRequest());
    restore();

    const prompt = result.notifications?.[0]?.payload?.cards[0]?.prompt ?? "";

    expect(result.status).toBe("completed");
    expect(prompt).not.toMatch(/\d+\s*(?:个)?(?:中文)?(?:字|字符)/u);
  });

  it("instructs the model to separate image description from text knowledge ranges in image prompts", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("图片描述");
      expect(prompt).toContain("图片中应该以文字形式展示哪些知识");
      expect(prompt).toContain("只给出大概知识范围");
      expect(prompt).toContain("不必写详细知识");
      expect(prompt).toContain("不要把字数、字符数或类似“xx字”的说明写进 prompt 字段");

      return JSON.stringify({
        topic: "模板测试",
        summary: "检查生图提示词模板是否包含图文边界要求。",
        cardCount: 1,
        cards: [
          {
            title: "提示词边界",
            imageText: "画面文字只展示知识范围",
            prompt: longImagePrompt("模板测试")
          }
        ],
        xiaohongshuCaption: "模板测试正文"
      });
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
  });

  it("passes xiaohongshu analytics to the model as adaptive guidance", async () => {
    const state = createState();
    state.historyXhs = {
      posts: [
        {
          id: "note-1",
          title: "张骞出使西域",
          publishedAt: "2026-05-20T08:00:00.000Z",
          url: "https://www.xiaohongshu.com/explore/note-1",
          views: 1200,
          likes: 88,
          collects: 19,
          comments: 7,
          shares: 3
        }
      ],
      overview: {
        postCount: 1,
        totalViews: 1200,
        totalLikes: 88,
        totalCollects: 19,
        totalComments: 7,
        totalShares: 3,
        engagementRate: 117 / 1200
      },
      lastSyncedAt: "2026-05-24T08:00:00.000Z",
      status: "idle",
      lastError: null,
      sourceUrl: "https://creator.xiaohongshu.com/statistics/data-analysis"
    };
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("小红书真实发布数据参考");
      expect(prompt).toContain("已同步作品 1 篇");
      expect(prompt).toContain("张骞出使西域");
      expect(prompt).toContain("请先自行判断样本量和数据质量是否足够");
      expect(prompt).toContain("调整选题角度、标题钩子、卡片节奏和正文表达");

      return JSON.stringify({
        topic: "真实数据适配测试",
        summary: "模型应把真实数据作为参考，而不是机械套用。",
        cardCount: 1,
        cards: [
          {
            title: "数据参考",
            imageText: "用真实数据微调表达",
            prompt: longImagePrompt("真实数据适配测试")
          }
        ],
        xiaohongshuCaption: "真实数据适配测试正文"
      });
    });

    const result = await agent.execute(createRequest(state));
    restore();

    expect(result.status).toBe("completed");
  });

  it("accepts content-block array responses that contain JSON text", async () => {
    const restore = mockStructuredModelResponse([
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
              prompt: longImagePrompt("明代宝船与海上航线")
            }
          ],
          xiaohongshuCaption: "今天用一张图讲清郑和下西洋真正留下了什么。"
        })
      }
    ]);

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "每日历史知识点：郑和下西洋真正留下了什么"
    });
  });

  it("accepts single-item JSON array payloads", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse([
      {
        topic: "玛雅历法为什么如此精密",
        summary: "历法背后是长期观测与系统化知识的累积。",
        cardCount: 1,
        cards: [
          {
            title: "先讲为什么精密",
            imageText: "精密历法来自长期观测，而不是神秘传说",
            prompt: longImagePrompt("玛雅文明与天文观测")
          }
        ],
        xiaohongshuCaption: "今天讲清玛雅历法为什么会精密到令人惊讶。"
      }
    ]);

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "每日历史知识点：玛雅历法为什么如此精密"
    });
  });

  it("prefers an unused topic when the requested topic already exists in the archive", async () => {
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
    const restore = mockModelRuntimeText((prompt) => {
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return JSON.stringify({
        topic,
        summary: `${topic} 的摘要`,
        cardCount: 1,
        cards: [
          {
            title: "一张图讲清",
            imageText: `${topic} 图片文案`,
            prompt: longImagePrompt(topic)
          }
        ],
        xiaohongshuCaption: `${topic} 正文`
      });
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]?.payload?.topic).not.toBe("玄奘取经为什么重要");
  });

  it("uses a custom topic from task metadata", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return JSON.stringify({
        topic,
        summary: `${topic} 的摘要`,
        cardCount: 1,
        cards: [
          {
            title: "一张图讲清",
            imageText: `${topic} 图片文案`,
            prompt: longImagePrompt(topic)
          }
        ],
        xiaohongshuCaption: `${topic} 正文`
      });
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        localDate: "2026-05-07",
        topic: "商鞅变法为什么能改变秦国"
      }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]?.payload?.topic).toBe("商鞅变法为什么能改变秦国");
  });

  it("falls back to the least recently generated topic when all topics are archived", async () => {
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
    const restore = mockModelRuntimeText((prompt) => {
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return JSON.stringify({
        topic,
        summary: `${topic} 的摘要`,
        cardCount: 1,
        cards: [
          {
            title: "一张图讲清",
            imageText: `${topic} 图片文案`,
            prompt: longImagePrompt(topic)
          }
        ],
        xiaohongshuCaption: `${topic} 正文`
      });
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]?.payload?.topic).toBe("玄奘取经为什么重要");
  });

  it("fails the task when persisting the topic archive fails", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = archiveDir;
    const restore = mockModelResponse({
      topic: "玄奘取经为什么重要",
      summary: "玄奘西行不只是宗教故事，也推动了中印知识交流。",
      cardCount: 1,
      cards: [
        {
          title: "一张图讲清路线",
          imageText: "从长安到那烂陀：一次跨越万里的求知",
          prompt: longImagePrompt("玄奘西行路线")
        }
      ],
      xiaohongshuCaption: "今天讲一个改变知识流动的历史瞬间：玄奘西行。"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
  });
});
