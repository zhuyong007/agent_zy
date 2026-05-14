import type { ControlPlaneStore } from "./store";
import type { ControlPlaneOrchestrator } from "./orchestrator";

function localDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function startOfLocalDay(value: Date): Date {
  const date = new Date(value.getTime());
  date.setHours(0, 0, 0, 0);
  return date;
}

function getPreviousWeeklyPeriod(now: Date) {
  const currentWeekStart = startOfLocalDay(now);
  const weekDay = currentWeekStart.getDay();
  const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay;
  currentWeekStart.setDate(currentWeekStart.getDate() + mondayOffset);

  const periodStart = new Date(currentWeekStart.getTime());
  periodStart.setDate(periodStart.getDate() - 7);

  const periodEnd = new Date(currentWeekStart.getTime());
  periodEnd.setDate(periodEnd.getDate() - 1);

  return {
    periodStart: localDate(periodStart),
    periodEnd: localDate(periodEnd)
  };
}

function getPreviousMonthlyPeriod(now: Date) {
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    periodStart: localDate(periodStart),
    periodEnd: localDate(periodEnd)
  };
}

export interface ControlPlaneScheduler {
  start(): void;
  stop(): void;
}

export const DEFAULT_NEWS_INTERVAL_MS = 30 * 60 * 1000;
export const DEFAULT_HISTORY_PUSH_HOUR = 7;

export function createControlPlaneScheduler(options: {
  orchestrator: ControlPlaneOrchestrator;
  store: ControlPlaneStore;
  newsIntervalMs?: number;
}): ControlPlaneScheduler {
  const newsIntervalMs = options.newsIntervalMs ?? DEFAULT_NEWS_INTERVAL_MS;
  let newsTimer: NodeJS.Timeout | null = null;
  let reviewTimer: NodeJS.Timeout | null = null;
  let historyTimer: NodeJS.Timeout | null = null;
  let historyAttemptedDate: string | null = null;
  let weeklyLedgerAttemptedKey: string | null = null;
  let monthlyLedgerAttemptedKey: string | null = null;

  async function refreshNews(reason: string) {
    await options.orchestrator.runSystemTask({
      agentId: "news-agent",
      trigger: "schedule",
      summary: "刷新热点",
      meta: {
        reason
      }
    });
  }

  async function maybeTriggerNightlyReview() {
    const now = new Date();
    const currentDate = localDate(now);
    const state = options.store.getState();

    if (
      now.getHours() === 22 &&
      state.nightlyReview.lastTriggeredDate !== currentDate
    ) {
      await options.orchestrator.runSystemTask({
        agentId: "schedule-agent",
        trigger: "schedule",
        summary: "发起夜间回顾",
        meta: {
          mode: "nightly-review"
        }
      });
      options.store.setNightlyReviewDate(currentDate);
    }
  }

  async function maybeTriggerHistoryPush() {
    const now = new Date();
    const currentDate = localDate(now);
    const state = options.store.getState();

    if (
      now.getHours() === DEFAULT_HISTORY_PUSH_HOUR &&
      state.historyPush.lastTriggeredDate !== currentDate &&
      historyAttemptedDate !== currentDate
    ) {
      historyAttemptedDate = currentDate;
      await options.orchestrator.runSystemTask({
        agentId: "history-agent",
        trigger: "schedule",
        summary: "生成每日历史知识点",
        meta: {
          action: "generate",
          localDate: currentDate
        }
      });
    }
  }

  async function maybeTriggerWeeklyLedgerReport() {
    const now = new Date();

    if (!(now.getDay() === 1 && now.getHours() === 8 && now.getMinutes() === 0)) {
      return;
    }

    const period = getPreviousWeeklyPeriod(now);
    const periodKey = `${period.periodStart}:${period.periodEnd}`;

    if (weeklyLedgerAttemptedKey === periodKey) {
      return;
    }

    if (
      options.store
        .getLedgerReports()
        .some(
          (report) =>
            report.kind === "weekly" &&
            report.periodStart === period.periodStart &&
            report.periodEnd === period.periodEnd
        )
    ) {
      weeklyLedgerAttemptedKey = periodKey;
      return;
    }

    weeklyLedgerAttemptedKey = periodKey;
    await options.orchestrator.runSystemTask({
      agentId: "ledger-agent",
      trigger: "schedule",
      summary: "生成账本周报",
      meta: {
        action: "generate-weekly-report",
        kind: "weekly",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      }
    });
  }

  async function maybeTriggerMonthlyLedgerReport() {
    const now = new Date();

    if (!(now.getDate() === 1 && now.getHours() === 8 && now.getMinutes() === 5)) {
      return;
    }

    const period = getPreviousMonthlyPeriod(now);
    const periodKey = `${period.periodStart}:${period.periodEnd}`;

    if (monthlyLedgerAttemptedKey === periodKey) {
      return;
    }

    if (
      options.store
        .getLedgerReports()
        .some(
          (report) =>
            report.kind === "monthly" &&
            report.periodStart === period.periodStart &&
            report.periodEnd === period.periodEnd
        )
    ) {
      monthlyLedgerAttemptedKey = periodKey;
      return;
    }

    monthlyLedgerAttemptedKey = periodKey;
    await options.orchestrator.runSystemTask({
      agentId: "ledger-agent",
      trigger: "schedule",
      summary: "生成账本月报",
      meta: {
        action: "generate-monthly-report",
        kind: "monthly",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      }
    });
  }

  return {
    start() {
      if (!newsTimer) {
        void refreshNews("startup");
        newsTimer = setInterval(() => {
          void refreshNews("interval");
        }, newsIntervalMs);
      }

      if (!reviewTimer) {
        void maybeTriggerNightlyReview();
        void maybeTriggerWeeklyLedgerReport();
        void maybeTriggerMonthlyLedgerReport();
        reviewTimer = setInterval(() => {
          void maybeTriggerNightlyReview();
          void maybeTriggerWeeklyLedgerReport();
          void maybeTriggerMonthlyLedgerReport();
        }, 60_000);
      }

      if (!historyTimer) {
        void maybeTriggerHistoryPush();
        historyTimer = setInterval(() => {
          void maybeTriggerHistoryPush();
        }, 60_000);
      }
    },
    stop() {
      if (newsTimer) {
        clearInterval(newsTimer);
        newsTimer = null;
      }

      if (reviewTimer) {
        clearInterval(reviewTimer);
        reviewTimer = null;
      }
      if (historyTimer) {
        clearInterval(historyTimer);
        historyTimer = null;
      }
    }
  };
}
