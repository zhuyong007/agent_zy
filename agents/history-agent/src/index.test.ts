import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, HistoryDynastyPayload, HistoryPostPayload } from "@agent-zy/shared-types";

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

function getDynastyPayload(result: Awaited<ReturnType<typeof agent.execute>>): HistoryDynastyPayload {
  return result.notifications?.[0]?.payload as HistoryDynastyPayload;
}

function expectThreeFourAspectRatio(payload: HistoryPostPayload) {
  const cover = payload.cover;
  const visualDescription = (prompt: string) => prompt.split("文字生成要求（最高优先级）")[0] ?? prompt;

  expect(cover).toBeDefined();

  if (!cover) {
    throw new Error("历史知识输出缺少封面");
  }

  expect(cover.prompt).toMatch(/^3:4竖版构图/u);
  expect(visualDescription(cover.prompt)).not.toMatch(/横版|横向(?:画幅|画面|构图)|宽幅|方形(?:画幅|画面|构图)/u);

  for (const card of payload.cards) {
    expect(card.prompt).toMatch(/^3:4竖版构图/u);
    expect(visualDescription(card.prompt)).not.toMatch(/横版|横向(?:画幅|画面|构图)|宽幅|方形(?:画幅|画面|构图)/u);
  }
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
  const title = `${topic}，一眼看懂`;

  return {
    title,
    subtitle: "被低估的历史转折点",
    imageText: title,
    prompt: `${topic}，3:4竖版构图，小红书历史知识首图封面，点击型设计，一个与主题直接相关的强视觉主体，主体占据主要视觉面积，准确时代氛围，电影感光影，画面干净有冲击力，用关键一刻制造悬念，图片与标题相互解释。`
  };
}

function createMostPayload(topic = "谁是中国历史上最富有的商人？") {
  const nextTopic = topic.includes("昂贵")
    ? "中国史上最长的战争是哪场？"
    : "中国史上最富有的皇帝是谁？";

  return {
    topic,
    summary: "限定在有可靠财富记录的中国古代商人中，比较可考资产、商业规模与时代购买力。",
    cover: createHistoryCover(topic),
    cardCount: 3,
    cards: createHistoryCards(topic),
    xiaohongshuCaption: `${topic} 正文。关注我，下期讲${nextTopic}`,
    followUpIdeas: [nextTopic, "历史上最复杂的税制是什么？"]
  };
}

