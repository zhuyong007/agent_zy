import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type { HistoryPostCard, HistoryPostPayload } from "@agent-zy/shared-types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

interface HistoryTopicArchiveEntry {
  topic: string;
  firstGeneratedAt: string;
  lastGeneratedAt: string;
  generatedCount: number;
}

interface HistoryTopicArchive {
  entries: HistoryTopicArchiveEntry[];
}

function getTopicArchivePath(): string {
  return process.env.HISTORY_TOPIC_ARCHIVE_PATH ?? resolve(process.cwd(), "data/history/topic-archive.json");
}

function parseArchive(value: string): HistoryTopicArchive {
  const parsed = parseJson(value);
  const record = asRecord(parsed);
  const entries = Array.isArray(record?.entries) ? record.entries : [];

  return {
    entries: entries
      .map((entry) => {
        const item = asRecord(entry);
        const topic = asString(item?.topic);
        const firstGeneratedAt = asString(item?.firstGeneratedAt);
        const lastGeneratedAt = asString(item?.lastGeneratedAt);
        const generatedCount =
          typeof item?.generatedCount === "number" && Number.isInteger(item.generatedCount)
            ? item.generatedCount
            : 0;

        if (!topic || !firstGeneratedAt || !lastGeneratedAt || generatedCount < 1) {
          return null;
        }

        return {
          topic,
          firstGeneratedAt,
          lastGeneratedAt,
          generatedCount
        };
      })
      .filter((entry): entry is HistoryTopicArchiveEntry => entry !== null)
  };
}

function loadTopicArchive(path: string): HistoryTopicArchive {
  if (!existsSync(path)) {
    return { entries: [] };
  }

  try {
    return parseArchive(readFileSync(path, "utf8"));
  } catch (error) {
    console.error("[history-agent] archive:read-failed", {
      path,
      error: error instanceof Error ? error.message : String(error)
    });
    return { entries: [] };
  }
}

function writeTopicArchive(path: string, archive: HistoryTopicArchive) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(archive, null, 2), "utf8");
}

function selectTopic(localDate: string, archive: HistoryTopicArchive): string {
  const usedTopics = new Set(archive.entries.map((entry) => entry.topic));
  const dateSeedTopic = HISTORY_TOPICS[hashText(`history:${localDate}`) % HISTORY_TOPICS.length];

  if (!usedTopics.has(dateSeedTopic)) {
    return dateSeedTopic;
  }

  const unusedTopics = HISTORY_TOPICS.filter((topic) => !usedTopics.has(topic));

  if (unusedTopics.length > 0) {
    return unusedTopics[0];
  }

  const oldestEntry = [...archive.entries]
    .filter((entry) => HISTORY_TOPICS.includes(entry.topic))
    .sort((left, right) => left.lastGeneratedAt.localeCompare(right.lastGeneratedAt))[0];

  return oldestEntry?.topic ?? dateSeedTopic;
}

function recordGeneratedTopic(
  archive: HistoryTopicArchive,
  topic: string,
  generatedAt: string
): HistoryTopicArchive {
  const existingEntry = archive.entries.find((entry) => entry.topic === topic);

  if (existingEntry) {
    return {
      entries: archive.entries.map((entry) =>
        entry.topic === topic
          ? {
              ...entry,
              lastGeneratedAt: generatedAt,
              generatedCount: entry.generatedCount + 1
            }
          : entry
      )
    };
  }

  return {
    entries: [
      ...archive.entries,
      {
        topic,
        firstGeneratedAt: generatedAt,
        lastGeneratedAt: generatedAt,
        generatedCount: 1
      }
    ]
  };
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

function hasPayloadShape(value: unknown): boolean {
  const record = asRecord(value);

  return Boolean(record?.topic || record?.summary || record?.cards || record?.xiaohongshuCaption);
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
  const normalizedValue =
    Array.isArray(value) && value.length === 1 && hasPayloadShape(value[0]) ? value[0] : value;
  const record = asRecord(normalizedValue);

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

function extractTextContent(value: unknown): string | null {
  const direct = asString(value);

  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => {
        const record = asRecord(item);
        return asString(record?.text) ?? asString(record?.content);
      })
      .filter((item): item is string => Boolean(item))
      .join("\n");

    return joined || null;
  }

  const record = asRecord(value);

  return asString(record?.text) ?? asString(record?.content);
}

