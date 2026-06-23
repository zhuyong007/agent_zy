import type { DashboardData } from "@agent-zy/shared-types";

import { fetchDashboard, fetchSystemStatus } from "../api";
import type { HomeModuleId } from "../home-layout";

const weekdayMap = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const RESTART_RECOVERY_TIMEOUT_MS = 90000;
const RESTART_RECOVERY_POLL_MS = 1200;

export function formatTime(timestamp?: string | null) {
  if (!timestamp) {
    return "--:--";
  }

  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDateTime(timestamp?: string | null) {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLunarDate(date: Date) {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric"
    });

    return formatter.format(date);
  } catch {
    return "--";
  }
}

export function formatClockLine(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} · ${weekdayMap[date.getDay()]} · 农历${formatLunarDate(date)}`;
}

export function formatAmount(amount: number) {
  return amount.toLocaleString("zh-CN");
}

export function formatShortCount(count: number) {
  return count.toLocaleString("zh-CN", {
    minimumIntegerDigits: count < 10 ? 2 : 1,
    useGrouping: false
  });
}

export function getModuleSummary(id: HomeModuleId, dashboard: DashboardData) {
  if (id === "news") {
    return `${formatShortCount(dashboard.news.feed.items.length)} 条热点`;
  }

  if (id === "chat") {
    return dashboard.tasks.inProgress.length > 0 ? "会话运行中" : `${formatShortCount(dashboard.messages.length)} 条消息`;
  }

  if (id === "todo") {
    const pendingCount = dashboard.schedule.todayItems.filter((item) => item.status === "pending").length;
    return `${String(pendingCount).padStart(2, "0")} 项待处理`;
  }

  if (id === "ledger") {
    return `结余 ${formatAmount(dashboard.ledger.summary.balance)}`;
  }

  if (id === "topics") {
    return `${formatShortCount(dashboard.topics.current.length)} 个选题`;
  }

  if (id === "history") {
    const historyCount = dashboard.notifications.filter((item) => item.kind === "history-post" && item.payload).length;
    return `${formatShortCount(historyCount)} 条知识卡`;
  }

  if (id === "cinematic") {
    return `${formatShortCount(dashboard.cinematic.dashboard.projectCount)} 个镜头项目`;
  }

  if (id === "classicShots") {
    return `${formatShortCount(dashboard.classicShots.dashboard.projectCount)} 个复刻镜头`;
  }

  if (id === "imageToVideo") {
    return `${formatShortCount(dashboard.imageToVideo?.dashboard.projectCount ?? 0)} 个策划项目`;
  }

  if (id === "summary") {
    return `${formatShortCount(dashboard.summary.dashboard.totalCount)} 条总结`;
  }

  return "待接入";
}

type RestartStatus = Awaited<ReturnType<typeof fetchSystemStatus>>;

type RestartRecoveryOptions = {
  fetchStatus?: typeof fetchSystemStatus;
  refreshDashboard?: typeof fetchDashboard;
  wait?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export async function waitForRestartRecovery(
  previousStartedAt: string | null,
  requestedAt: number,
  options: RestartRecoveryOptions = {}
): Promise<RestartStatus> {
  const fetchStatus = options.fetchStatus ?? fetchSystemStatus;
  const refreshDashboard = options.refreshDashboard ?? fetchDashboard;
  const waitFn = options.wait ?? wait;
  const intervalMs = options.intervalMs ?? RESTART_RECOVERY_POLL_MS;
  const timeoutMs = options.timeoutMs ?? RESTART_RECOVERY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const minimumWaitUntil = requestedAt + 3500;
  let stableChecks = 0;
  let attempts = 0;

  while (Date.now() < deadline && (options.maxAttempts === undefined || attempts < options.maxAttempts)) {
    attempts += 1;
    await waitFn(intervalMs);

    try {
      const status = await fetchStatus();
      if (!previousStartedAt || status.startedAt !== previousStartedAt) {
        await refreshDashboard();
        return status;
      }

      if (Date.now() >= minimumWaitUntil) {
        stableChecks += 1;

        if (stableChecks >= 2) {
          await refreshDashboard();
          return status;
        }
      }
    } catch {
      stableChecks = 0;
      // The API is expected to be unavailable for a short window while restarting.
    }
  }

  throw new Error("Restart did not complete within timeout");
}
