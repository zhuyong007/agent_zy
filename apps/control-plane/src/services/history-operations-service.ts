import { nanoid } from "nanoid";

import type {
  HistoryAccountStrategy,
  HistoryCommentReplyState,
  HistoryContentDirection,
  HistoryEditorialStage,
  HistoryEditorialTopic,
  HistoryOperationsDashboard,
  HistoryOperationsState,
  HistorySourceCard,
  HistoryTopicScores,
  HistoryXhsState
} from "@agent-zy/shared-types";

import type { ControlPlaneStore } from "./store";

const STAGES: HistoryEditorialStage[] = [
  "idea",
  "researching",
  "ready",
  "drafting",
  "scheduled",
  "published",
  "archived"
];

const DEFAULT_SCORES: HistoryTopicScores = {
  demand: 3,
  curiosity: 3,
  contrast: 3,
  collectability: 3,
  visualPotential: 3,
  evidenceStrength: 3,
  extensibility: 3,
  risk: 2
};

export function createDefaultHistoryOperationsState(now = new Date().toISOString()): HistoryOperationsState {
  const seeds = [
    ["ordinary-life", "古人的日常生活", "从衣食住行、工作、婚姻与消费切入历史。"],
    ["turning-points", "历史转折点", "用事件链解释一个时代为何改变方向。"],
    ["misread-figures", "被误解的人物", "比较流行印象、史料记录与后世塑造。"],
    ["maps-timelines", "地图与时间线", "用空间迁移和时间顺序降低理解门槛。"],
    ["objects-sources", "文物与史料", "从器物、文书和考古材料进入具体历史。"],
    ["cross-civilization", "跨文明比较", "在明确时期、地区与指标后进行比较。"]
  ] as const;

  return {
    strategy: {
      accountName: "历史知识",
      audience: "对历史有兴趣、希望轻松看懂复杂问题的中文读者",
      promise: "用可靠史料和清楚图解，把历史讲得真实、有趣、值得收藏",
      weeklyCadence: 5
    },
    directions: seeds.map(([id, name, description]) => ({
      id,
      name,
      description,
      active: true,
      createdAt: now,
      updatedAt: now
    })),
    topics: [],
    lastUpdatedAt: now
  };
}