function extractModelContent(value: unknown): unknown {
  const record = asRecord(value);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);

  return message?.content ?? firstChoice?.text ?? null;
}

function getModelScopeErrorMessage(responseText: string): string {
  const parsed = asRecord(parseJson(responseText));
  const error = asRecord(parsed?.error);
  const detail =
    asString(error?.message) ??
    asString(parsed?.message) ??
    asString(parsed?.error) ??
    responseText.trim();

  return detail ? detail.slice(0, 500) : "响应体为空";
}

function normalizePayloadInput(value: unknown): unknown {
  if (hasPayloadShape(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parseJson(value);

    return parsed ?? value;
  }

  if (Array.isArray(value)) {
    const payloadCandidate = value.find(hasPayloadShape);

    if (payloadCandidate) {
      return payloadCandidate;
    }

    const text = extractTextContent(value);

    if (text) {
      const parsed = parseJson(text);

      return parsed ?? text;
    }
  }

  const text = extractTextContent(value);

  if (text) {
    const parsed = parseJson(text);

    return parsed ?? text;
  }

  return value;
}

async function generateWithModelScope(topic: string, requestedAt: string): Promise<HistoryPostPayload> {
  const fixture = process.env.HISTORY_POST_FIXTURE_JSON;

  if (fixture) {
    return validatePayload(parseJson(fixture), requestedAt);
  }

  const apiKey = process.env.MODELSCOPE_API_KEY;

  if (!apiKey) {
    throw new Error("MODELSCOPE_API_KEY 未配置");
  }

  const baseUrl = process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1";
  const model = process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B";
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  console.info("[history-agent] modelscope:request", {
    endpoint,
    model
  });
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
    throw new Error(`ModelScope 请求失败：HTTP ${response.status}，${getModelScopeErrorMessage(responseText)}`);
  }

  const modelResponse = parseJson(responseText);
  const rawContent = extractModelContent(modelResponse);
  const normalizedPayloadInput = normalizePayloadInput(rawContent);

  console.info("[history-agent] modelscope:response-shape", {
    rawContentType: Array.isArray(rawContent) ? "array" : typeof rawContent,
    normalizedType: Array.isArray(normalizedPayloadInput) ? "array" : typeof normalizedPayloadInput,
    preview:
      typeof rawContent === "string"
        ? rawContent.slice(0, 200)
        : JSON.stringify(normalizedPayloadInput)?.slice(0, 200) ?? null
  });

  if (!rawContent) {
    throw new Error("ModelScope 返回内容为空");
  }

  return validatePayload(normalizedPayloadInput, requestedAt);
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const localDate = asString(input.meta?.localDate) ?? input.requestedAt.slice(0, 10);
    const archivePath = getTopicArchivePath();
    const archive = loadTopicArchive(archivePath);
    const topic = asString(input.meta?.topic) ?? selectTopic(localDate, archive);

    console.info("[history-agent] execute:start", {
      taskId: input.taskId,
      trigger: input.trigger,
      localDate,
      topic,
      hasModelScopeApiKey: Boolean(process.env.MODELSCOPE_API_KEY),
      hasFixture: Boolean(process.env.HISTORY_POST_FIXTURE_JSON)
    });

    try {
      const payload = await generateWithModelScope(topic, input.requestedAt);
      const nextArchive = recordGeneratedTopic(archive, payload.topic, input.requestedAt);
      writeTopicArchive(archivePath, nextArchive);

      console.info("[history-agent] execute:success", {
        taskId: input.taskId,
        topic: payload.topic,
        cardCount: payload.cardCount
      });

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
      console.error("[history-agent] execute:failed", {
        taskId: input.taskId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: "failed",
        summary: error instanceof Error ? error.message : "历史知识点生成失败",
        assistantMessage: "历史知识点生成失败，请检查 ModelScope 配置或稍后重试。"
      };
    }
  }
});

export default agent;
