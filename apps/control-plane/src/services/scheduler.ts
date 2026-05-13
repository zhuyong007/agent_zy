import type { ControlPlaneStore } from "./store";
import type { ControlPlaneOrchestrator } from "./orchestrator";

function localDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
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

  return {
    start() {
      if (!newsTimer) {
        void refreshNews("startup");
        newsTimer = setInterval(() => {
          void refreshNews("interval");
        }, newsIntervalMs);
      }

      if (!reviewTimer) {
        reviewTimer = setInterval(() => {
          void maybeTriggerNightlyReview();
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
