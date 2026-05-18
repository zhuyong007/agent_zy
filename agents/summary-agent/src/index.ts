import { nanoid } from "nanoid";

import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type { SummaryEntry, SummaryStructuredFields, SummaryType } from "@agent-zy/shared-types";

const SUMMARY_TYPE_LABELS: Record<SummaryType, string> = {
  daily: "每日总结",
  weekly: "每周总结",
  monthly: "每月总结",
  yearly: "每年总结"
};

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function resolveSummaryType(input: AgentExecutionRequest): SummaryType {
  const metaType = input.meta?.summaryType;

  if (metaType === "daily" || metaType === "weekly" || metaType === "monthly" || metaType === "yearly") {
    return metaType;
  }

  const message = input.message ?? "";

  if (/年终|年度|今年|年总结/.test(message)) {
    return "yearly";
  }

  if (/月度|本月|这个月|月总结/.test(message)) {
    return "monthly";
  }

  if (/周报|本周|这周|周总结/.test(message)) {
    return "weekly";
  }

  return input.state.summary.settings.defaultSummaryType;
}

function getWeekBounds(now: Date) {
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  const start = new Date(date.getTime());
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start.getTime());
  end.setDate(start.getDate() + 6);

  return {
    start: localDate(start),
    end: localDate(end)
  };
}

function resolvePeriod(summaryType: SummaryType, requestedAt: string) {
  const now = new Date(requestedAt);

  if (summaryType === "daily") {
    const date = localDate(now);
    return {
      start: date,
      end: date
    };
  }

  if (summaryType === "weekly") {
    return getWeekBounds(now);
  }

  if (summaryType === "monthly") {
    const year = now.getFullYear();
    const month = now.getMonth();
    return {
      start: `${year}-${String(month + 1).padStart(2, "0")}-01`,
      end: localDate(new Date(year, month + 1, 0))
    };
  }

  const year = now.getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function extractMoodTags(text: string): string[] {
  const tags: string[] = [];

  if (/焦虑|着急|慌/.test(text)) tags.push("焦虑");
  if (/累|疲惫|困|消耗/.test(text)) tags.push("疲惫");
  if (/开心|高兴|满足/.test(text)) tags.push("开心");
  if (/进展|推进|完成|搞定/.test(text)) tags.push("有进展");
  if (/烦|压力|卡住/.test(text)) tags.push("压力");

  return tags.length > 0 ? unique(tags) : ["平稳"];
}

function extractKeywords(text: string): string[] {
  const candidates = [
    "AI agent",
    "AI",
    "剪视频",
    "视频",
    "工作",
    "学习",
    "家庭",
    "记账",
    "运动",
    "项目"
  ];

  const matched = candidates.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));

  return unique(matched).slice(0, 6);
}

function splitEvents(text: string): string[] {
  return unique(text.split(/[，。；,.]/).map((item) => item.trim())).slice(0, 6);
}

function inferEnergyLevel(text: string): number | null {
  if (/很累|疲惫|困|没精神|消耗/.test(text)) {
    return 2;
  }

  if (/状态很好|精力|兴奋|顺利/.test(text)) {
    return 4;
  }

  return 3;
}

