import { defineAgent } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";

function toLocalDate(isoString: string): string {
  return isoString.slice(0, 10);
}

function formatItems(items: AgentExecutionRequest["state"]["schedule"]["items"]): string {
  if (items.length === 0) {
    return "今天没有待办。";
  }

  return items
    .map(
      (item) =>
        `- ${item.title}（${item.urgency}，建议 ${item.suggestedWindow}，${item.status === "done" ? "已完成" : "待处理"}）`
    )
    .join("\n");
}

function markTodayAsDone(input: AgentExecutionRequest) {
  const today = toLocalDate(input.requestedAt);
  return input.state.schedule.items.map((item) =>
    item.date === today && item.status !== "done"
      ? {
          ...item,
          status: "done" as const,
          completedAt: input.requestedAt
        }
      : item
  );
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const message = input.message ?? "";
    const today = toLocalDate(input.requestedAt);
    const todayItems = input.state.schedule.items.filter((item) => item.date === today);

    if (input.trigger === "schedule" && input.meta?.mode === "nightly-review") {
      return {
        status: "waiting_feedback",
        summary: "发起晚间回顾",
        assistantMessage: `现在是晚间回顾时间，请确认今天待办的完成情况：\n${formatItems(todayItems)}`,
        notifications: [
          {
            kind: "nightly-review",
            title: "晚间待办回顾",
            body: "请确认今天待办的完成情况。"
          }
        ],
        domainUpdates: {
          schedule: {
            ...input.state.schedule,
            pendingReview: {
              date: today,
              prompt: "请确认今天待办的完成情况",
              askedAt: input.requestedAt,
              taskId: input.taskId
            }
          }
        }
      };
    }

    if (/(都完成|全部完成|今天任务完成了)/.test(message)) {
      return {
        status: "completed",
        summary: "更新今日任务完成状态",
        assistantMessage: "已将今天的待办标记为完成，并清空待确认回顾。",
        domainUpdates: {
          schedule: {
            items: markTodayAsDone(input),
            pendingReview: null
          }
        }
      };
    }

    return {
      status: "completed",
      summary: "整理今日待办",
      assistantMessage: `今天建议优先处理这些事项：\n${formatItems(todayItems)}`,
      domainUpdates: {
        schedule: input.state.schedule
      }
    };
  }
});

export default agent;
