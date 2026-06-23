import { defineAgent, getModelClient, normalizeModelOutput, parseModelJson } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  HistoryDynastyModule,
  HistoryDynastyModuleType,
  HistoryDynastyPayload,
  HistoryPostCard,
  HistoryPostCover,
  HistoryPostPayload
} from "@agent-zy/shared-types";
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

const MIN_HISTORY_CARD_COUNT = 3;
const MAX_HISTORY_CARD_COUNT = 10;
const MAX_HISTORY_TITLE_LENGTH = 20;
const DYNASTY_MODULE_TYPES: HistoryDynastyModuleType[] = [
  "王朝兴衰录",
  "皇帝图鉴",
  "风云人物",
  "历史冷知识"
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
  return process.env.HISTORY_TOPIC_ARCHIVE_PATH ?? resolve(
    process.env.AGENT_ZY_DATA_DIR ?? ".agent-zy-data",
    "history/topic-archive.json"
  );
}

function parseArchive(value: string): HistoryTopicArchive {
  const parsed = parseModelJson(value);
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

function getHistoryNotificationTopics(state: AgentExecutionRequest["state"]): string[] {
  return state.notifications
    .filter((notification) => notification.kind === "history-post")
    .flatMap((notification) => {
      const payloadTopic = getHistoryPayloadTopic(notification.payload);
      const titleTopic = asString(notification.title)?.replace(/^每日历史知识点[:：]/, "").trim();

      return [payloadTopic, titleTopic].filter((topic): topic is string => Boolean(topic));
    });
}

function selectTopic(
  localDate: string,
  archive: HistoryTopicArchive,
  existingTopics: string[] = []
): string {
  const usedTopics = new Set([...archive.entries.map((entry) => entry.topic), ...existingTopics]);
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getHistoryPayloadTopic(value: unknown): string | null {
  const record = asRecord(value);

  return asString(record?.topic);
}

function hasPayloadShape(value: unknown): boolean {
  const record = asRecord(value);

  return Boolean(record?.topic || record?.summary || record?.cards || record?.xiaohongshuCaption);
}

function hasDynastyPayloadShape(value: unknown): boolean {
  const record = asRecord(value);

  return Boolean(record?.dynasty || record?.modules);
}

function countChineseCharacters(value: string): number {
  return Array.from(value.matchAll(/[\u3400-\u9fff]/gu)).length;
}

function trimToChineseCharacterLimit(value: string, maxLength: number): string {
  let chineseCharacterCount = 0;
  let result = "";

  for (const character of Array.from(value)) {
    if (/[\u3400-\u9fff]/u.test(character)) {
      chineseCharacterCount += 1;
    }

    if (chineseCharacterCount > maxLength) {
      break;
    }

    result += character;
  }

  return result.trim();
}

function trimToCharacterLimit(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("").trim();
}

function removePromptLengthNotes(prompt: string): string {
  return prompt
    .replace(/[，,。；;\s]*(?:约|大约|控制在|保持在|不少于|不超过|限制在|长度为)?\s*\d+\s*(?:到|-|~|至)\s*\d+\s*(?:个)?(?:中文)?(?:字|字符)/gu, "")
    .replace(/[，,。；;\s]*(?:约|大约|控制在|保持在|不少于|不超过|限制在|长度为)?\s*\d+\s*(?:个)?(?:中文)?(?:字|字符)/gu, "")
    .replace(/[，,。；;\s]*(?:字数|字符数|长度)\s*(?:要求|限制|控制)?\s*[:：]?\s*\d+\s*(?:到|-|~|至)?\s*\d*\s*(?:个)?(?:中文)?(?:字|字符)?/gu, "")
    .trim();
}

function repairImagePrompt(prompt: string): string {
  const filler =
    "。图片描述：竖版小红书历史知识卡片，主体清晰居中，时代场景准确，构图稳定，光线柔和，色彩克制，材质细腻。图片中应该以文字类型展示相关背景、关键人物、影响意义等具体知识内容";
  let repaired = removePromptLengthNotes(prompt);

  while (countChineseCharacters(repaired) < 100) {
    repaired += filler;
  }

  return trimToChineseCharacterLimit(repaired, 200);
}

function validateCard(value: unknown): HistoryPostCard | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const title = asString(record.title);
  const imageText = asString(record.imageText);
  const rawPrompt = asString(record.prompt);

  if (!title || !imageText || !rawPrompt) {
    return null;
  }

  const prompt = repairImagePrompt(rawPrompt);
  const promptLength = countChineseCharacters(prompt);

  if (promptLength < 100 || promptLength > 200) {
    throw new Error("每张图的生图提示词必须是100到200个中文字符");
  }

  return {
    title: trimToCharacterLimit(title, MAX_HISTORY_TITLE_LENGTH),
    imageText,
    prompt
  };
}

function validateCover(value: unknown): HistoryPostCover | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const title = asString(record.title);
  const subtitle = asString(record.subtitle);
  const imageText = asString(record.imageText);
  const rawPrompt = asString(record.prompt);

  if (!title || !subtitle || !imageText || !rawPrompt) {
    return null;
  }

  return {
    title: trimToCharacterLimit(title, MAX_HISTORY_TITLE_LENGTH),
    subtitle,
    imageText,
    prompt: repairImagePrompt(rawPrompt)
  };
}

