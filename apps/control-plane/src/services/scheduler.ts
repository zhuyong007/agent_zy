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
export const DEFAULT_TOPIC_INTERVAL_MS = 3 * 60 * 60 * 1000;

export function createControlPlaneScheduler(options: {
  orchestrator: ControlPlaneOrchestrator;
  store: ControlPlaneStore;
  newsIntervalMs?: number;
  topicIntervalMs?: number;
}): ControlPlaneScheduler {
  const newsIntervalMs = options.newsIntervalMs ?? DEFAULT_NEWS_INTERVAL_MS;
  const topicIntervalMs = options.topicIntervalMs ?? DEFAULT_TOPIC_INTERVAL_MS;
  let newsTimer: NodeJS.Timeout | null = null;
  let topicTimer: NodeJS.Timeout | null = null;
  let reviewTimer: NodeJS.Timeout | null = null;

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

  async function generateTopics(reason: string) {
    await options.orchestrator.runSystemTask({
      agentId: "topic-agent",
      trigger: "schedule",
      summary: "推送 AI 自媒体选题",
      meta: {
        reason,
        action: "generate"
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

  return {
    start() {
      let startupNewsRefresh: Promise<void> | null = null;

      if (!newsTimer) {
        startupNewsRefresh = refreshNews("startup");
        void startupNewsRefresh;
        newsTimer = setInterval(() => {
          void refreshNews("interval");
        }, newsIntervalMs);
      }

      if (!topicTimer) {
        const startupTopics = startupNewsRefresh
          ? startupNewsRefresh.finally(() => generateTopics("startup"))
          : generateTopics("startup");

        void startupTopics;
        topicTimer = setInterval(() => {
          void generateTopics("interval");
        }, topicIntervalMs);
      }

      if (!reviewTimer) {
        reviewTimer = setInterval(() => {
          void maybeTriggerNightlyReview();
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

      if (topicTimer) {
        clearInterval(topicTimer);
        topicTimer = null;
      }
    }
  };
}