function requireText(value: unknown, label: string, maxLength = 200) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不能为空`);
  if (Array.from(text).length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return text;
}

function optionalText(value: unknown, maxLength = 500) {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (Array.from(text).length > maxLength) throw new Error(`文本不能超过 ${maxLength} 个字符`);
  return text;
}

function score(value: unknown, fallback = 3) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(5, Math.round(value)))
    : fallback;
}

function normalizeScores(value: Partial<HistoryTopicScores> | undefined): HistoryTopicScores {
  return {
    demand: score(value?.demand),
    curiosity: score(value?.curiosity),
    contrast: score(value?.contrast),
    collectability: score(value?.collectability),
    visualPotential: score(value?.visualPotential),
    evidenceStrength: score(value?.evidenceStrength),
    extensibility: score(value?.extensibility),
    risk: score(value?.risk, 2)
  };
}

function normalizeSourceCards(value: unknown): HistorySourceCard[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Partial<HistorySourceCard> : {};
    const sourceType = ["primary", "academic", "reference", "web"].includes(String(item.sourceType))
      ? item.sourceType as HistorySourceCard["sourceType"]
      : "reference";
    const confidence = ["A", "B", "C", "D"].includes(String(item.confidence))
      ? item.confidence as HistorySourceCard["confidence"]
      : "C";
    return {
      id: typeof item.id === "string" && item.id ? item.id : `source-${index + 1}-${nanoid(6)}`,
      title: requireText(item.title, "资料名称", 160),
      sourceType,
      citation: typeof item.citation === "string" ? item.citation.trim().slice(0, 500) : "",
      url: optionalText(item.url, 1000),
      claim: typeof item.claim === "string" ? item.claim.trim().slice(0, 1000) : "",
      confidence,
      notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 1000) : ""
    };
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] ?? null : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function rate(value: number, views: number) {
  return views > 0 ? value / views : null;
}

function normalizeTitle(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]/gu, "");
}

function matchTopic(title: string, topics: HistoryEditorialTopic[]) {
  const normalized = normalizeTitle(title);
  return topics.find((topic) => {
    const candidate = normalizeTitle(topic.title);
    return candidate.length >= 4 && (normalized.includes(candidate) || candidate.includes(normalized));
  }) ?? null;
}

function buildCommentSignals(comments: HistoryCommentReplyState | undefined): HistoryOperationsDashboard["commentSignals"] {
  const definitions = [
    ["事实质疑", /真的吗|依据|史料|出处|确定|错了|不对|质疑/u],
    ["想看续集", /想看|下期|继续|再讲|求讲|蹲/u],
    ["没看懂", /不懂|没懂|什么意思|为什么|怎么理解/u],
    ["补充资料", /补充|还有|其实|记载|资料/u],
    ["观点讨论", /我觉得|怎么看|同意|不同意|争议/u]
  ] as const;

  return definitions
    .map(([label, pattern]) => {
      const matched = (comments?.records ?? []).filter((record) => pattern.test(record.commentText));
      return { label, count: matched.length, examples: matched.slice(0, 3).map((record) => record.commentText) };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
}

export function buildHistoryOperationsDashboard(
  state: HistoryOperationsState,
  xhs: HistoryXhsState | undefined,
  comments: HistoryCommentReplyState | undefined
): HistoryOperationsDashboard {
  const pipeline = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<HistoryEditorialStage, number>;
  state.topics.forEach((topic) => { pipeline[topic.status] += 1; });
  const topicsWithEvidence = state.topics.filter((topic) => topic.sourceCards.length > 0).length;
  const performance = (xhs?.posts ?? []).map((post) => {
    const matched = matchTopic(post.title, state.topics);
    return {
      ...post,
      likeRate: rate(post.likes, post.views),
      collectRate: rate(post.collects, post.views),
      commentRate: rate(post.comments, post.views),
      shareRate: rate(post.shares, post.views),
      engagementRate: rate(post.likes + post.collects + post.comments + post.shares, post.views),
      matchedTopicId: matched?.id ?? null,
      directionId: matched?.directionId ?? null
    };
  });
  const recommendations: string[] = [];
  if (!performance.length) recommendations.push("导入小红书笔记明细，建立账号自己的浏览和互动基线。");
  if (!state.topics.length) recommendations.push("先建立至少 10 个候选选题，再按证据强度和收藏价值排序。");
  if (state.topics.length && topicsWithEvidence / state.topics.length < 0.7) recommendations.push("选题库的资料覆盖不足 70%，优先补齐事实卡后再批量生产。");
  if (!pipeline.ready) recommendations.push("当前没有已完成研究的选题，把至少 3 个选题推进到“可生产”。");
  if (pipeline.scheduled < state.strategy.weeklyCadence) recommendations.push(`发布日历尚未达到每周 ${state.strategy.weeklyCadence} 篇的目标。`);
  const bestCollect = [...performance].filter((post) => post.collectRate !== null).sort((a, b) => (b.collectRate ?? 0) - (a.collectRate ?? 0))[0];
  if (bestCollect) recommendations.push(`收藏率最高的是《${bestCollect.title}》，建议复用它的知识密度和信息组织方式。`);

  return {
    pipeline,
    activeDirectionCount: state.directions.filter((direction) => direction.active).length,
    readyToProduceCount: pipeline.ready,
    scheduledCount: pipeline.scheduled,
    evidenceCoverage: state.topics.length ? topicsWithEvidence / state.topics.length : null,
    performance,
    benchmarks: {
      medianViews: median(performance.map((post) => post.views)),
      medianLikeRate: median(performance.flatMap((post) => post.likeRate === null ? [] : [post.likeRate])),
      medianCollectRate: median(performance.flatMap((post) => post.collectRate === null ? [] : [post.collectRate])),
      medianCommentRate: median(performance.flatMap((post) => post.commentRate === null ? [] : [post.commentRate])),
      medianShareRate: median(performance.flatMap((post) => post.shareRate === null ? [] : [post.shareRate]))
    },
    recommendations: recommendations.slice(0, 5),
    commentSignals: buildCommentSignals(comments)
  };
}

export interface HistoryOperationsService {
  updateStrategy(input: Partial<HistoryAccountStrategy>): HistoryOperationsState;
  createDirection(input: { name?: unknown; description?: unknown }): HistoryContentDirection;
  updateDirection(id: string, input: Partial<HistoryContentDirection>): HistoryContentDirection;
  deleteDirection(id: string): HistoryOperationsState;
  createTopic(input: Partial<HistoryEditorialTopic>): HistoryEditorialTopic;
  updateTopic(id: string, input: Partial<HistoryEditorialTopic>): HistoryEditorialTopic;
  deleteTopic(id: string): HistoryOperationsState;
}

export function createHistoryOperationsService(store: ControlPlaneStore): HistoryOperationsService {
  function state() {
    return store.getState().historyOperations ?? createDefaultHistoryOperationsState();
  }
  function save(next: HistoryOperationsState) {
    return store.setHistoryOperationsState({ ...next, lastUpdatedAt: new Date().toISOString() });
  }

  return {
    updateStrategy(input) {
      const current = state();
      return save({
        ...current,
        strategy: {
          accountName: input.accountName === undefined ? current.strategy.accountName : requireText(input.accountName, "账号名称", 80),
          audience: input.audience === undefined ? current.strategy.audience : requireText(input.audience, "目标读者", 300),
          promise: input.promise === undefined ? current.strategy.promise : requireText(input.promise, "内容承诺", 300),
          weeklyCadence: typeof input.weeklyCadence === "number"
            ? Math.max(1, Math.min(21, Math.round(input.weeklyCadence)))
            : current.strategy.weeklyCadence
        }
      });
    },
    createDirection(input) {
      const current = state();
      const now = new Date().toISOString();
      const direction: HistoryContentDirection = {
        id: `direction-${nanoid(10)}`,
        name: requireText(input.name, "方向名称", 60),
        description: requireText(input.description, "方向说明", 300),
        active: true,
        createdAt: now,
        updatedAt: now
      };
      save({ ...current, directions: [...current.directions, direction] });
      return direction;
    },
    updateDirection(id, input) {
      const current = state();
      const previous = current.directions.find((item) => item.id === id);
      if (!previous) throw new Error("内容方向不存在");
      const direction: HistoryContentDirection = {
        ...previous,
        name: input.name === undefined ? previous.name : requireText(input.name, "方向名称", 60),
        description: input.description === undefined ? previous.description : requireText(input.description, "方向说明", 300),
        active: typeof input.active === "boolean" ? input.active : previous.active,
        updatedAt: new Date().toISOString()
      };
      save({ ...current, directions: current.directions.map((item) => item.id === id ? direction : item) });
      return direction;
    },
    deleteDirection(id) {
      const current = state();
      if (!current.directions.some((item) => item.id === id)) throw new Error("内容方向不存在");
      return save({
        ...current,
        directions: current.directions.filter((item) => item.id !== id),
        topics: current.topics.map((topic) => topic.directionId === id ? { ...topic, directionId: null } : topic)
      });
    },
    createTopic(input) {
      const current = state();
      const now = new Date().toISOString();
      const directionId = optionalText(input.directionId, 100);
      if (directionId && !current.directions.some((item) => item.id === directionId)) throw new Error("内容方向不存在");
      const topic: HistoryEditorialTopic = {
        id: `history-topic-${nanoid(10)}`,
        title: requireText(input.title, "选题", 120),
        directionId,
        angle: typeof input.angle === "string" ? input.angle.trim().slice(0, 300) : "",
        targetAudience: typeof input.targetAudience === "string" ? input.targetAudience.trim().slice(0, 300) : current.strategy.audience,
        hook: typeof input.hook === "string" ? input.hook.trim().slice(0, 300) : "",
        status: STAGES.includes(input.status as HistoryEditorialStage) ? input.status as HistoryEditorialStage : "idea",
        scores: normalizeScores(input.scores),
        sourceCards: normalizeSourceCards(input.sourceCards),
        riskNotes: Array.isArray(input.riskNotes) ? input.riskNotes.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
        scheduledFor: optionalText(input.scheduledFor, 40),
        linkedNotificationId: optionalText(input.linkedNotificationId, 120),
        publishedPostId: optionalText(input.publishedPostId, 120),
        createdAt: now,
        updatedAt: now
      };
      save({ ...current, topics: [topic, ...current.topics] });
      return topic;
    },
    updateTopic(id, input) {
      const current = state();
      const previous = current.topics.find((item) => item.id === id);
      if (!previous) throw new Error("选题不存在");
      const directionId = input.directionId === undefined ? previous.directionId : optionalText(input.directionId, 100);
      if (directionId && !current.directions.some((item) => item.id === directionId)) throw new Error("内容方向不存在");
      const topic: HistoryEditorialTopic = {
        ...previous,
        title: input.title === undefined ? previous.title : requireText(input.title, "选题", 120),
        directionId,
        angle: input.angle === undefined ? previous.angle : String(input.angle).trim().slice(0, 300),
        targetAudience: input.targetAudience === undefined ? previous.targetAudience : String(input.targetAudience).trim().slice(0, 300),
        hook: input.hook === undefined ? previous.hook : String(input.hook).trim().slice(0, 300),
        status: STAGES.includes(input.status as HistoryEditorialStage) ? input.status as HistoryEditorialStage : previous.status,
        scores: input.scores === undefined ? previous.scores : normalizeScores(input.scores),
        sourceCards: input.sourceCards === undefined ? previous.sourceCards : normalizeSourceCards(input.sourceCards),
        riskNotes: input.riskNotes === undefined ? previous.riskNotes : Array.isArray(input.riskNotes) ? input.riskNotes.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
        scheduledFor: input.scheduledFor === undefined ? previous.scheduledFor : optionalText(input.scheduledFor, 40),
        linkedNotificationId: input.linkedNotificationId === undefined ? previous.linkedNotificationId : optionalText(input.linkedNotificationId, 120),
        publishedPostId: input.publishedPostId === undefined ? previous.publishedPostId : optionalText(input.publishedPostId, 120),
        updatedAt: new Date().toISOString()
      };
      save({ ...current, topics: current.topics.map((item) => item.id === id ? topic : item) });
      return topic;
    },
    deleteTopic(id) {
      const current = state();
      if (!current.topics.some((item) => item.id === id)) throw new Error("选题不存在");
      return save({ ...current, topics: current.topics.filter((item) => item.id !== id) });
    }
  };
}