function buildFallbackCover(topic: string, summary: string, cards: HistoryPostCard[]): HistoryPostCover {
  const firstCard = cards[0];
  const subtitle = trimToChineseCharacterLimit(summary, 28);
  const imageTextParts = [topic, subtitle, firstCard?.imageText].filter(Boolean);
  const basePrompt = [
    `${topic}，竖版小红书历史知识首图封面，强标题层级，主体清晰居中，时代场景准确`,
    "背景包含地图、书卷、建筑纹样与柔和光线，暖金与青灰配色，画面上方预留醒目中文标题区域",
    "中部留出副标题和知识标签，下方保留简短解释文字空间，文字留白清晰，可读性强，适合信息流首屏点击",
    firstCard?.prompt
  ]
    .filter(Boolean)
    .join("。");

  return {
    title: topic,
    subtitle,
    imageText: imageTextParts.join("\n"),
    prompt: repairImagePrompt(basePrompt)
  };
}

function validatePayload(value: unknown, generatedAt: string): HistoryPostPayload {
  const normalizedValue =
    Array.isArray(value) && value.length === 1 && hasPayloadShape(value[0]) ? value[0] : value;
  const record = asRecord(normalizedValue);

  if (!record) {
    throw new Error("模型输出不是 JSON 对象");
  }

  const rawTopic = asString(record.topic);
  const summary = asString(record.summary);
  const xiaohongshuCaption = asString(record.xiaohongshuCaption);
  const cards = Array.isArray(record.cards)
    ? record.cards.map(validateCard).filter((card): card is HistoryPostCard => card !== null)
    : [];
  const cardCount =
    typeof record.cardCount === "number" && Number.isInteger(record.cardCount)
      ? record.cardCount
      : cards.length;

  if (!rawTopic || !summary || !xiaohongshuCaption) {
    throw new Error("模型输出缺少 topic、summary 或 xiaohongshuCaption");
  }

  const topic = trimToCharacterLimit(rawTopic, MAX_HISTORY_TITLE_LENGTH);

  if (
    cardCount < MIN_HISTORY_CARD_COUNT ||
    cardCount > MAX_HISTORY_CARD_COUNT ||
    cards.length !== cardCount
  ) {
    throw new Error("历史推文图片数量必须是 3 到 10 张，并且 cards 数量要匹配");
  }

  const cover = validateCover(record.cover) ?? buildFallbackCover(topic, summary, cards);

  return {
    topic,
    summary,
    cover,
    cardCount,
    cards,
    xiaohongshuCaption,
    generatedAt
  };
}

function validateDynastyModule(value: unknown, index: number, generatedAt: string): HistoryDynastyModule {
  const record = asRecord(value);

  if (!record) {
    throw new Error("朝代四件套模块必须是 JSON 对象");
  }

  const expectedType = DYNASTY_MODULE_TYPES[index];
  const type = asString(record.type);

  if (type !== expectedType) {
    throw new Error(`朝代四件套模块顺序必须是：${DYNASTY_MODULE_TYPES.join("、")}`);
  }

  const payload = validatePayload(record, generatedAt);

  return {
    type: expectedType,
    ...payload
  };
}

function validateDynastyPayload(value: unknown, generatedAt: string): HistoryDynastyPayload {
  const normalizedValue =
    Array.isArray(value) && value.length === 1 && hasDynastyPayloadShape(value[0]) ? value[0] : value;
  const record = asRecord(normalizedValue);

  if (!record) {
    throw new Error("模型输出不是 JSON 对象");
  }

  const dynasty = asString(record.dynasty);
  const modules = Array.isArray(record.modules) ? record.modules : [];

  if (!dynasty) {
    throw new Error("朝代四件套输出缺少 dynasty");
  }

  if (modules.length !== DYNASTY_MODULE_TYPES.length) {
    throw new Error("朝代四件套必须包含 4 个固定模块");
  }

  return {
    dynasty,
    modules: modules.map((module, index) => validateDynastyModule(module, index, generatedAt))
  };
}

