import type { DashboardData } from "@agent-zy/shared-types";

import {
  EMPTY_TODO_WORKSPACE_STATE,
  applyTodoWorkspaceState,
  buildTodoWorkspaceSnapshot,
  toDateKey
} from "./todo-utils";

function createDashboard(): DashboardData {
  const today = toDateKey(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateKey(yesterdayDate);

  return {
    tasks: {
      todo: [],
      inProgress: [
        {
          id: "task-running",
          agentId: "schedule-agent",
          summary: "整理今天待办",
          trigger: "user",
          input: {},
          status: "running",
          createdAt: "2026-05-15T09:00:00.000Z",
          updatedAt: "2026-05-15T09:15:00.000Z",
          history: []
        }
      ],
      waitingFeedback: [
        {
          id: "task-blocked",
          agentId: "schedule-agent",
          summary: "确认晚间回顾",
          trigger: "schedule",
          input: {},
          status: "waiting_feedback",
          createdAt: "2026-05-15T12:00:00.000Z",
          updatedAt: "2026-05-15T12:20:00.000Z",
          history: []
        }
      ],
      done: []
    },
    recentTasks: [
      {
        id: "task-running",
        agentId: "schedule-agent",
        summary: "整理今天待办",
        trigger: "user",
        input: {},
        status: "running",
        createdAt: "2026-05-15T09:00:00.000Z",
        updatedAt: "2026-05-15T09:15:00.000Z",
        history: []
      },
      {
        id: "task-blocked",
        agentId: "schedule-agent",
        summary: "确认晚间回顾",
        trigger: "schedule",
        input: {},
        status: "waiting_feedback",
        createdAt: "2026-05-15T12:00:00.000Z",
        updatedAt: "2026-05-15T12:20:00.000Z",
        history: []
      }
    ],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: {
      entries: [],
      modules: [],
      summary: {
        todayExpense: 0,
        todayIncome: 0,
        balance: 0
      },
      dashboard: {
        todayIncomeCents: 0,
        todayExpenseCents: 0,
        rolling7dNetCents: 0,
        recentFacts: [],
        coachTip: null,
        pendingReviewCount: 0
      }
    },
    schedule: {
      items: [
        {
          id: "old-1",
          title: "处理旧逾期任务",
          date: yesterday,
          suggestedWindow: "10:00-11:00",
          urgency: "high",
          status: "pending"
        },
        {
          id: "today-1",
          title: "推进里程碑发布",
          date: today,
          suggestedWindow: "09:00-10:30",
          urgency: "high",
          status: "pending"
        },
        {
          id: "today-2",
          title: "每日复盘提醒",
          date: today,
          suggestedWindow: "20:00-20:30",
          urgency: "medium",
          status: "done",
          completedAt: new Date().toISOString()
        }
      ],
      pendingReview: null,
      todayItems: [
        {
          id: "today-1",
          title: "推进里程碑发布",
          date: today,
          suggestedWindow: "09:00-10:30",
          urgency: "high",
          status: "pending"
        },
        {
          id: "today-2",
          title: "每日复盘提醒",
          date: today,
          suggestedWindow: "20:00-20:30",
          urgency: "medium",
          status: "done",
          completedAt: new Date().toISOString()
        }
      ]
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
      current: [],
      history: [],
      dimensions: [],
      currentByDimension: [],
      lastGeneratedAt: null
    },
    agents: []
  };
}

describe("todo-utils", () => {
  test("applies local todo additions and status overrides to dashboard schedule data", () => {
    const today = toDateKey(new Date());
    const dashboard = createDashboard();
    const merged = applyTodoWorkspaceState(dashboard, {
      ...EMPTY_TODO_WORKSPACE_STATE,
      addedItems: [
        {
          id: "local-1",
          title: "补一个本地新任务",
          date: today,
          suggestedWindow: "15:00-16:00",
          urgency: "low",
          status: "pending"
        }
      ],
      statusOverrides: {
        "today-1": {
          status: "done",
          completedAt: new Date().toISOString()
        }
      }
    });

    expect(merged.schedule.items).toHaveLength(4);
    expect(merged.schedule.todayItems).toHaveLength(3);
    expect(merged.schedule.items.find((item) => item.id === "today-1")?.status).toBe("done");
    expect(merged.schedule.items.some((item) => item.id === "local-1")).toBe(true);
  });

  test("builds snapshot metrics, ai summary and calendar markers from schedule and runtime data", () => {
    const activeDate = toDateKey(new Date());
    const snapshot = buildTodoWorkspaceSnapshot(createDashboard(), activeDate, "all");

    expect(snapshot.metrics.find((item) => item.id === "selectedTotal")?.value).toBe("2");
    expect(snapshot.metrics.find((item) => item.id === "overdue")?.value).toBe("1");
    expect(snapshot.metrics.find((item) => item.id === "blocked")?.value).toBe("1");
    expect(snapshot.aiSummary).toContain("逾期任务");

    const currentDay = snapshot.calendarDays.find((day) => day.isSelected);
    expect(currentDay).toMatchObject({
      totalCount: 2,
      highCount: 1,
      hasReminder: true,
      hasMilestone: true
    });
  });
});
