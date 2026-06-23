import { describe, expect, it, vi } from "vitest";

import type { DashboardData } from "@agent-zy/shared-types";

import {
  formatAmount,
  formatDateTime,
  formatShortCount,
  formatTime,
  getModuleSummary,
  waitForRestartRecovery
} from "./dashboard-utils";

function createDashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    tasks: { todo: [], inProgress: [], waitingFeedback: [], done: [] },
    recentTasks: [],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: {
      entries: [],
      modules: [],
      summary: { todayExpense: 0, todayIncome: 0, balance: 12800 },
      dashboard: {
        todayIncomeCents: 0,
        todayExpenseCents: 0,
        rolling7dNetCents: 0,
        recentFacts: [],
        coachTip: null,
        pendingReviewCount: 0
      }
    },
    schedule: { items: [], pendingReview: null, todayItems: [] },
    news: {
      feed: {
        count: 2,
        hasNext: false,
        nextCursor: null,
        items: [
          {
            id: "news-1",
            title: "A",
            titleEn: null,
            url: "https://example.com/a",
            source: "AI",
            publishedAt: "2026-06-16T08:00:00.000Z",
            summary: "A",
            category: "ai-models"
          },
          {
            id: "news-2",
            title: "B",
            titleEn: null,
            url: "https://example.com/b",
            source: "AI",
            publishedAt: "2026-06-16T09:00:00.000Z",
            summary: "B",
            category: "industry"
          }
        ]
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
      lastError: null,
      dashboard: {
        projectCount: 3,
        recentProjects: [],
        latestProject: null,
        lastGeneratedAt: null,
        totalShotCount: 0,
        todayInspiration: "等待灵感"
      }
    },
    classicShots: {
      projects: [],
      recentProjectIds: [],
      lastGeneratedAt: null,
      status: "idle",
      lastError: null,
      dashboard: {
        projectCount: 0,
        recentProjects: [],
        latestProject: null,
        lastGeneratedAt: null,
        totalStoryboardCount: 0,
        todayReference: "选择一个有明确出处的经典镜头"
      }
    },
    summary: {
      entries: [],
      drafts: [],
      lastUpdatedAt: null,
      settings: { defaultSummaryType: "daily" },
      dashboard: {
        todaySummaryStatus: "missing",
        weekSummaryStatus: "missing",
        latestSummary: null,
        recentKeywords: [],
        recentMoodTags: [],
        totalCount: 0,
        dailyCount: 0,
        weeklyCount: 0,
        monthlyCount: 0,
        yearlyCount: 0
      }
    },
    agents: [],
    ...overrides
  };
}

describe("dashboard utils", () => {
  it("formats timestamps and counts for compact dashboard labels", () => {
    expect(formatTime(null)).toBe("--:--");
    expect(formatDateTime(null)).toBe("--");
    expect(formatShortCount(2)).toBe("02");
    expect(formatShortCount(12)).toBe("12");
    expect(formatAmount(12800)).toBe("12,800");
  });

  it("builds module summaries from dashboard data", () => {
    const dashboard = createDashboard({
      notifications: [
        {
          id: "history-1",
          kind: "history-post",
          title: "历史",
          body: "历史",
          createdAt: "2026-06-16T08:00:00.000Z",
          read: false,
          persistent: true,
          payload: {
            topic: "张骞",
            summary: "摘要",
            cardCount: 3,
            cards: [],
            xiaohongshuCaption: "正文",
            generatedAt: "2026-06-16T08:00:00.000Z"
          }
        }
      ]
    });

    expect(getModuleSummary("news", dashboard)).toBe("02 条热点");
    expect(getModuleSummary("ledger", dashboard)).toBe("结余 12,800");
    expect(getModuleSummary("history", dashboard)).toBe("01 条知识卡");
    expect(getModuleSummary("cinematic", dashboard)).toBe("03 个镜头项目");
    expect(getModuleSummary("unknown-module", dashboard)).toBe("待接入");
  });

  it("polls system status until restart recovery is detected", async () => {
    const wait = vi.fn(async () => undefined);
    const refreshDashboard = vi.fn(async () => createDashboard());
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, startedAt: "2026-06-16T08:00:00.000Z" })
      .mockResolvedValueOnce({ ok: true, startedAt: "2026-06-16T08:01:00.000Z" });

    await expect(
      waitForRestartRecovery("2026-06-16T08:00:00.000Z", Date.parse("2026-06-16T08:00:30.000Z"), {
        fetchStatus,
        refreshDashboard,
        wait,
        maxAttempts: 3,
        intervalMs: 10
      })
    ).resolves.toEqual({ ok: true, startedAt: "2026-06-16T08:01:00.000Z" });
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(refreshDashboard).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