function normalizePayloadInput(value: unknown): unknown {
  const normalized = normalizeModelOutput(value);

  if (hasPayloadShape(normalized)) {
    return normalized;
  }

  if (Array.isArray(normalized)) {
    const payloadCandidate = normalized.find(hasPayloadShape);

    if (payloadCandidate) {
      return payloadCandidate;
    }
  }

  return normalized;
}

function normalizeDynastyPayloadInput(value: unknown): unknown {
  const normalized = normalizeModelOutput(value);

  if (hasDynastyPayloadShape(normalized)) {
    return normalized;
  }

  if (Array.isArray(normalized)) {
    const payloadCandidate = normalized.find(hasDynastyPayloadShape);

    if (payloadCandidate) {
      return payloadCandidate;
    }
  }

  return normalized;
}

function buildHistoryXhsAnalyticsPrompt(state: AgentExecutionRequest["state"]): string {
  const posts = state.historyXhs?.posts ?? [];

  if (posts.length === 0) {
    return "";
  }

  const overview = state.historyXhs?.overview;
  const topPostLines = [...posts]
    .sort((left, right) => {
      const leftScore = left.views + left.likes * 8 + left.collects * 10 + left.comments * 12 + left.shares * 16;
      const rightScore = right.views + right.likes * 8 + right.collects * 10 + right.comments * 12 + right.shares * 16;

      return rightScore - leftScore;
    })
    .slice(0, 5)
    .map(
      (post, index) =>
        `${index + 1}. ${post.title}：浏览${post.views}，点赞${post.likes}，收藏${post.collects}，评论${post.comments}，分享${post.shares}`
    )
    .join("\n");

  return `\n小红书真实发布数据参考：已同步作品 ${overview?.postCount ?? posts.length} 篇，总浏览 ${overview?.totalViews ?? 0}，总点赞 ${overview?.totalLikes ?? 0}，总收藏 ${overview?.totalCollects ?? 0}，总评论 ${overview?.totalComments ?? 0}，总分享 ${overview?.totalShares ?? 0}。\n表现较好的作品：\n${topPostLines}\n请先自行判断样本量和数据质量是否足够；如果足够，再参考真实数据调整选题角度、标题钩子、卡片节奏和正文表达；如果不足，只把这些数据作为轻量背景，不要机械迎合单个作品。`;
}

async function generateWithModelRuntime(
  topic: string,
  requestedAt: string,
  analyticsPrompt: string
): Promise<HistoryPostPayload> {
  const fixture = process.env.HISTORY_POST_FIXTURE_JSON;

  if (fixture) {
    return validatePayload(parseModelJson(fixture), requestedAt);
  }

  console.info("[history-agent] model-runtime:request", {
    purpose: "vision"
  });
  const prompt = `请围绕「${topic}」生成一条小红书历史知识推文策划。严格按 topic、summary、xiaohongshuCaption、cover、cardCount、cards 的顺序输出字段。topic、cover.title 和 cards[].title 都属于标题，所有标题最长 20 个字，标点也计入。xiaohongshuCaption 控制在 200–400 字，写成可直接发布的小红书正文：开头用问题、反差或结论制造钩子，中间用短段落和醒目的重点符号梳理知识，使用自然换行形成漂亮、易读的排版，结尾加入互动提问，并附上 3–5 个相关话题标签；表达有节奏、有分享感，但必须尊重史实，不使用 Markdown 标题语法。cover 是小红书首图封面方案，必须包含 title、subtitle、imageText、prompt；cover.prompt 是中文封面生图提示词，需要强调竖版小红书首图封面、强标题层级、历史知识感、准确时代氛围、中文文字留白和可读性。cards 根据内容判断需要多少张，下限 3 张，上限 10 张，每张包含 title、imageText、prompt；imageText 是图片内要放的中文文字；prompt 是中文生图提示词，保持中等长度，系统会自行校验长度，不要把字数、字符数或类似“xx字”的说明写进 prompt 字段。prompt 需要说明两类信息：第一类是图片描述，具体描述主体、时代场景、构图、光线、色彩、材质、文字留白和小红书知识卡片风格；第二类是图片中应该以文字类型展示哪些具体知识，例如背景、人物、路线、制度、影响、时间线或关键对比。凡是提到文字留白或预留区域，不能只写“留出空白位置以用于某种内容”，必须同步明确空白部分需要填充的具体文字内容，例如具体标题、副标题、知识标签、时间节点或解释文字。`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await getModelClient().generateText({
      purpose: "vision",
      maxTokens: 9000,
      timeoutMs: 600_000,
      responseFormat: "json",
      systemPrompt: analyticsPrompt
        ? `中文历史知识编辑，只输出严格 JSON，不要输出 Markdown。${analyticsPrompt}`
        :
        "你是中文历史知识编辑，擅长把历史知识点拆成小红书图文策划。只输出严格 JSON 对象，不要输出 Markdown。",
      prompt:
        attempt === 0
          ? prompt
          : `${prompt}\n上一次输出不完整。请重新生成完整 JSON，保持内容紧凑，必须返回全部字段和完整 cards 数组，不要输出解释。`
    });
    const rawContent = result.text;
    const normalizedPayloadInput = normalizePayloadInput(rawContent);

    console.info("[history-agent] model-runtime:response-shape", {
      attempt: attempt + 1,
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

    try {
      return validatePayload(normalizedPayloadInput, requestedAt);
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }

      console.warn("[history-agent] model-runtime:retry-incomplete-json", {
        error: error instanceof Error ? error.message : "模型输出校验失败"
      });
    }
  }

  throw new Error("模型输出校验失败");
}

