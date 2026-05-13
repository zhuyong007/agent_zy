import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  NewsFeedItem,
  TopicDimensionBucket,
  TopicDimensionDefinition,
  TopicIdea,
  TopicScoreLabel,
  TopicState
} from "@agent-zy/shared-types";

const TOPIC_DIMENSIONS = [
  {
    id: "technology",
    label: "技术",
    description: "拆能力、讲机制、给出落地判断。"
  },
  {
    id: "interesting",
    label: "有趣",
    description: "抓反差、异常点和让人愿意点开的好奇心。"
  },
  {
    id: "story",
    label: "故事",
    description: "强调人物、冲突、转折和叙事推进。"
  }
] as const satisfies readonly TopicDimensionDefinition[];

const ITEMS_PER_DIMENSION = 1;
const HISTORY_LIMIT = 80;

const evergreenSeeds: Record<string, Array<{
  title: string;
  hook: string;
  summary: string;
  angle: string;
  contentDirection: string;
  whyNow: string;
  audience: string;
}>> = {
  technology: [
    {
      title: "普通创作者如何用 AI 搭一个低成本内容流水线",
      hook: "把 AI 从灵感工具变成稳定产能系统。",
      summary: "覆盖选题、资料、脚本、标题和复盘，强调每一步的人机分工。",
      angle: "展示一条从热点到成稿的完整链路。",
      contentDirection: "围绕选题、资料、脚本、标题、复盘五个环节，讲清可复用流程和最容易卡住的节点。",
      whyNow: "内容竞争变快，稳定流程比单次爆款更能提高复利。",
      audience: "AI 自媒体创作者、效率工具用户、知识型观众"
    },
    {
      title: "AI Agent 到底适合替你做什么，不适合做什么",
      hook: "用边界感切入，避免只讲概念或单纯展示炫技。",
      summary: "解释 Agent 在信息整理、流程执行、代码辅助中的价值和失败边界。",
      angle: "用三组任务做对照：可委托、需监督、不能委托。",
      contentDirection: "围绕信息整理、流程执行、代码辅助三个实际问题，拆清 AI Agent 的适用边界。",
      whyNow: "Agent 正在从演示走向日常工具，观众需要判断何时值得使用。",
      audience: "AI 工具用户、产品经理、知识博主"
    }
  ],
  interesting: [
    {
      title: "为什么很多 AI 爆款教程看完还是不会用",
      hook: "反向拆解教程失效原因，天然自带争议和共鸣。",
      summary: "从场景缺失、提示词迷信、缺少反馈闭环三个角度解释学习断点。",
      angle: "用一个失败案例重做成可执行清单。",
      contentDirection: "围绕“看完教程仍不会用”这个反常识问题，拆场景、反馈和任务分解三类误区。",
      whyNow: "AI 教程供给过剩，观众开始需要更高密度的方法论。",
      audience: "对 AI 感兴趣但尚未形成方法的人群"
    },
    {
      title: "AI 工具太多时，普通人应该先学哪三个",
      hook: "把工具清单改成选择框架，降低收藏不行动的问题。",
      summary: "面向刚开始接触 AI 的用户，拆解写作、检索、自动化三个高频场景。",
      angle: "用真实工作流做横向对比：同一个任务分别交给三类工具完成。",
      contentDirection: "围绕写作、检索、自动化三个实际问题，给出普通人选择 AI 工具的判断框架。",
      whyNow: "AI 产品更新太快，用户更需要长期有效的选择标准。",
      audience: "入门用户、泛效率受众"
    }
  ],
  story: [
    {
      title: "AI 会不会替代自媒体，关键不在写作能力",
      hook: "把争议问题转向判断力、品味和分发能力。",
      summary: "讨论 AI 生成内容普及后，创作者仍然稀缺的能力。",
      angle: "对比机器能做的文本生产和人必须负责的选题判断。",
      contentDirection: "围绕同质化焦虑，讲清创作者仍需负责的判断、品味和分发。",
      whyNow: "生成能力趋同后，内容差异会更多来自定位和决策。",
      audience: "内容创作者、品牌操盘手、知识博主"
    },
    {
      title: "从一个普通人的工作日，讲清 AI 为什么开始真正进入桌面",
      hook: "把抽象的‘AI 进入工作流’翻成一个具体人物故事。",
      summary: "用通勤、开会、写文档、收尾复盘四个片段讲一个工作日如何被重排。",
      angle: "用时间轴推进，强调‘以前怎么做、现在怎么做、代价是什么’。",
      contentDirection: "围绕一个工作日的变化，讲清 AI 在个人桌面上的真实接入方式和摩擦。",
      whyNow: "用户已经不满足于概念演示，更在意它如何嵌进真实生活。",
      audience: "职场人、效率受众、泛科技用户"
    }
  ]
};

