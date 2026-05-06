import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type { HistoryPostCard, HistoryPostPayload } from "@agent-zy/shared-types";

const HISTORY_TOPICS = [
  "玄奘取经为什么重要",
  "张骞出使西域如何改变丝绸之路",
  "活字印刷术如何重塑知识传播",
  "郑和下西洋真正留下了什么",
  "罗马道路为什么能支撑帝国治理",
  "文艺复兴为什么从意大利兴起",
  "工业革命怎样改变普通人的一天",
  "玛雅历法为什么如此精密",
  "大运河如何连接中国南北经济",
  "拿破仑法典为什么影响至今",
  "敦煌藏经洞如何保存千年文明切片",
  "阿拉伯学者如何保存并发展古希腊知识"
];

function hashText(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function selectTopic(localDate: string): string {
  return HISTORY_TOPICS[hashText(`history:${localDate}`) % HISTORY_TOPICS.length];
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    const arrayMatch = value.match(/\[[\s\S]*\]/);
    const objectMatch = value.match(/\{[\s\S]*\}/);
    const fallback = objectMatch?.[0] ?? arrayMatch?.[0];

    if (!fallback) {
      return null;
    }

    try {
      return JSON.parse(fallback);
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateCard(value: unknown): HistoryPostCard | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const title = asString(record.title);
  const imageText = asString(record.imageText);
  const prompt = asString(record.prompt);

  if (!title || !imageText || !prompt) {
    return null;
  }

  return {
    title,
    imageText,
    prompt
  };
}

function validatePayload(value: unknown, generatedAt: string): HistoryPostPayload {
  const record = asRecord(value);

  if (!record) {
    throw new Error("ModelScope 输出不是 JSON 对象");
  }

  const topic = asString(record.topic);
  const summary = asString(record.summary);
  const xiaohongshuCaption = asString(record.xiaohongshuCaption);
  const cards = Array.isArray(record.cards)
    ? record.cards.map(validateCard).filter((card): card is HistoryPostCard => card !== null)
    : [];
  const cardCount =
    typeof record.cardCount === "number" && Number.isInteger(record.cardCount)
      ? record.cardCount
      : cards.length;

  if (!topic || !summary || !xiaohongshuCaption) {
    throw new Error("ModelScope 输出缺少 topic、summary 或 xiaohongshuCaption");
  }

  if (cardCount < 1 || cardCount > 5 || cards.length !== cardCount) {
    throw new Error("历史推文图片数量必须是 1 到 5 张，并且 cards 数量要匹配");
  }

  return {
    topic,
    summary,
    cardCount,
    cards,
    xiaohongshuCaption,
    generatedAt
  };
}

function extractModelContent(value: unknown): string | null {
  const record = asRecord(value);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);

  return asString(message?.content) ?? asString(firstChoice?.text);
}

async function generateWithModelScope(topic: string, requestedAt: string): Promise<HistoryPostPayload> {
  const apiKey = process.env.MODELSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error("MODELSCOPE_API_KEY 未配置");
  }

  const baseUrl = process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1";
  const model = process.env.MODELSCOPE_MODEL ?? "MiniMax/MiniMax-M2.7";
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是中文历史知识编辑，擅长把历史知识点拆成小红书图文策划。只输出严格 JSON 对象，不要输出 Markdown。"
        },
        {
          role: "user",
          content: `请围绕「${topic}」生成一条小红书历史知识推文策划。字段必须是 topic、summary、cardCount、cards、xiaohongshuCaption。cards 最多 5 张，每张包含 title、imageText、prompt；imageText 是图片内要放的中文文字，prompt 是中文生图提示词。`
        }
      ]
    })
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`ModelScope 请求失败：HTTP ${response.status}`);
  }

  const content = extractModelContent(parseJson(responseText));

  if (!content) {
    throw new Error("ModelScope 返回内容为空");
  }

  return validatePayload(parseJson(content), requestedAt);
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const localDate = asString(input.meta?.localDate) ?? input.requestedAt.slice(0, 10);
    const topic = asString(input.meta?.topic) ?? selectTopic(localDate);

    try {
      const payload = await generateWithModelScope(topic, input.requestedAt);

      return {
        status: "completed",
        summary: `生成历史知识点：${payload.topic}`,
        assistantMessage: `已生成今日历史知识点小红书策划：${payload.topic}`,
        notifications: [
          {
            kind: "history-post",
            title: `每日历史知识点：${payload.topic}`,
            body: payload.summary,
            persistent: true,
            payload
          }
        ],
        domainUpdates: {
          historyPush: {
            lastTriggeredDate: localDate
          }
        }
      };
    } catch (error) {
      return {
        status: "failed",
        summary: error instanceof Error ? error.message : "历史知识点生成失败",
        assistantMessage: "历史知识点生成失败，请检查 ModelScope 配置或稍后重试。"
      };
    }
  }
});

export default agent;