async function generateDynastyWithModelRuntime(dynasty: string, requestedAt: string): Promise<HistoryDynastyPayload> {
  const fixture = process.env.HISTORY_POST_FIXTURE_JSON;

  if (fixture) {
    return validateDynastyPayload(parseModelJson(fixture), requestedAt);
  }

  console.info("[history-agent] model-runtime:request", {
    purpose: "vision",
    mode: "dynasty"
  });
  const prompt = `请围绕朝代名称「${dynasty}」生成 4 套可直接发布的小红书历史图文策划。只输出严格 JSON 对象，不要输出 Markdown。JSON 必须是 {"dynasty":"${dynasty}","modules":[...]}，modules 必须按固定顺序包含 4 个模块：王朝兴衰录、皇帝图鉴、风云人物、历史冷知识。每个模块都必须像单独执行一次“主题模式”那样完整输出，字段必须是 type、topic、summary、cover、cardCount、cards、xiaohongshuCaption。

每个模块的 topic、cover.title 和 cards[].title 都属于标题，所有标题最长 20 个字，标点也计入。

每个模块的 xiaohongshuCaption 控制在 200–400 字，写成可直接发布的小红书正文：开头用问题、反差或结论制造钩子，中间用短段落和醒目的重点符号梳理知识，使用自然换行形成漂亮、易读的排版，结尾加入互动提问，并附上 3–5 个相关话题标签；表达有节奏、有分享感，但必须尊重史实，不使用 Markdown 标题语法。

模块1：王朝兴衰录。以重大事件为主线，按时间顺序选择 5-8 个真正改变王朝走向的重大事件，覆盖建立、兴盛、关键转折、衰落和灭亡等阶段。每张卡片聚焦一个事件，讲清事件背景、过程、结果，以及它如何影响王朝走向；强调事件之间的因果关系，不写流水账。人物只作为事件参与者简要出现，仅说明其在事件中的作用，不展开人物生平、功绩盘点或帝王名单，避免与“皇帝图鉴”和“风云人物”重复。

模块2：皇帝图鉴。展示该朝代的重要皇帝，优先选择开国皇帝、盛世皇帝、转折点皇帝、亡国相关皇帝。避免罗列全部皇帝。每位皇帝说明姓名、在位时间、一句话评价、主要功绩、主要问题。

模块3：风云人物。展示影响朝代命运的人物，可包含皇帝、名将、权臣、谋士、外戚、宦官、改革家、起义领袖。优先选择真正改变历史走向的人物，不为凑数选择影响有限的人物。每个人物说明是谁、做了什么、为什么重要、对朝代造成什么影响。

模块4：历史冷知识。输出最适合小红书传播的趣味知识，优先人口、经济、房价、科举、工资、饮食、军事、科技、娱乐、服饰、婚姻、交通、货币等方向。趣味性和收藏价值优先，冷门但真实，避免过于学术化。

每个模块的 cover 必须包含 title、subtitle、imageText、prompt。cover.prompt 是该模块的小红书首图封面生图提示词，需要强调竖版小红书首图封面、强标题层级、历史知识感、准确时代氛围、中文文字留白和可读性。

每个模块的 cards 根据内容判断需要多少张，下限 3 张，上限 10 张，每张包含 title、imageText、prompt。imageText 是图片内要放的中文文字；prompt 是中文生图提示词，保持中等长度，系统会自行校验长度，不要把字数、字符数或类似“xx字”的说明写进 prompt 字段。prompt 需要强调竖版小红书知识卡片，并说明两类信息：第一类是图片描述，具体描述主体、时代场景、构图、光线、色彩、材质、文字留白和小红书知识卡片风格；第二类是图片中应该以文字类型展示哪些具体知识，例如背景、人物、路线、制度、影响、时间线或关键对比。凡是 cover.prompt 或 cards[].prompt 提到文字留白或预留区域，不能只写“留出空白位置以用于某种内容”，必须同步明确空白部分需要填充的具体文字内容，例如具体标题、副标题、知识标签、时间节点或解释文字。

四个模块的 topic 要像可直接发布的小红书选题标题，例如“东汉是怎么一步步走向灭亡的”“看懂东汉只需要认识这几位皇帝”“改变东汉命运的5个人”“东汉公务员一个月赚多少钱？”。`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await getModelClient().generateText({
      purpose: "vision",
      maxTokens: 9000,
      timeoutMs: 600_000,
      responseFormat: "json",
      systemPrompt: "你是中文历史知识编辑，擅长把朝代史拆成小红书可发布图文策划。只输出严格 JSON 对象，不要输出 Markdown。",
      prompt:
        attempt === 0
          ? prompt
          : `${prompt}\n上一次输出不完整或字段不符合要求。请重新生成完整 JSON，保持内容紧凑，必须返回 dynasty 和 4 个完整 modules，每个 module 都必须包含完整 cover、cardCount、cards 和 xiaohongshuCaption，不要输出解释。`
    });
    const rawContent = result.text;
    const normalizedPayloadInput = normalizeDynastyPayloadInput(rawContent);

    console.info("[history-agent] model-runtime:response-shape", {
      attempt: attempt + 1,
      mode: "dynasty",
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

    try {
      return validateDynastyPayload(normalizedPayloadInput, requestedAt);
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }

      console.warn("[history-agent] model-runtime:retry-incomplete-dynasty-json", {
        error: error instanceof Error ? error.message : "模型输出校验失败"
      });
    }
  }

  throw new Error("模型输出校验失败");
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const localDate = asString(input.meta?.localDate) ?? input.requestedAt.slice(0, 10);
    const requestedMode = asString(input.meta?.mode);
    const requestedDynasty = asString(input.meta?.dynasty);
    const shouldGenerateDynasty = requestedMode === "dynasty" || Boolean(requestedDynasty);

    if (shouldGenerateDynasty) {
      const dynasty = requestedDynasty ?? asString(input.meta?.topic);

      console.info("[history-agent] execute:start", {
        taskId: input.taskId,
        trigger: input.trigger,
        localDate,
        mode: "dynasty",
        dynasty,
        hasFixture: Boolean(process.env.HISTORY_POST_FIXTURE_JSON)
      });

      if (!dynasty) {
        return {
          status: "failed",
          summary: "朝代四件套生成缺少 dynasty",
          assistantMessage: "朝代四件套生成失败，请输入朝代名称。"
        };
      }

      try {
        const payload = await generateDynastyWithModelRuntime(dynasty, input.requestedAt);

        console.info("[history-agent] execute:success", {
          taskId: input.taskId,
          mode: "dynasty",
          dynasty: payload.dynasty,
          moduleCount: payload.modules.length
        });

        return {
          status: "completed",
          summary: `生成朝代四件套：${payload.dynasty}`,
          assistantMessage: `已生成朝代四件套：${payload.dynasty}`,
          notifications: [
            {
              kind: "history-post",
              title: `朝代四件套：${payload.dynasty}`,
              body: `已生成${payload.dynasty}朝代四件套。`,
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
          mode: "dynasty",
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          status: "failed",
          summary: error instanceof Error ? error.message : "朝代四件套生成失败",
          assistantMessage: "朝代四件套生成失败，请检查 ModelScope 配置或稍后重试。"
        };
      }
    }

    const archivePath = getTopicArchivePath();
    const archive = loadTopicArchive(archivePath);
    const topic =
      asString(input.meta?.topic) ??
      selectTopic(localDate, archive, getHistoryNotificationTopics(input.state));

    console.info("[history-agent] execute:start", {
      taskId: input.taskId,
      trigger: input.trigger,
      localDate,
      topic,
      hasFixture: Boolean(process.env.HISTORY_POST_FIXTURE_JSON)
    });

    try {
      const payload = await generateWithModelRuntime(
        topic,
        input.requestedAt,
        buildHistoryXhsAnalyticsPrompt(input.state)
      );
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
