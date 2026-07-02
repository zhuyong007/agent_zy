import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, HistoryPostPayload } from "@agent-zy/shared-types";

import { agent } from "./index";

const tempDirs: string[] = [];

function createTempArchivePath(): string {
  const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
  tempDirs.push(archiveDir);

  return join(archiveDir, "topic-archive.json");
}

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
    classicShots: {
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

function getPostPayload(result: Awaited<ReturnType<typeof agent.execute>>): HistoryPostPayload {
  return result.notifications?.[0]?.payload as HistoryPostPayload;
}

function longImagePrompt(topic: string) {
  return `${topic}，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，背景包含地图、书卷、建筑纹样与柔和光线，暖金与青灰配色，画面上方预留中文标题区域，下方保留解释文字空间，质感像博物馆展陈海报，细节丰富但不拥挤。`;
}

function createHistoryCards(topic: string, count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    title: `第 ${index + 1} 张`,
    imageText: `${topic} 图文 ${index + 1}`,
    prompt: longImagePrompt(`${topic} 第 ${index + 1} 张`)
  }));
}

function createHistoryCover(topic: string) {
  return {
    title: `${topic}，一眼看懂`,
    subtitle: "被低估的历史转折点",
    imageText: `${topic}\n关键人物 / 时间线 / 长期影响`,
    prompt: `${topic}，竖版小红书历史知识首图封面，强标题层级，主体清晰居中，时代服饰和器物准确，背景包含地图、书卷、建筑纹样与柔和光线，暖金与青灰配色，画面上方预留醒目中文标题区域，中部留出副标题和知识标签，下方保留简短解释文字空间，质感像博物馆展陈海报，适合信息流首屏点击。`
  };
}

function createMostPayload(topic = "谁是中国历史上最富有的商人？") {
  return {
    topic,
    summary: "限定在有可靠财富记录的中国古代商人中，比较可考资产、商业规模与时代购买力。",
    cover: createHistoryCover(topic),
    cardCount: 3,
    cards: createHistoryCards(topic),
    xiaohongshuCaption: `${topic} 正文`
  };
}

