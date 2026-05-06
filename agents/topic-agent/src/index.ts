import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type { NewsItem, TopicIdea, TopicScoreLabel, TopicState } from "@agent-zy/shared-types";

const TOPIC_INTERVAL_MS = 3 * 60 * 60 * 1000;
const CURRENT_TOPIC_LIMIT = 5;
const HISTORY_LIMIT = 80;

const evergreenSeeds = [
  {
    title: "AI 工具太多时，普通人应该先学哪三个",
    hook: "把工具清单改成选择框架，降低收藏不行动的问题。",
    summary: "面向刚开始接触 AI 的用户，拆解写作、检索、自动化三个高频场景。",
    angle: "用真实工作流做横向对比：同一个任务分别交给三类工具完成。",
    contentDirection: "围绕写作、检索、自动化三个实际问题，给出普通人选择 AI 工具的判断框架。",
    whyNow: "AI 产品更新快，用户需要能持续复用的选择标准。"
  },
  {
    title: "AI Agent 到底适合替你做什么，不适合做什么",
    hook: "用边界感切入，避免只讲概念或单纯展示炫技。",
    summary: "解释 Agent 在信息整理、流程执行、代码辅助中的价值和失败边界。",
    angle: "用三组任务做对照：可委托、需监督、不能委托。",
    contentDirection: "围绕信息整理、流程执行、代码辅助三个实际问题，拆清 AI Agent 的适用边界。",
    whyNow: "Agent 正在从演示走向日常工具，观众需要判断何时值得使用。"
  },
  {
    title: "普通创作者如何用 AI 搭一个低成本内容流水线",
    hook: "把 AI 从灵感工具变成稳定产能系统。",
    summary: "覆盖选题、资料、脚本、标题和复盘，强调每一步的人机分工。",
    angle: "展示一条从热点到成稿的完整链路。",
    contentDirection: "围绕从热点到成稿这个实际问题，搭建选题、资料、脚本、标题、复盘的内容流水线。",
    whyNow: "内容竞争变快，稳定流程比单次爆款更能提高复利。"
  },
  {
    title: "为什么很多 AI 爆款教程看完还是不会用",
    hook: "反向拆解教程失效原因，容易引发共鸣。",
    summary: "从场景缺失、提示词迷信、缺少反馈闭环三个角度解释学习断点。",
    angle: "用一个失败案例重做成可执行清单。",
    contentDirection: "围绕看完教程仍不会用这个实际问题，拆解场景、提示词、反馈闭环三类断点。",
    whyNow: "AI 教程供给过剩，观众开始需要更高密度的方法论。"
  },
  {
    title: "AI 会不会替代自媒体，关键不在写作能力",
    hook: "把争议问题转向判断力、品味和分发能力。",
    summary: "讨论 AI 生成内容普及后，创作者仍然稀缺的能力。",
    angle: "对比机器能做的文本生产和人必须负责的选题判断。",
    contentDirection: "围绕 AI 生成内容同质化这个实际问题，讲清创作者仍需负责的判断、品味和分发。",
    whyNow: "生成能力趋同后，内容差异会更多来自定位和决策。"
  }
];

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

function normalizeTopicIdea(topic: TopicIdea): TopicIdea {
  return {
    ...topic,
    contentDirection: topic.contentDirection ?? topic.angle
  };
}