function createWarPayload(topic = "长平之战为何改变战国格局") {
  const nextTopic = topic.includes("坎尼")
    ? "赤壁之战的火攻为何奏效"
    : "赤壁之战如何利用水战";

  return {
    topic,
    summary: "从秦赵双方目标、上党地缘、补给条件和战场决策讲清长平之战，并说明兵力与伤亡数字的史料争议。",
    cover: createHistoryCover(topic),
    cardCount: 3,
    cards: createHistoryCards(topic),
    xiaohongshuCaption: `${topic} 正文。关注我，下期讲${nextTopic}`,
    followUpIdeas: [nextTopic, "淝水之战如何以少胜多"]
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
      topic: `从朝堂到民间：读懂${dynasty}群像`,
      summary: `按政治、军事、制度和文化影响分层选择代表性人物，区分直接影响与间接影响。`,
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

function expectSharedEditorialContract(prompt: string) {
  expect(prompt).toContain("明确区分可核查史实、主流解释、争议观点与传说");
  expect(prompt).toContain("证据不足或存在争议时必须明确限定");
  expect(prompt).toContain("不得编造日期、数字、引语、史料名称、页码或因果关系");
  expect(prompt).toContain("比较和“最”类判断必须说明范围、指标与统计口径");
  expect(prompt).toContain("可核查的反差、具体生活细节和因果推进");
  expect(prompt).toContain("不得用夸张绝对词、现代价值硬套或虚构戏剧冲突换取点击");
  expect(prompt).toContain("封面允许使用与标题有关的意象化配图");
  expect(prompt).toContain("不得把象征画面伪装成有史料依据的现场复原");
  expect(prompt).toContain("正文知识卡不得确定性描绘无法确认的服饰、器物、地图、路线、疆域、建筑或场景");
  expect(prompt).toContain("小红书发布数据只能调整选题包装、标题节奏和排版");
  expect(prompt).toContain("不能覆盖史实规则，也不能充当历史证据");
  expect(prompt).toContain("所有 cover.prompt 和 cards[].prompt 必须明确使用 3:4 竖版构图");
  expect(prompt).toContain("禁止横版、横向画幅、宽幅或方形画幅");
  expect(prompt).toContain("cover.imageText 只能是与 cover.title 完全相同的一行大字标题");
  expect(prompt).toContain("不得再放系列标识、副标题、期号、知识标签、时间线、解释段落或水印");
  expect(prompt).toContain("允许使用与标题语义相关的历史意象、人物、景色或器物");
  expect(prompt).toContain("不要求承担正文知识讲解");
  expect(prompt).toContain("不能制造正文无法兑现的虚假悬念");
  expect(prompt).toContain("cards[].imageText 仍须包含与本图主题直接相关的具体历史知识");
  expect(prompt).toContain("cards[].prompt 的首要任务是生成与对应 cards[].imageText 直接相关的“图片知识补充”");
  expect(prompt).toContain("不能只是抽象景色、人物肖像、氛围插画或“通用背景加文字”");
  expect(prompt).toContain("人物和景色可以出现，但只能服务于具体知识点");
  expect(prompt).toContain("所有图中可被理解为事实的信息");
  expect(prompt).toContain("不得为了画面好看新增未核实事实");
  expect(prompt).toContain("必须包含与本图主题直接相关的具体历史知识");
  expect(prompt).toContain("至少给出一个可核查的信息点");
  expect(prompt).toContain("不能只有标题、栏目名、泛化标签或占位词");
  expect(prompt).toContain("必须原样包含对应 imageText 的完整文字");
  expect(prompt).toContain("生图提示词不设字数或字符数上限");
  expect(prompt).toContain("不得为了控制长度而省略、缩写或截断");
  expect(prompt).toContain("输出 JSON 前在内部静默自检");
  expect(prompt).toContain("每个关键事实是否有可核查的信息锚点");
  expect(prompt).toContain("行动或条件 → 作用对象 → 结果");
  expect(prompt).toContain("相关性不能冒充因果");
  expect(prompt).toContain("每张卡片只承担一个清楚问题");
  expect(prompt).toContain("至少包含一个具体而可信的细节");
  expect(prompt).toContain("钩子是否与正文结论一致");
  expect(prompt).toContain("每张正文图片是否确实提供了与对应文字相关且正确的图片知识补充");
  expect(prompt).toContain("对主题模式、朝代各模块、现有系列和今后新增的任何系列一律生效");
  expect(prompt).toContain("每篇都必须让读者一眼知道这不是孤立知识点");
  expect(prompt).toContain("系列标识不占用封面文字");
  expect(prompt).toContain("cover.imageText 和 coverTextOptions 都只提供单行大字标题");
  expect(prompt).toContain("titleOptions 至少有一个方案带系列标识");
  expect(prompt).toContain("【宋朝冷知识 01】");
  expect(prompt).toContain("只有上下文提供了可核实期号");
  expect(prompt).toContain("关注后能持续获得什么");
  expect(prompt).toContain("禁止只写“关注我”“持续更新”");
  expect(prompt).toContain("下期看/下期讲/下一篇");
  expect(prompt).toContain("正文必须原样写出 followUpIdeas[0]");
  expect(prompt).toContain("系统会把它记录为该系列下一篇的必做选题");
  expect(prompt).toContain("每篇都按 topic、summary、xiaohongshuCaption、cover、cardCount、cards、titleOptions、coverTextOptions、followUpIdeas 输出完整字段");
  expect(prompt).toContain("封面是否只有一个大字标题");
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
          category: "主题",
          topic: "玄奘取经为什么重要",
          cover: expect.objectContaining({
            title: "玄奘取经为什么重要，一眼看懂",
            subtitle: "被低估的历史转折点",
            imageText: "玄奘取经为什么重要，一眼看懂",
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
      imageText: "商鞅变法为什么能改变秦国",
      prompt: expect.stringContaining("小红书历史知识首图封面")
    });
  });

  it("keeps only one large headline in the generated cover", async () => {
    const headline = "商鞅变法靠什么逆袭？";
    const verboseImageText = "【变法史 01】\n商鞅变法靠什么逆袭？\n制度背景 / 时间线 / 长期影响";
    const restore = mockModelResponse({
      topic: headline,
      summary: "商鞅变法通过制度重组增强秦国的组织和动员能力。",
      cover: {
        title: headline,
        subtitle: "用视觉反差表现改革前后的国力变化",
        imageText: verboseImageText,
        prompt: `3:4竖版构图，小红书历史知识首图封面，主体清晰居中，画面文字：${verboseImageText}，中部放副标题和知识标签，下方放解释文字，电影感光影。`
      },
      cardCount: 3,
      cards: createHistoryCards(headline),
      xiaohongshuCaption: "商鞅变法正文",
      coverTextOptions: ["商鞅变法为何奏效", "一场变法如何改写秦国"]
    });

    const result = await agent.execute(createRequest());
    restore();

    const cover = getPostPayload(result).cover;

    expect(result.status).toBe("completed");
    expect(cover?.imageText).toBe(headline);
    expect(cover?.prompt).toContain("【唯一封面标题】");
    expect(cover?.prompt).toContain(headline);
    expect(cover?.prompt).toContain("画面只允许出现一个醒目的单行简体中文大字标题");
    expect(cover?.prompt).toContain("配图允许使用与标题语义直接相关的历史意象、人物、景色、器物或关键场景");
    expect(cover?.prompt).toContain("象征性画面不得冒充有史料依据的历史现场");
    expect(cover?.prompt).toContain("其余信息全部通过与主题匹配的视觉主体");
    expect(cover?.prompt).not.toContain("制度背景 / 时间线 / 长期影响");
    expect(cover?.prompt).not.toContain("中部放副标题和知识标签");
    expect(cover?.prompt).not.toContain("下方放解释文字");
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

  it("preserves complete image prompts without a length cap and injects exact image text", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const imageText = "张骞出使西域\n公元前138年从长安出发\n打通汉朝了解西域的通道";
    const longPrompt = `图片描述：汉代使者与西域路线图，主体清晰居中，史实边界准确。${"补充完整的时代场景、地图路线、人物动作、光线色彩与版式细节。".repeat(12)}这是不可被截断的结尾。`;
    const restore = mockModelResponse({
      topic: "Prompt repair topic",
      summary: "Short model prompts should not fail the whole task.",
      cardCount: 3,
      cards: [
        {
          title: "Card title",
          imageText,
          prompt: longPrompt
        },
        ...createHistoryCards("Prompt repair topic").slice(1)
      ],
      xiaohongshuCaption: "Caption body"
    });

    const result = await agent.execute(createRequest());
    restore();

    const payload = getPostPayload(result);
    const prompt = payload.cards[0]?.prompt ?? "";
    const chineseCharacterCount = Array.from(prompt.matchAll(/[\u3400-\u9fff]/gu)).length;

    expect(result.status).toBe("completed");
    expect(prompt).toContain(longPrompt);
    expect(prompt).toContain("这是不可被截断的结尾");
    expect(prompt).toContain("【必须生成的文字】");
    expect(prompt).toContain(imageText);
    expect(prompt).toContain("不得省略、改写、替换或截断");
    expect(prompt).toContain("不要只生成历史场景或无字插画");
    expect(prompt).toContain("图片知识表达与正确性要求（最高优先级）");
    expect(prompt).toContain("图像本身必须直接解释或补充对应文字中的一个事实、关系、结构、过程或差异");
    expect(prompt).toContain("人物和景色可以出现，但只能服务于具体知识点");
    expect(prompt).toContain("不得自行新增未经核实的事实");
    expect(prompt).toContain("不得虚构确定性细节");
    expect(chineseCharacterCount).toBeGreaterThan(200);
    expect(payload.cover?.prompt).toContain(payload.cover?.imageText);
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

  it("enforces 3:4 portrait prompts and removes conflicting canvas directions", async () => {
    const payload = {
      topic: "画幅约束测试",
      summary: "历史知识模块的所有图片都应采用统一画幅。",
      cover: {
        ...createHistoryCover("画幅约束测试"),
        prompt: "横版构图，主体居中，顶部留出标题区域，整体为小红书历史知识首图封面。"
      },
      cardCount: 3,
      cards: [
        {
          title: "横版输入",
          imageText: "横版输入会被修正",
          prompt: "小红书知识卡片，横版，古代城市与人物群像，画面上方预留标题文字区域。"
        },
        {
          title: "横向画幅输入",
          imageText: "横向画幅会被修正",
          prompt: "横向画幅展示历史时间线，中央放置关键人物，底部留出解释文字区域。"
        },
        {
          title: "方形输入",
          imageText: "方形画幅会被修正",
          prompt: "方形画幅，小红书历史知识卡片，主体清晰，右侧放置具体知识标签。"
        }
      ],
      xiaohongshuCaption: "画幅约束测试正文"
    };
    const restore = mockModelResponse(payload);

    const result = await agent.execute(createRequest());
    restore();

    expect(result.status).toBe("completed");
    expectThreeFourAspectRatio(getPostPayload(result));
  });

  it("instructs the model to separate minimal cover text from detailed knowledge cards", async () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "history-agent-"));
    process.env.HISTORY_TOPIC_ARCHIVE_PATH = join(archiveDir, "topic-archive.json");
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("封面单独按“点击型首图”设计");
      expect(prompt).toContain("imageText 必须与 title 完全相同");
      expect(prompt).toContain("画面只允许出现这一处标题文字");
      expect(prompt).toContain("封面配图可以是与标题语义直接相关的历史意象、人物、景色、器物或关键场景");
      expect(prompt).toContain("不强求像正文知识卡一样承载解释信息");
      expect(prompt).toContain("不能把无史料依据的象征画面写成确定的历史现场");
      expect(prompt).toContain("禁止添加系列标识、期号、副标题、知识标签、时间线、解释文字、水印或其他小字");
      expect(prompt).toContain("禁止做成多栏知识卡、目录页或元素堆砌的信息海报");
      expect(prompt).toContain("第一职责是生成与对应 imageText 直接相关且正确的图片知识补充");
      expect(prompt).toContain("禁止只用抽象景色、人物肖像、氛围插画或通用背景承载文字");
      expect(prompt).toContain("优先使用可核查的地图与路线、时间或流程关系、器物与建筑结构");
      expect(prompt).toContain("所有年代、地点、路线、疆域、比例、服饰、器物、建筑、旗帜、文字和人物关系必须符合可靠史料");
      expect(prompt).toContain("存在争议或无法确认外观时，改用中性示意、范围表达或明确复原边界");
      expect(prompt).toContain("根据内容判断需要多少张");
      expect(prompt).toContain("cover");
      expect(prompt).toContain("小红书历史知识首图封面");
      expect(prompt).toContain("下限 3 张，上限 10 张");
      expect(prompt).toContain("若提到文字区域，必须写明需要填充的具体文字");
      expect(prompt).not.toContain("只给出大概知识范围");
      expect(prompt).not.toContain("不必写详细知识");
      expect(prompt).toContain("所有标题最长 20 个字，标点也计入");
      expect(prompt).toContain("不要把字数、字符数或类似“xx字”的说明写进 prompt 字段");
      expect(prompt).toContain("不设字数或字符数上限");
      expect(prompt).toContain("原样逐字包含完整 imageText");
      expect(prompt).toContain("禁止只生成历史场景或无字插画");
      expect(prompt).toContain("不能只有标题、栏目名、泛化标签或占位词");
      expect(prompt).not.toContain("系统会自行校验长度");
      expect(prompt).toContain("xiaohongshuCaption 控制在 200–400 字");
      expect(prompt).toContain("使用自然换行形成漂亮、易读的排版");
      expect(prompt).toContain("3–5 个相关话题标签");
      expect(prompt).toContain("3:4竖版构图");
      expect(prompt).toContain("禁止横版、横向画幅、宽幅或方形画幅");

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
    expectThreeFourAspectRatio(getPostPayload(result));
  });

  it("applies the shared accuracy and interest contract to topic generation", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      expectSharedEditorialContract(prompt);

      return JSON.stringify({
        topic: "普通主题质量契约",
        summary: "检查普通主题是否收到统一编辑规则。",
        cardCount: 3,
        cards: createHistoryCards("普通主题质量契约"),
        xiaohongshuCaption: "普通主题质量契约正文"
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
    expectSharedEditorialContract(
      `${generateText.mock.calls[1]?.[0]?.systemPrompt ?? ""}\n${generateText.mock.calls[1]?.[0]?.prompt ?? ""}`
    );
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

  it("uses editorial topic context and returns traceable workflow metadata", async () => {
    const state = createState();
    state.historyOperations = {
      strategy: { accountName: "历史知识", audience: "城市史读者", promise: "用可靠材料讲清城市生活", weeklyCadence: 5 },
      series: [{ id: "city-series", name: "城市生活史", description: "从城市日常进入历史", status: "pilot", generator: "generic", dailyQuota: 0, plannedTotal: 10, publishedCount: 0, promptInstruction: "每篇从一个生活问题切入", successorSeriesId: null, startDate: null, endDate: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
      directions: [{ id: "city-history", name: "城市史", description: "街道与市场", active: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
      topics: [{
        id: "topic-night-market",
        title: "宋代夜市真的通宵吗",
        seriesId: "city-series",
        directionId: "city-history",
        angle: "从营业时间和城市管理切入",
        targetAudience: "城市史读者",
        hook: "通宵说法能否被史料支持",
        status: "ready",
        scores: { demand: 4, curiosity: 5, contrast: 4, collectability: 5, visualPotential: 4, evidenceStrength: 4, extensibility: 4, risk: 2 },
        sourceCards: [{ id: "source-1", title: "东京梦华录", sourceType: "primary", citation: "卷二", url: null, claim: "记录夜市活动", confidence: "A", notes: "注意成书背景" }],
        riskNotes: ["不要把个别记录扩大为所有城市"],
        scheduledFor: null,
        linkedNotificationId: null,
        publishedPostId: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }],
      lastUpdatedAt: "2026-08-01T00:00:00.000Z"
    };
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("所属系列：城市生活史");
      expect(prompt).toContain("本篇系列期号：01（根据后台已发布 0 篇计算）");
      expect(prompt).toContain("系列生成要求：每篇从一个生活问题切入");
      expect(prompt).toContain("内容方向：城市史");
      expect(prompt).toContain("切入角度：从营业时间和城市管理切入");
      expect(prompt).toContain("[A] 东京梦华录");
      expect(prompt).toContain("titleOptions、coverTextOptions、followUpIdeas");
      expect(prompt).toContain("只生成图文，不要生成口播稿");
      return JSON.stringify({
        topic: "宋代夜市真的通宵吗",
        summary: "从史料边界讲清宋代夜市。",
        cardCount: 3,
        cards: createHistoryCards("宋代夜市"),
        xiaohongshuCaption: "宋代夜市正文。关注我，下期讲宋代城市如何宵禁",
        titleOptions: ["宋代夜市通宵吗", "夜市几点才收摊"],
        coverTextOptions: ["宋代夜市真相"],
        followUpIdeas: ["宋代城市如何宵禁"]
      });
    });
    const request = createRequest(state);
    request.meta = { ...request.meta, topic: "宋代夜市真的通宵吗", editorialTopicId: "topic-night-market" };

    const result = await agent.execute(request);
    restore();

    expect(result.status).toBe("completed");
    expect(getPostPayload(result)).toMatchObject({
      titleOptions: ["宋代夜市通宵吗", "夜市几点才收摊"],
      followUpIdeas: ["宋代城市如何宵禁"],
      workflow: {
        editorialTopicId: "topic-night-market",
        seriesId: "city-series",
        seriesName: "城市生活史",
        directionId: "city-history",
        directionName: "城市史",
        sourceCount: 1,
        hasPrimarySource: true,
        needsFactReview: false
      }
    });

    const restoreNext = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("上期已经公开预告本期主题为「宋代城市如何宵禁」");
      expect(prompt).toContain("topic 必须原样等于「宋代城市如何宵禁」");
      return JSON.stringify({
        topic: "宋代城市如何宵禁",
        summary: "从制度和执行边界讲清宋代城市宵禁。",
        cardCount: 3,
        cards: createHistoryCards("宋代城市宵禁"),
        xiaohongshuCaption: "宋代城市宵禁正文。关注我，下期讲宋代早市几点开门",
        titleOptions: ["宋代城市如何宵禁"],
        coverTextOptions: ["宋代宵禁真相"],
        followUpIdeas: ["宋代早市几点开门"]
      });
    });
    const nextRequest = createRequest(state);
    nextRequest.meta = { ...nextRequest.meta, seriesId: "city-series" };
    const nextResult = await agent.execute(nextRequest);
    restoreNext();

    expect(nextResult.status).toBe("completed");
    expect(getPostPayload(nextResult).topic).toBe("宋代城市如何宵禁");
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
      expect(prompt).toContain("3:4竖版构图");
      expect(prompt).toContain("禁止横版、横向画幅、宽幅或方形画幅");

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
    expectThreeFourAspectRatio(getPostPayload(result));
    expect(result.summary).toBe("生成“最”系列：谁是中国历史上最富有的商人？");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "“最”系列：谁是中国历史上最富有的商人？",
      payload: expect.objectContaining({
        category: "最",
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
      ],
      plannedNextTopics: {
        "generator:most": expect.objectContaining({
          topic: "中国史上最富有的皇帝是谁？",
          promisedFromTopic: "谁是中国历史上最富有的商人？",
          scope: "china"
        })
      }
    });
  });

  it("applies the shared accuracy and interest contract to most-series generation", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      expectSharedEditorialContract(prompt);

      return JSON.stringify(createMostPayload());
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "most" }
    });
    restore();

    expect(result.status).toBe("completed");
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
    const restore = mockModelRuntimeText((prompt) => {
      attempts += 1;

      if (attempts === 2) {
        expectSharedEditorialContract(prompt);
      }

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

  it("generates the war series with a grounded randomly selected conflict", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("“战争”系列");
      expect(prompt).toContain("随机选择一场具体战争或战役");
      expect(prompt).toContain("中国历史");
      expect(prompt).toContain("参战方及各自目标");
      expect(prompt).toContain("关键阶段与转折");
      expect(prompt).toContain("严格区分战争、战役和战斗层级");
      expect(prompt).toContain("兵力、伤亡、路线、日期");
      expect(prompt).toContain("不得美化战争");
      expect(prompt).toContain("地理、后勤、兵力、制度、联盟、情报和决策");
      expect(prompt).toContain("3:4竖版构图");
      expect(prompt).toContain("禁止横版、横向画幅、宽幅或方形画幅");
      expectSharedEditorialContract(prompt);

      return JSON.stringify(createWarPayload());
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        localDate: "2026-05-07",
        mode: "war"
      }
    });
    restore();

    expect(result.status).toBe("completed");
    expectThreeFourAspectRatio(getPostPayload(result));
    expect(result.summary).toBe("生成“战争”系列：长平之战为何改变战国格局");
    expect(result.notifications?.[0]).toMatchObject({
      kind: "history-post",
      title: "“战争”系列：长平之战为何改变战国格局",
      payload: expect.objectContaining({
        category: "战争",
        topic: "长平之战为何改变战国格局"
      })
    });
    expect(JSON.parse(readFileSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH!, "utf8"))).toEqual({
      entries: [
        expect.objectContaining({
          topic: "长平之战为何改变战国格局",
          series: "war",
          scope: "china",
          generatedCount: 1
        })
      ],
      plannedNextTopics: {
        "generator:war": expect.objectContaining({
          topic: "赤壁之战如何利用水战",
          promisedFromTopic: "长平之战为何改变战国格局",
          scope: "china"
        })
      }
    });
  });

  it("records the promised war topic and requires the next generation to fulfill it", async () => {
    writeFileSync(
      process.env.HISTORY_TOPIC_ARCHIVE_PATH!,
      JSON.stringify({
        entries: [{
          topic: "长平之战为何改变战国格局",
          firstGeneratedAt: "2026-05-06T00:00:00.000Z",
          lastGeneratedAt: "2026-05-06T00:00:00.000Z",
          generatedCount: 1,
          series: "war",
          scope: "china"
        }],
        plannedNextTopics: {
          "generator:war": {
            topic: "坎尼会战的合围为何奏效",
            promisedFromTopic: "长平之战为何改变战国格局",
            plannedAt: "2026-05-06T00:00:00.000Z",
            scope: "world"
          }
        }
      }),
      "utf8"
    );
    let attempts = 0;
    const restore = mockModelRuntimeText((prompt) => {
      attempts += 1;
      expect(prompt).toContain("上期已经公开预告本期主题为「坎尼会战的合围为何奏效」");
      expect(prompt).toContain("本次不得重新随机选题");
      expect(prompt).toContain("topic 必须原样等于「坎尼会战的合围为何奏效」");

      return JSON.stringify(
        attempts === 1
          ? createWarPayload("赤壁之战如何利用水战")
          : createWarPayload("坎尼会战的合围为何奏效")
      );
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "war" }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(getPostPayload(result).topic).toBe("坎尼会战的合围为何奏效");
    expect(JSON.parse(readFileSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH!, "utf8"))).toMatchObject({
      plannedNextTopics: {
        "generator:war": {
          topic: "赤壁之战的火攻为何奏效",
          promisedFromTopic: "坎尼会战的合围为何奏效",
          scope: "china"
        }
      }
    });
  });

  it("uses world history for every fifth successful war-series generation", async () => {
    writeFileSync(
      process.env.HISTORY_TOPIC_ARCHIVE_PATH!,
      JSON.stringify({
        entries: Array.from({ length: 4 }, (_, index) => ({
          topic: `中国历史战争系列${index + 1}`,
          firstGeneratedAt: `2026-05-0${index + 1}T00:00:00.000Z`,
          lastGeneratedAt: `2026-05-0${index + 1}T00:00:00.000Z`,
          generatedCount: 1,
          series: "war",
          scope: "china"
        }))
      }),
      "utf8"
    );
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("世界历史");
      expect(prompt).toContain("中国历史战争系列1");
      expect(prompt).toContain("中国历史战争系列4");

      return JSON.stringify(createWarPayload("坎尼会战为何改写罗马战局"));
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "war" }
    });
    restore();

    expect(result.status).toBe("completed");
    const archive = JSON.parse(readFileSync(process.env.HISTORY_TOPIC_ARCHIVE_PATH!, "utf8"));
    expect(archive.entries.at(-1)).toMatchObject({
      series: "war",
      scope: "world"
    });
  });

  it("accepts a specifically named naval battle in the war series", async () => {
    let attempts = 0;
    const restore = mockModelRuntimeText((prompt) => {
      attempts += 1;
      expect(prompt).toContain("海战");

      return JSON.stringify(createWarPayload("萨拉米斯海战：希腊舰队为何能以少胜多"));
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "war" }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(attempts).toBe(1);
    expect(getPostPayload(result).topic).toBe("萨拉米斯海战：希腊舰队为何能以少胜多");
  });

  it("retries war-series generation when the topic does not name a war or battle", async () => {
    let attempts = 0;
    const restore = mockModelRuntimeText(() => {
      attempts += 1;

      return JSON.stringify(
        attempts === 1
          ? createWarPayload("秦赵为何争夺上党")
          : createWarPayload()
      );
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "war" }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(getPostPayload(result).topic).toContain("之战");
  });

  it("generates a dynasty four-module payload from dynasty metadata", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      expect(prompt).toContain("朝代名称");
      expect(prompt).toContain("王朝兴衰录");
      expect(prompt).toContain("皇帝图鉴");
      expect(prompt).toContain("风云人物");
      expect(prompt).toContain("历史冷知识");
      expect(prompt).toContain("3:4竖版构图");
      expect(prompt).toContain("禁止横版、横向画幅、宽幅或方形画幅");
      expect(prompt).toContain("严格 JSON");
      expect(prompt).toContain("按时间顺序选择 5-8 个真正改变王朝走向的重大事件");
      expect(prompt).toContain("每张卡片聚焦一个事件");
      expect(prompt).toContain("人物只作为事件参与者简要出现");
      expect(prompt).toContain("避免与“皇帝图鉴”和“风云人物”重复");
      expect(prompt).toContain("不要做“前 5 名”“最强几人”等榜单");
      expect(prompt).toContain("人数服从史料和解释质量");
      expect(prompt).toContain("具体行动 → 直接作用对象 → 可观察结果");
      expect(prompt).toContain("李白可以作为盛唐文化表达和后世盛唐想象的代表");
      expect(prompt).toContain("不得说李白改变或决定唐朝命运");
      expect(prompt).toContain("明确区分直接政治影响与间接文化影响");
      expect(prompt).toContain("从朝堂到诗坛：读懂唐朝群像");
      expect(prompt).toContain("代表性人物，不是完整排名");
      expect(prompt).toContain("所有标题最长 20 个字，标点也计入");
      expect(prompt).toContain("xiaohongshuCaption 控制在 200–400 字");
      expect(prompt).toContain("使用自然换行形成漂亮、易读的排版");
      expect(prompt).toContain("3–5 个相关话题标签");
      expect(prompt).toContain("封面单独按“点击型首图”设计");
      expect(prompt).toContain("imageText 必须与 title 完全相同");
      expect(prompt).toContain("画面只允许出现这一处标题文字");
      expect(prompt).toContain("封面配图可以是与标题语义直接相关的历史意象、人物、景色、器物或关键场景");
      expect(prompt).toContain("第一职责是生成与对应 imageText 直接相关且正确的图片知识补充");
      expect(prompt).toContain("禁止只用抽象景色、人物肖像、氛围插画或通用背景承载文字");
      expect(prompt).toContain("不得凭想象新增事实");
      expect(prompt).toContain("若提到文字区域，必须写明需要填充的具体文字");
      expect(prompt).toContain("不设字数或字符数上限");
      expect(prompt).toContain("原样逐字包含完整 imageText");
      expect(prompt).toContain("禁止只生成历史场景或无字插画");
      expect(prompt).toContain("不能只有标题、栏目名、泛化标签或占位词");
      expect(prompt).not.toContain("系统会自行校验长度");

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
    for (const module of getDynastyPayload(result).modules) {
      expectThreeFourAspectRatio(module);
    }
    expect(result.summary).toBe("生成朝代四件套：东汉");
    expect(result.notifications).toEqual([
      expect.objectContaining({
        kind: "history-post",
        persistent: true,
        title: "朝代四件套：东汉",
        payload: expect.objectContaining({
          category: "朝代",
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
              topic: "从朝堂到民间：读懂东汉群像",
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

  it("applies the shared accuracy and interest contract to dynasty generation", async () => {
    const restore = mockModelRuntimeText((prompt) => {
      expectSharedEditorialContract(prompt);

      return JSON.stringify({
        dynasty: "东汉",
        modules: createDynastyModules("东汉")
      });
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        mode: "dynasty",
        dynasty: "东汉"
      }
    });
    restore();

    expect(result.status).toBe("completed");
  });

  it("removes concrete next-issue promises from dynasty batches that cannot auto-fulfill them", async () => {
    let attempts = 0;
    const restore = mockModelRuntimeText(() => {
      attempts += 1;
      const modules = createDynastyModules("东汉");
      if (attempts === 1) {
        modules[0]!.xiaohongshuCaption += "。关注我，下期讲东汉外戚政治";
      }

      return JSON.stringify({ dynasty: "东汉", modules });
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: { mode: "dynasty", dynasty: "东汉" }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(getDynastyPayload(result).modules[0]?.xiaohongshuCaption).not.toContain("下期");
  });

  it("retries dynasty output when the figure module overclaims that every person changed the dynasty", async () => {
    let attempts = 0;
    const restore = mockModelRuntimeText((prompt) => {
      attempts += 1;
      const modules = createDynastyModules("唐朝");

      if (attempts === 1) {
        modules[2] = {
          ...modules[2],
          topic: "决定唐朝命运的12张面孔"
        };
      } else {
        expect(prompt).toContain("标题不得笼统声称所有人物改变或决定王朝命运");
        expectSharedEditorialContract(prompt);
      }

      return JSON.stringify({
        dynasty: "唐朝",
        modules
      });
    });

    const result = await agent.execute({
      ...createRequest(),
      meta: {
        mode: "dynasty",
        dynasty: "唐朝"
      }
    });
    restore();

    expect(result.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(getDynastyPayload(result).modules[2]?.topic).toBe("从朝堂到民间：读懂唐朝群像");
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