function buildStructuredFields(summaryType: SummaryType, text: string): SummaryStructuredFields {
  const events = splitEvents(text);
  const progress = events.filter((item) => /进展|完成|推进|研究|学习|搞定/.test(item));
  const problems = events.filter((item) => /没|未|焦虑|卡|拖|累|问题/.test(item));

  if (summaryType === "weekly") {
    return {
      mainEvents: events,
      progress,
      problems,
      moodChanges: extractMoodTags(text),
      energyChanges: /累|疲惫/.test(text) ? "精力有明显消耗" : "精力基本稳定",
      memorableThings: progress,
      regrets: problems,
      nextWeekFocus: "减少分散消耗，先启动最重要但最容易拖延的事。"
    };
  }

  if (summaryType === "monthly") {
    return {
      monthKeywords: extractKeywords(text),
      mainAchievements: progress,
      importantEvents: events,
      stateChanges: /焦虑|累/.test(text) ? "行动和精力之间有拉扯" : "整体状态稳定",
      moneyObservations: "",
      studyOrWorkObservations: progress.join("；"),
      familyOrLifeObservations: "",
      habitsToKeep: "保留能产生真实进展的学习和复盘。",
      problemsToAdjust: problems.join("；"),
      nextMonthFocus: "把重要事项拆到能当天开始的第一步。"
    };
  }

  if (summaryType === "yearly") {
    return {
      yearKeywords: extractKeywords(text),
      importantEvents: events,
      mainAchievements: progress,
      regrets: problems,
      stateChanges: /焦虑|累/.test(text) ? "更清楚哪些事情会持续消耗自己" : "状态观察开始成型",
      relationshipChanges: "",
      moneyObservations: "",
      studyOrWorkObservations: progress.join("；"),
      familyOrLifeObservations: "",
      whoIHaveBecome: "一个更能看见自己行动模式的人。",
      whoIWantToBecomeNextYear: "更少被焦虑推动，更多被清晰的优先级推动。"
    };
  }

  return {
    todayEvents: events,
    achievements: progress,
    problems,
    mood: extractMoodTags(text).join("、"),
    bodyState: /累|疲惫|困/.test(text) ? "精力偏低" : "状态基本稳定",
    moneyNotes: "",
    studyOrWorkNotes: progress.join("；"),
    familyOrLifeNotes: "",
    oneSentenceSummary: "今天有推进，但真正的压力来自重要事项迟迟没有开始。",
    tomorrowFocus: "先启动那个让你焦虑但一直没有开始的任务。"
  };
}

function buildAiDraft(summaryType: SummaryType, text: string, fields: SummaryStructuredFields): string {
  const sentence =
    typeof fields.oneSentenceSummary === "string"
      ? fields.oneSentenceSummary
      : "这段时间的重点不是做了多少事，而是看清哪些事在持续消耗你。";

  if (/焦虑/.test(text) && /没|未|拖/.test(text)) {
    return `${sentence} 今天的问题不是没做事，而是精力被碎片化消耗掉了。真正让你焦虑的不是没有产出，而是你知道有件事重要，但还没有开始。`;
  }

  if (/累|疲惫/.test(text)) {
    return `${sentence} 你不是没有行动力，而是可用精力已经偏低。接下来要减少同时推进的线索，把注意力收回到最关键的一步。`;
  }

  return `${SUMMARY_TYPE_LABELS[summaryType]}草稿：${sentence} 这份记录更适合保留判断，而不是写成机械流水账。`;
}

export function createSummaryDraft(input: {
  summaryType: SummaryType;
  rawInput: string;
  requestedAt: string;
}): SummaryEntry {
  const period = resolvePeriod(input.summaryType, input.requestedAt);
  const fields = buildStructuredFields(input.summaryType, input.rawInput);
  const now = input.requestedAt;

  return {
    id: nanoid(),
    summaryType: input.summaryType,
    periodStart: period.start,
    periodEnd: period.end,
    title: `${SUMMARY_TYPE_LABELS[input.summaryType]} ${period.start}`,
    rawInput: input.rawInput,
    structuredFields: fields,
    aiDraft: buildAiDraft(input.summaryType, input.rawInput, fields),
    finalSummary: "",
    moodTags: extractMoodTags(input.rawInput),
    energyLevel: inferEnergyLevel(input.rawInput),
    keywords: extractKeywords(input.rawInput),
    createdAt: now,
    updatedAt: now,
    version: 1
  };
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const rawInput = (input.message ?? String(input.meta?.rawInput ?? "")).trim();

    if (rawInput.length === 0) {
      return {
        status: "waiting_feedback",
        summary: "缺少总结素材",
        assistantMessage: "请先给我一段今天或这个阶段的真实记录，我会先生成草稿，不会覆盖正式总结。"
      };
    }

    const draft = createSummaryDraft({
      summaryType: resolveSummaryType(input),
      rawInput,
      requestedAt: input.requestedAt
    });

    return {
      status: "completed",
      summary: `已生成${SUMMARY_TYPE_LABELS[draft.summaryType]}草稿`,
      assistantMessage: draft.aiDraft,
      domainUpdates: {
        summary: {
          ...input.state.summary,
          drafts: [draft, ...input.state.summary.drafts.filter((item) => item.id !== draft.id)].slice(0, 20),
          lastUpdatedAt: input.requestedAt
        }
      }
    };
  }
});

export default agent;