function toTopicState(topics: Partial<TopicState> | undefined): TopicState {
  return {
    current: (topics?.current ?? []).map(normalizeTopicIdea),
    history: (topics?.history ?? []).map(normalizeTopicIdea),
    lastGeneratedAt: topics?.lastGeneratedAt ?? null,
    nextRunAt: topics?.nextRunAt ?? null,
    status: topics?.status ?? "idle",
    strategy: "news-to-content",
    lastError: topics?.lastError ?? null
  };
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

function describeProblem(technologies: string[], item: NewsItem): string {
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

function scoreNews(item: NewsItem): number {
  const categoryScore = item.category === "ai" ? 28 : item.category === "technology" ? 16 : 6;
  const importanceScore = item.importance === "high" ? 24 : item.importance === "medium" ? 14 : 6;
  const sourceScore = Math.min(item.sourceCount, 4) * 7;
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

  return Math.min(98, 24 + categoryScore + importanceScore + sourceScore + keywordScore);
}

function createNewsTopic(item: NewsItem, batchId: string, createdAt: string, index: number): TopicIdea {
  const score = scoreNews(item);
  const sourceLabel = item.sources.slice(0, 3).join(" / ") || "现有热点";
  const signalText = `${item.title} ${item.summary}`;
  const models = extractModelSignals(signalText);
  const technologies = extractTechnologySignals(signalText);
  const signalLabel = describeSignal(models, technologies);
  const problem = describeProblem(technologies, item);
  const angle = item.importance === "high"
    ? "用“为什么现在突然重要”开场，再拆成事实、影响、行动建议三段。"
    : "用一个具体使用场景开场，再补充趋势解释和避坑提醒。";

  return {
    id: `topic-${hashText(`${batchId}:${item.id}:${index}`)}`,
    batchId,
    title: `用「${item.title}」讲清 ${signalLabel} 能解决什么问题`,
    hook: `从“${item.summary}”切入，提炼一个观众能马上判断利弊的实际问题。`,
    summary: `适合做成 3-5 分钟短视频或图文：先讲热点新闻发生了什么，再讲相关技术、模型或产品如何解决“${problem}”。`,
    audience: item.category === "ai" ? "AI 工具用户、知识博主、效率型创作者" : "关注科技趋势的泛 AI 受众",
    angle,
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

function createEvergreenTopic(
  seed: (typeof evergreenSeeds)[number],
  batchId: string,
  createdAt: string,
  index: number
): TopicIdea {
  const score = 68 - index * 2;

  return {
    id: `topic-${hashText(`${batchId}:evergreen:${seed.title}:${index}`)}`,
    batchId,
    title: seed.title,
    hook: seed.hook,
    summary: seed.summary,
    audience: "AI 自媒体创作者、效率工具用户、知识型观众",
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

function generateTopics(request: AgentExecutionRequest): TopicState {
  const requestedAt = request.requestedAt;
  const batchId = `topic-batch-${requestedAt}`;
  const newsItems = [...request.state.news.items]
    .sort((left, right) => scoreNews(right) - scoreNews(left))
    .slice(0, CURRENT_TOPIC_LIMIT);
  const generated: TopicIdea[] = newsItems.map((item, index) =>
    createNewsTopic(item, batchId, requestedAt, index)
  );

  for (let index = 0; generated.length < CURRENT_TOPIC_LIMIT; index += 1) {
    const seed = evergreenSeeds[index % evergreenSeeds.length];
    generated.push(createEvergreenTopic(seed, batchId, requestedAt, generated.length));
  }

  const previous = toTopicState(request.state.topics);
  const historyById = new Map<string, TopicIdea>();

  for (const topic of [...generated, ...previous.history]) {
    if (!historyById.has(topic.id)) {
      historyById.set(topic.id, topic);
    }
  }

  return {
    current: generated,
    history: [...historyById.values()].slice(0, HISTORY_LIMIT),
    lastGeneratedAt: requestedAt,
    nextRunAt: new Date(new Date(requestedAt).getTime() + TOPIC_INTERVAL_MS).toISOString(),
    status: "idle",
    strategy: "news-to-content",
    lastError: null
  };
}

export const agent = defineAgent({
  async execute(request): Promise<AgentExecutionResult> {
    const topics = generateTopics(request);

    return {
      status: "completed",
      summary: `生成 ${topics.current.length} 条 AI 自媒体选题`,
      assistantMessage: `已推送 ${topics.current.length} 条 AI 自媒体选题，下一次计划在 ${topics.nextRunAt ?? "--"} 运行。`,
      notifications: [
        {
          kind: "topic-push",
          title: "AI 自媒体选题已更新",
          body: topics.current[0]?.title ?? "新的选题批次已生成"
        }
      ],
      domainUpdates: {
        topics
      }
    };
  }
});