const MODEL_PATTERNS = [
  /\bGPT-?5(?:\.\d+)?\b/gi,
  /\bGPT-?4(?:\.\d+)?\b/gi,
  /\bGemini\s*\d+(?:\.\d+)?\b/gi,
  /\bClaude(?:\s+[A-Z][\w-]+)?\b/g,
  /\bLlama\s*\d+(?:\.\d+)?\b/gi,
  /\bQwen\s*\d+(?:\.\d+)?\b/gi,
  /\bDeepSeek(?:-[A-Z0-9.]+)?\b/gi,
  /\bSora\b/g,
  /\bDALL-E\b/gi,
  /ChatGPT/gi,
  /通义千问/g,
  /豆包/g,
  /文心一言/g
];

const TECHNOLOGY_KEYWORDS = [
  "代码审查",
  "自动修复",
  "企业知识库",
  "知识库集成",
  "多模态",
  "视频生成",
  "图像生成",
  "语音交互",
  "实时搜索",
  "浏览器自动化",
  "模型路由",
  "智能体",
  "AI Agent",
  "coding agents",
  "Agent",
  "RAG",
  "workflow",
  "automation"
];

function hashText(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function extractModelSignals(text: string): string[] {
  return unique(
    MODEL_PATTERNS.flatMap((pattern) =>
      [...text.matchAll(pattern)].map((match) => match[0])
    )
  ).slice(0, 4);
}

function extractTechnologySignals(text: string): string[] {
  const normalizedText = text.toLowerCase();

  return TECHNOLOGY_KEYWORDS.filter((keyword) =>
    normalizedText.includes(keyword.toLowerCase())
  ).slice(0, 4);
}

function describeSignal(models: string[], technologies: string[]): string {
  const signals = [...models, ...technologies].slice(0, 5);

  return signals.length > 0 ? signals.join(" / ") : "当前 AI 热点";
}

function describeProblem(technologies: string[], item: NewsFeedItem): string {
  const text = `${item.title} ${item.summary}`;

  if (technologies.some((signal) => ["代码审查", "自动修复", "coding agents"].includes(signal))) {
    return "代码审查、自动修复和研发提效";
  }

  if (technologies.some((signal) => ["企业知识库", "知识库集成", "RAG"].includes(signal))) {
    return "企业知识库检索和团队知识复用";
  }

  if (technologies.some((signal) => ["视频生成", "图像生成", "多模态"].includes(signal))) {
    return "内容生产效率和素材表达";
  }

  if (/agent|智能体/i.test(text)) {
    return "把复杂任务拆给 AI Agent 执行";
  }

  return "把 AI 新闻转化成普通人能用的决策建议";
}

function scoreLabel(score: number): TopicScoreLabel {
  if (score >= 82) {
    return "high";
  }

  if (score >= 65) {
    return "medium";
  }

  return "low";
}

function scoreNews(item: NewsFeedItem, index = 0): number {
  const categoryScore =
    item.category === "ai-models" || item.category === "ai-products"
      ? 28
      : item.category === "paper"
        ? 18
        : item.category === "tip"
          ? 16
          : 10;
  const recencyScore = index < 3 ? 24 : index < 10 ? 14 : 6;
  const sourceScore = item.source ? 7 : 0;
  const title = `${item.title} ${item.summary}`.toLowerCase();
  const keywordScore = [
    "ai",
    "agent",
    "model",
    "openai",
    "chatgpt",
    "智能体",
    "模型",
    "自动化"
  ].some((keyword) => title.includes(keyword))
    ? 16
    : 4;

  return Math.min(98, 24 + categoryScore + recencyScore + sourceScore + keywordScore);
}

function normalizeTopicIdea(topic: TopicIdea): TopicIdea {
  return {
    ...topic,
    dimensionId: topic.dimensionId ?? "technology",
    contentDirection: topic.contentDirection ?? topic.angle
  };
}

function toTopicState(topics: Partial<TopicState> | undefined): TopicState {
  const dimensions = topics?.dimensions?.length ? topics.dimensions : [...TOPIC_DIMENSIONS];

  return {
    dimensions,
    current: (topics?.current ?? []).map(normalizeTopicIdea),
    currentByDimension: (topics?.currentByDimension ?? []).map((bucket) => ({
      dimensionId: bucket.dimensionId,
      label: bucket.label,
      description: bucket.description,
      items: (bucket.items ?? []).map(normalizeTopicIdea)
    })),
    history: (topics?.history ?? []).map(normalizeTopicIdea),
    lastGeneratedAt: topics?.lastGeneratedAt ?? null,
    status: topics?.status ?? "idle",
    strategy: "manual-curation",
    lastError: topics?.lastError ?? null
  };
}

function createTechnologyTopic(
  item: NewsFeedItem,
  batchId: string,
  createdAt: string,
  slotIndex: number
): TopicIdea {
  const score = scoreNews(item, slotIndex);
  const sourceLabel = item.source || "现有热点";
  const signalText = `${item.title} ${item.summary}`;
  const models = extractModelSignals(signalText);
  const technologies = extractTechnologySignals(signalText);
  const signalLabel = describeSignal(models, technologies);
  const problem = describeProblem(technologies, item);

  return {
    id: `topic-${hashText(`${batchId}:technology:${item.id}:${slotIndex}`)}`,
    batchId,
    dimensionId: "technology",
    title: `用「${item.title}」讲清 ${signalLabel} 能解决什么问题`,
    hook: `从“${item.summary}”切入，提炼一个观众能马上判断利弊的实际问题。`,
    summary: `适合做成 3-5 分钟短视频或图文：先讲热点发生了什么，再讲相关技术、模型或产品如何解决“${problem}”。`,
    audience:
      item.category === "ai-models" || item.category === "ai-products"
        ? "AI 工具用户、知识博主、效率型创作者"
        : "关注科技趋势的泛 AI 受众",
    angle: "用“为什么现在突然重要”开场，再拆成事实、影响、行动建议三段。",
    contentDirection: `围绕 ${signalLabel}，解决“${problem}”这个实际问题；结构为热点新闻背景、技术或模型能力、可落地场景、避坑建议。`,
    whyNow: `${sourceLabel} 已集中出现 ${signalLabel} 相关信号，适合趁热把新闻转译成可执行判断。`,
    sourceNewsItemIds: [item.id],
    sourceTitles: [item.title],
    score,
    scoreLabel: scoreLabel(score),
    status: "new",
    createdAt
  };
}

function createInterestingTopic(
  item: NewsFeedItem,
  batchId: string,
  createdAt: string,
  slotIndex: number
): TopicIdea {
  const baseScore = scoreNews(item, slotIndex);
  const signalText = `${item.title} ${item.summary}`;
  const models = extractModelSignals(signalText);
  const technologies = extractTechnologySignals(signalText);
  const signalLabel = describeSignal(models, technologies);

  return {
    id: `topic-${hashText(`${batchId}:interesting:${item.id}:${slotIndex}`)}`,
    batchId,
    dimensionId: "interesting",
    title: `为什么「${item.title}」这条消息比看上去更有意思`,
    hook: `不直接复述新闻，而是抓住“${item.summary}”里最反常识的一点。`,
    summary: `适合做成轻解释内容：先抛一个反差问题，再解释 ${signalLabel} 为什么会突然进入大众视野。`,
    audience: "泛科技用户、短视频观众、喜欢新鲜感的内容受众",
    angle: "先给反差，再给类比，最后落到这条消息和普通人的关系。",
    contentDirection: `围绕 ${signalLabel} 的新鲜感、反差感和异常点，讲清它为什么会让人想点开、想转发、想讨论。`,
    whyNow: `这类热点最适合做“为什么突然都在聊”型内容，新闻热度和讨论欲都在窗口期。`,
    sourceNewsItemIds: [item.id],
    sourceTitles: [item.title],
    score: Math.max(62, baseScore - 4),
    scoreLabel: scoreLabel(Math.max(62, baseScore - 4)),
    status: "new",
    createdAt
  };
}

function createStoryTopic(
  item: NewsFeedItem,
  batchId: string,
  createdAt: string,
  slotIndex: number
): TopicIdea {
  const baseScore = scoreNews(item, slotIndex);
  const sourceLabel = item.source || "现有热点";
  const signalText = `${item.title} ${item.summary}`;
  const models = extractModelSignals(signalText);
  const technologies = extractTechnologySignals(signalText);
  const signalLabel = describeSignal(models, technologies);

  return {
    id: `topic-${hashText(`${batchId}:story:${item.id}:${slotIndex}`)}`,
    batchId,
    dimensionId: "story",
    title: `把「${item.title}」讲成一个人物与转折的故事`,
    hook: `不要从概念开始，从“谁遇到了变化、为什么现在非变不可”切进去。`,
    summary: `把 ${sourceLabel} 这条热点改写成叙事型内容：人物处境、旧办法失效、${signalLabel} 带来转折、留下新的代价。`,
    audience: "喜欢故事化表达的知识观众、品牌号、长视频创作者",
    angle: "按人物处境、冲突升级、技术介入、结果反转四拍推进。",
    contentDirection: `围绕 ${signalLabel} 设置清晰叙事线：谁被影响、旧方法为什么不够、变化如何发生、最终带来了什么新秩序。`,
    whyNow: `热点还在发酵期，最适合把零散信息收束成一个更容易记住和传播的故事。`,
    sourceNewsItemIds: [item.id],
    sourceTitles: [item.title],
    score: Math.max(60, baseScore - 2),
    scoreLabel: scoreLabel(Math.max(60, baseScore - 2)),
    status: "new",
    createdAt
  };
}

function createEvergreenTopic(
  dimension: TopicDimensionDefinition,
  batchId: string,
  createdAt: string,
  slotIndex: number
): TopicIdea {
  const seeds = evergreenSeeds[dimension.id] ?? evergreenSeeds.technology;
  const seed = seeds[slotIndex % seeds.length];
  const score = 72 - slotIndex * 3;

  return {
    id: `topic-${hashText(`${batchId}:${dimension.id}:evergreen:${seed.title}:${slotIndex}`)}`,
    batchId,
    dimensionId: dimension.id,
    title: seed.title,
    hook: seed.hook,
    summary: seed.summary,
    audience: seed.audience,
    angle: seed.angle,
    contentDirection: seed.contentDirection,
    whyNow: seed.whyNow,
    sourceNewsItemIds: [],
    sourceTitles: [],
    score,
    scoreLabel: scoreLabel(score),
    status: "new",
    createdAt
  };
}

function createTopicForDimension(
  item: NewsFeedItem,
  dimension: TopicDimensionDefinition,
  batchId: string,
  createdAt: string,
  slotIndex: number
): TopicIdea {
  if (dimension.id === "technology") {
    return createTechnologyTopic(item, batchId, createdAt, slotIndex);
  }

  if (dimension.id === "interesting") {
    return createInterestingTopic(item, batchId, createdAt, slotIndex);
  }

  return createStoryTopic(item, batchId, createdAt, slotIndex);
}

function createDimensionBuckets(
  newsItems: NewsFeedItem[],
  batchId: string,
  createdAt: string
): TopicDimensionBucket[] {
  return TOPIC_DIMENSIONS.map((dimension, dimensionIndex) => {
    const slotIndex = 0;
    const newsItem = newsItems[dimensionIndex] ?? newsItems[0];
    const items = [
      newsItem
        ? createTopicForDimension(newsItem, dimension, batchId, createdAt, slotIndex)
        : createEvergreenTopic(dimension, batchId, createdAt, slotIndex)
    ];

    return {
      dimensionId: dimension.id,
      label: dimension.label,
      description: dimension.description,
      items
    };
  });
}

function generateTopics(request: AgentExecutionRequest): TopicState {
  const requestedAt = request.requestedAt;
  const batchId = `topic-batch-${requestedAt}`;
  const newsItems = [...request.state.news.feed.items]
    .sort((left, right) => scoreNews(right) - scoreNews(left))
    .slice(0, TOPIC_DIMENSIONS.length * ITEMS_PER_DIMENSION);
  const currentByDimension = createDimensionBuckets(newsItems, batchId, requestedAt);
  const current = currentByDimension.flatMap((bucket) => bucket.items);
  const previous = toTopicState(request.state.topics);
  const historyById = new Map<string, TopicIdea>();

  for (const topic of [...current, ...previous.history]) {
    if (!historyById.has(topic.id)) {
      historyById.set(topic.id, topic);
    }
  }

  return {
    dimensions: [...TOPIC_DIMENSIONS],
    current,
    currentByDimension,
    history: [...historyById.values()].slice(0, HISTORY_LIMIT),
    lastGeneratedAt: requestedAt,
    status: "idle",
    strategy: "manual-curation",
    lastError: null
  };
}

export const agent = defineAgent({
  async execute(request): Promise<AgentExecutionResult> {
    const topics = generateTopics(request);
    const firstTopic = topics.currentByDimension[0]?.items[0] ?? topics.current[0];

    return {
      status: "completed",
      summary: `生成 ${topics.current.length} 条多维度 AI 自媒体选题`,
      assistantMessage: `已按技术、有趣、故事三个方向各生成 1 条选题。`,
      notifications: [
        {
          kind: "topic-push",
          title: "AI 自媒体选题已生成",
          body: firstTopic?.title ?? "新的选题批次已生成"
        }
      ],
      domainUpdates: {
        topics
      }
    };
  }
});