function createDynastyModules(dynasty: string) {
  return [
    {
      type: "王朝兴衰录",
      topic: `${dynasty}是怎么一步步走向灭亡的`,
      summary: `${dynasty}从建立背景讲起，串联巅峰、转折、衰落和灭亡，用因果关系讲清王朝命运。`,
      cover: createHistoryCover(`${dynasty}王朝兴衰录`),
      cardCount: 3,
      cards: createHistoryCards(`${dynasty}王朝兴衰录`),
      xiaohongshuCaption: `${dynasty}王朝兴衰录正文`,
      generatedAt: "2026-05-06T23:00:00.000Z"
    },
    {
      type: "皇帝图鉴",
      topic: `看懂${dynasty}只需要认识这几位皇帝`,
      summary: `选择开国、盛世、转折和亡国相关皇帝，说明姓名、在位时间、评价、功绩和问题。`,
      cover: createHistoryCover(`${dynasty}皇帝图鉴`),
      cardCount: 3,
      cards: createHistoryCards(`${dynasty}皇帝图鉴`),
      xiaohongshuCaption: `${dynasty}皇帝图鉴正文`,
      generatedAt: "2026-05-06T23:00:00.000Z"
    },
    {
      type: "风云人物",
      topic: `改变${dynasty}命运的5个人`,
      summary: `挑选真正改变历史走向的人物，解释他们是谁、做了什么、为什么重要以及造成的影响。`,
      cover: createHistoryCover(`${dynasty}风云人物`),
      cardCount: 3,
      cards: createHistoryCards(`${dynasty}风云人物`),
      xiaohongshuCaption: `${dynasty}风云人物正文`,
      generatedAt: "2026-05-06T23:00:00.000Z"
    },
    {
      type: "历史冷知识",
      topic: `${dynasty}普通人买得起房吗？`,
      summary: `围绕人口、经济、工资、饮食、军事、交通和货币等方向，输出适合收藏传播的真实趣味知识。`,
      cover: createHistoryCover(`${dynasty}历史冷知识`),
      cardCount: 3,
      cards: createHistoryCards(`${dynasty}历史冷知识`),
      xiaohongshuCaption: `${dynasty}历史冷知识正文`,
      generatedAt: "2026-05-06T23:00:00.000Z"
    }
  ];
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
  beforeEach(() => {
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = createTempArchivePath();
  });

  afterEach(() => {
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_MODEL;
    delete process.env.HISTORY_TOPIC_ARCHIVE_PATH;
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;
    vi.unstubAllGlobals();

    for (const dataDir of tempDirs.splice(0)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("generates a persistent history post notification from model runtime JSON", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse({
      topic: "玄奘取经为什么重要",
      summary: "玄奘西行不只是宗教故事，也推动了中印知识交流。",
      cover: createHistoryCover("玄奘取经为什么重要"),
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
          cover: expect.objectContaining({
            title: "玄奘取经为什么重要，一眼看懂",
            subtitle: "被低估的历史转折点",
            imageText: expect.stringContaining("关键人物"),
            prompt: expect.stringContaining("小红书历史知识首图封面")
          }),
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

  it("derives a cover plan when model output omits cover", async () => {
    const restore = mockModelResponse({
      topic: "商鞅变法为什么能改变秦国",
      summary: "制度变化重塑了秦国的组织能力和战争动员方式。",
      cardCount: 3,
      cards: createHistoryCards("商鞅变法为什么能改变秦国"),
      xiaohongshuCaption: "今天讲清商鞅变法为什么是秦国崛起的关键。"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(getPostPayload(result).cover).toMatchObject({
      title: "商鞅变法为什么能改变秦国",
      subtitle: expect.stringContaining("制度变化"),
      imageText: expect.stringContaining("商鞅变法为什么能改变秦国"),
      prompt: expect.stringContaining("小红书历史知识首图封面")
    });
  });

  it("limits all generated titles to 20 characters including punctuation", async () => {
    const longTopic = "玄奘西行：一场跨越万里的求知之旅与文明交流";
    const longCoverTitle = "玄奘西行，为什么改变了古代中外文明交流？";
    const longCardTitle = "从长安出发：玄奘如何一步步抵达那烂陀并完成求学";
    const restore = mockModelResponse({
      topic: longTopic,
      summary: "检查标题长度限制。",
      cover: {
        ...createHistoryCover(longTopic),
        title: longCoverTitle
      },
      cardCount: 3,
      cards: [
        {
          ...createHistoryCards(longTopic)[0],
          title: longCardTitle
        },
        ...createHistoryCards(longTopic).slice(1)
      ],
      xiaohongshuCaption: "标题长度测试正文"
    });

    const result = await agent.execute(createRequest());
    restore();

    const payload = getPostPayload(result);

    expect(result.status).toBe("completed");
    expect(payload.topic).toBe(Array.from(longTopic).slice(0, 20).join(""));
    expect(payload.cover?.title).toBe(Array.from(longCoverTitle).slice(0, 20).join(""));
    expect(payload.cards[0]?.title).toBe(Array.from(longCardTitle).slice(0, 20).join(""));
    expect(Array.from(payload.topic)).toHaveLength(20);
    expect(Array.from(payload.cover?.title ?? "")).toHaveLength(20);
    expect(Array.from(payload.cards[0]?.title ?? "")).toHaveLength(20);
  });

  it("fails without creating a notification when model runtime is unavailable", async () => {
    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.domainUpdates?.historyPush).toBeUndefined();
  });

  it("accepts model output with up to ten images", async () => {
    const restore = mockModelResponse({
      topic: "长内容图文数量测试",
      summary: "复杂主题可以拆成更多图文卡片。",
      cardCount: 10,
      cards: createHistoryCards("长内容图文数量测试", 10),
      xiaohongshuCaption: "十张图文正文"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(getPostPayload(result).cardCount).toBe(10);
  });

  it("rejects model output with fewer than three images", async () => {
    const restore = mockModelResponse({
      topic: "过短图文数量测试",
      summary: "少于三张不符合图文结构下限。",
      cardCount: 2,
      cards: createHistoryCards("过短图文数量测试", 2),
      xiaohongshuCaption: "不应通过"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("3 到 10");
  });

  it("rejects model output with more than ten images", async () => {
    const restore = mockModelResponse({
      topic: "超长图文数量测试",
      summary: "超过十张不符合图片数量限制。",
      cardCount: 11,
      cards: createHistoryCards("超长图文数量测试", 11),
      xiaohongshuCaption: "不应通过"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("3 到 10");
  });

  it("repairs image prompts to 100-200 Chinese characters before returning payloads", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse({
      topic: "Prompt repair topic",
      summary: "Short model prompts should not fail the whole task.",
      cardCount: 3,
      cards: [
        {
          title: "Card title",
          imageText: "Image text",
          prompt: "短提示"
        },
        ...createHistoryCards("Prompt repair topic").slice(1)
      ],
      xiaohongshuCaption: "Caption body"
    });

    const result = await agent.execute(createRequest());
    restore();

    const prompt = getPostPayload(result).cards[0]?.prompt ?? "";
    const chineseCharacterCount = Array.from(prompt.matchAll(/[\u3400-\u9fff]/gu)).length;

    expect(result.status).toBe("completed");
    expect(prompt).toContain("图片描述");
    expect(prompt).toContain("文字类型展示");
    expect(chineseCharacterCount).toBeGreaterThanOrEqual(100);
    expect(chineseCharacterCount).toBeLessThanOrEqual(200);
  });

  it("removes word-count notes from returned image prompts", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelResponse({
      topic: "字数残留测试",
      summary: "模型有时会把字数要求写进生图提示词。",
      cardCount: 3,
      cards: [
        {
          title: "去掉字数",
          imageText: "画面文字展示知识范围",
          prompt:
            "图片描述：汉代商队穿过西域绿洲驿站，竖版小红书历史知识卡片，主体清晰居中，暖金光线，青灰地图背景，画面上方预留标题，图中文字以文字形式展示路线背景和交流影响，约120字"
        },
        ...createHistoryCards("字数残留测试").slice(1)
      ],
      xiaohongshuCaption: "字数残留测试正文"
    });

    const result = await agent.execute(createRequest());
    restore();

    const prompt = getPostPayload(result).cards[0]?.prompt ?? "";

    expect(result.status).toBe("completed");
    expect(prompt).not.toMatch(/\d+\s*(?:个)?(?:中文)?(?:字|字符)/u);
  });

  it("instructs the model to separate image description from text knowledge ranges in image prompts", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("图片描述");
      expect(prompt).toContain("图片中应该以文字类型展示哪些具体知识");
      expect(prompt).toContain("根据内容判断需要多少张");
      expect(prompt).toContain("cover");
      expect(prompt).toContain("小红书首图封面");
      expect(prompt).toContain("下限 3 张，上限 10 张");
      expect(prompt).toContain("展示哪些具体知识");
      expect(prompt).toContain("不能只写“留出空白位置以用于某种内容”");
      expect(prompt).toContain("同步明确空白部分需要填充的具体文字内容");
      expect(prompt).not.toContain("只给出大概知识范围");
      expect(prompt).not.toContain("不必写详细知识");
      expect(prompt).toContain("所有标题最长 20 个字，标点也计入");
      expect(prompt).toContain("不要把字数、字符数或类似“xx字”的说明写进 prompt 字段");
      expect(prompt).toContain("xiaohongshuCaption 控制在 200–400 字");
      expect(prompt).toContain("使用自然换行形成漂亮、易读的排版");
      expect(prompt).toContain("3–5 个相关话题标签");

      return JSON.stringify({
        topic: "模板测试",
        summary: "检查生图提示词模板是否包含图文边界要求。",
        cardCount: 3,
        cards: createHistoryCards("模板测试"),
        xiaohongshuCaption: "模板测试正文"
      });
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
  });

  it("requests enough budget for the long JSON response from the shared model runtime", async () => {
    const generateText = vi.fn(async () => ({
      text: JSON.stringify({
        topic: "格式测试",
        summary: "检查历史知识生成是否声明 JSON 响应格式。",
        cardCount: 3,
        cards: createHistoryCards("格式测试"),
        xiaohongshuCaption: "格式测试正文"
      })
    }));
    (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__ = {
      generateText
    };

    const result = await agent.execute(createRequest());
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;

    expect(result.status).toBe("completed");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 9000,
        responseFormat: "json",
        timeoutMs: 600_000
      })
    );
  });

  it("retries once with a compact JSON request when the first model response is incomplete", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          topic: "伍子胥",
          summary: "第一次响应在卡片中途结束，没有返回正文。",
          cardCount: 3,
          cards: createHistoryCards("伍子胥")
        })
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          topic: "伍子胥",
          summary: "第二次响应返回完整结构。",
          xiaohongshuCaption: "今天讲清伍子胥跌宕的一生。",
          cardCount: 3,
          cards: createHistoryCards("伍子胥")
        })
      });
    (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__ = {
      generateText
    };

    const result = await agent.execute(createRequest());
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;

    expect(result.status).toBe("completed");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[1]?.[0]?.prompt).toContain("上一次输出不完整");
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
        cardCount: 3,
        cards: createHistoryCards("真实数据适配测试"),
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
          cardCount: 3,
          cards: createHistoryCards("郑和下西洋真正留下了什么"),
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
        cardCount: 3,
        cards: createHistoryCards("玛雅历法为什么如此精密"),
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

  it("accepts OpenAI-compatible choice payloads that wrap JSON content", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelRuntimeText(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `\`\`\`json
${JSON.stringify({
  topic: "张骞出使西域如何改变丝绸之路",
  summary: "张骞出使西域打开了汉朝理解欧亚大陆的新窗口。",
  cardCount: 3,
  cards: createHistoryCards("张骞出使西域如何改变丝绸之路"),
  xiaohongshuCaption: "今天讲清张骞出使西域为什么改变了丝绸之路。"
})}
\`\`\``
            }
          }
        ]
      })
    );

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "每日历史知识点：张骞出使西域如何改变丝绸之路"
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
        cardCount: 3,
        cards: createHistoryCards(topic),
        xiaohongshuCaption: `${topic} 正文`
      });
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(getPostPayload(result).topic).not.toBe("玄奘取经为什么重要");
  });

  it("avoids topics already present in history notifications even when archive is empty", async () => {
    const state = createState();
    state.notifications = [
      {
        id: "history-xuanzang",
        kind: "history-post",
        title: "每日历史知识点：玄奘取经为什么重要",
        body: "玄奘西行推动了中印知识交流。",
        createdAt: "2026-05-08T08:00:00.000Z",
        read: false,
        persistent: true,
        payload: {
          topic: "玄奘取经为什么重要",
          summary: "玄奘西行推动了中印知识交流。",
          cardCount: 1,
          cards: [
            {
              title: "路线",
              imageText: "从长安到那烂陀",
              prompt: longImagePrompt("玄奘西行路线")
            }
          ],
          xiaohongshuCaption: "今天讲玄奘取经。",
          generatedAt: "2026-05-08T08:00:00.000Z"
        }
      }
    ];
    const restore = mockModelRuntimeText((prompt) => {
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return JSON.stringify({
        topic,
        summary: `${topic} 的摘要`,
        cardCount: 3,
        cards: createHistoryCards(topic),
        xiaohongshuCaption: `${topic} 正文`
      });
    });

    const result = await agent.execute({
      ...createRequest(state),
      meta: {
        localDate: "2026-05-09"
      }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(getPostPayload(result).topic).not.toBe("玄奘取经为什么重要");
  });

  it("uses a custom topic from task metadata", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      const topicMatch = prompt.match(/「(.+?)」/);
      const topic = topicMatch?.[1] ?? "未知主题";

      return JSON.stringify({
        topic,
        summary: `${topic} 的摘要`,
        cardCount: 3,
        cards: createHistoryCards(topic),
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
    expect(getPostPayload(result).topic).toBe("商鞅变法为什么能改变秦国");
  });

  it("generates the most series with grounded superlative instructions", async () => {
    writeFileSync(
      process.env.HISTORY_TOPIC_ARCHIVE_PATH!,
      JSON.stringify({
        entries: [
          {
            topic: "玄奘取经为什么重要",
            firstGeneratedAt: "2026-05-01T00:00:00.000Z",
            lastGeneratedAt: "2026-05-01T00:00:00.000Z",
            generatedCount: 1
          }
        ]
      }),
      "utf8"
    );
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("“最”系列");
      expect(prompt).toContain("形容词");
      expect(prompt).toContain("人、物或事件");
      expect(prompt).toContain("比较范围");
      expect(prompt).toContain("评价标准");
      expect(prompt).toContain("史料依据");
      expect(prompt).toContain("争议");
      expect(prompt).toContain("中国历史");

      return JSON.stringify(createMostPayload());
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        localDate: "2026-05-07",
        mode: "most"
      }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("生成“最”系列：谁是中国历史上最富有的商人？");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "“最”系列：谁是中国历史上最富有的商人？",
      payload: expect.objectContaining({
        topic: "谁是中国历史上最富有的商人？"
      })
    });
    expect(JSON.parse(readFileSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH!, "utf8"))).toEqual({
      entries: [
        expect.objectContaining({
          topic: "玄奘取经为什么重要"
        }),
        expect.objectContaining({
          topic: "谁是中国历史上最富有的商人？",
          series: "most",
          scope: "china",
          generatedCount: 1
        })
      ]
    });
  });

  it("uses world history for every fifth successful most-series generation", async () => {
    writeFileSync(
      process.env.HISTORY_TOPIC_ARCHIVE_PATH!,
      JSON.stringify({
        entries: Array.from({ length: 4 }, (_, index) => ({
          topic: `中国历史最系列${index + 1}`,
          firstGeneratedAt: `2026-05-0${index + 1}T00:00:00.000Z`,
          lastGeneratedAt: `2026-05-0${index + 1}T00:00:00.000Z`,
          generatedCount: 1,
          series: "most",
          scope: "china"
        }))
      }),
      "utf8"
    );
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("世界历史");
      expect(prompt).toContain("中国历史最系列1");
      expect(prompt).toContain("中国历史最系列4");

      return JSON.stringify(createMostPayload("历史上最昂贵的战争是哪一场？"));
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "most" }
    });
    restore();

    expect(result.status).toBe("completed");
    const archive = JSON.parse(readFileSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH!, "utf8"));
    expect(archive.entries.at(-1)).toMatchObject({
      series: "most",
      scope: "world"
    });
  });

  it("retries most-series generation when the topic omits the superlative", async () => {
    let attempts = 0;
    const restore = mockModelRuntimeText(() => {
      attempts += 1;
      return JSON.stringify(
        attempts === 1
          ? createMostPayload("中国古代富有的商人是谁？")
          : createMostPayload("谁是中国历史上最富有的商人？")
      );
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "most" }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(getPostPayload(result).topic).toContain("最");
  });

  it("fails most-series generation without archiving when both topics omit the superlative", async () => {
    const restore = mockModelResponse(createMostPayload("中国古代富有的商人是谁？"));

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "most" }
    });
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("必须保留“最”");
    expect(existsSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH!)).toBe(false);
  });

  it("generates a dynasty four-module payload from dynasty metadata", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("朝代名称");
      expect(prompt).toContain("王朝兴衰录");
      expect(prompt).toContain("皇帝图鉴");
      expect(prompt).toContain("风云人物");
      expect(prompt).toContain("历史冷知识");
      expect(prompt).toContain("竖版小红书知识卡片");
      expect(prompt).toContain("严格 JSON");
      expect(prompt).toContain("按时间顺序选择 5-8 个真正改变王朝走向的重大事件");
      expect(prompt).toContain("每张卡片聚焦一个事件");
      expect(prompt).toContain("人物只作为事件参与者简要出现");
      expect(prompt).toContain("避免与“皇帝图鉴”和“风云人物”重复");
      expect(prompt).toContain("所有标题最长 20 个字，标点也计入");
      expect(prompt).toContain("xiaohongshuCaption 控制在 200–400 字");
      expect(prompt).toContain("使用自然换行形成漂亮、易读的排版");
      expect(prompt).toContain("3–5 个相关话题标签");
      expect(prompt).toContain("不能只写“留出空白位置以用于某种内容”");
      expect(prompt).toContain("同步明确空白部分需要填充的具体文字内容");

      return JSON.stringify({
        dynasty: "东汉",
        modules: createDynastyModules("东汉")
      });
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        localDate: "2026-05-07",
        mode: "dynasty",
        dynasty: "东汉"
      }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("生成朝代四件套：东汉");
    expect(result.notifications).toEqual([
      expect.objectContaining({
        kind: "history-post",
        persistent: true,
        title: "朝代四件套：东汉",
        payload: expect.objectContaining({
          dynasty: "东汉",
          modules: [
            expect.objectContaining({
              type: "王朝兴衰录",
              topic: "东汉是怎么一步步走向灭亡的",
              cover: expect.objectContaining({
                prompt: expect.stringContaining("小红书历史知识首图封面")
              }),
              cardCount: 3,
              cards: expect.arrayContaining([
                expect.objectContaining({
                  prompt: expect.stringContaining("竖版小红书历史知识卡片")
                })
              ]),
              xiaohongshuCaption: "东汉王朝兴衰录正文",
              generatedAt: "2026-05-06T23:00:00.000Z"
            }),
            expect.objectContaining({
              type: "皇帝图鉴",
              cardCount: 3
            }),
            expect.objectContaining({
              type: "风云人物",
              cardCount: 3
            }),
            expect.objectContaining({
              type: "历史冷知识",
              cardCount: 3
            })
          ]
        })
      })
    ]);
  });

  it("rejects dynasty output when required modules are missing", async () => {
    const restore = mockModelResponse({
      dynasty: "东汉",
      modules: createDynastyModules("东汉").slice(0, 3)
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        localDate: "2026-05-07",
        mode: "dynasty",
        dynasty: "东汉"
      }
    });
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("4 个固定模块");
  });

  it("rejects dynasty output when module order is wrong", async () => {
    const modules = createDynastyModules("东汉");
    const restore = mockModelResponse({
      dynasty: "东汉",
      modules: [modules[1], modules[0], modules[2], modules[3]]
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        localDate: "2026-05-07",
        dynasty: "东汉"
      }
    });
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
    expect(result.summary).toContain("模块顺序");
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
        cardCount: 3,
        cards: createHistoryCards(topic),
        xiaohongshuCaption: `${topic} 正文`
      });
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expect(getPostPayload(result).topic).toBe("玄奘取经为什么重要");
  });

  it("fails the task when persisting the topic archive fails", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = archiveDir;
    const restore = mockModelResponse({
      topic: "玄奘取经为什么重要",
      summary: "玄奘西行不只是宗教故事，也推动了中印知识交流。",
      cardCount: 3,
      cards: createHistoryCards("玄奘取经为什么重要"),
      xiaohongshuCaption: "今天讲一个改变知识流动的历史瞬间：玄奘西行。"
    });

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("failed");
    expect(result.notifications).toBeUndefined();
  });
});
