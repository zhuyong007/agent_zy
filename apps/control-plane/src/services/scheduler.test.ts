import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneScheduler } from "./scheduler";

describe("control-plane scheduler history push", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the history agent once at 07:00 local time for each date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 7, 6, 59, 0));
    const tasks: Array<{ agentId: string; meta?: Record<string, unknown> }> = [];
    const state: {
      historyPush: {
        lastTriggeredDate: string | null;
      };
    } = {
      historyPush: {
        lastTriggeredDate: null
      }
    };
    const scheduler = createControlPlaneScheduler({
      newsIntervalMs: 24 * 60 * 60 * 1000,
      orchestrator: {
        async runSystemTask(input: { agentId: string; meta?: Record<string, unknown> }) {
          tasks.push(input);
          if (input.agentId === "history-agent") {
            state.historyPush.lastTriggeredDate = String(input.meta?.localDate);
          }
          return {} as any;
        }
      } as any,
      store: {
        getState() {
          return state;
        },
        setNightlyReviewDate() {}
      } as any
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(tasks.filter((task) => task.agentId === "history-agent")).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({
          action: "generate",
          localDate: "2026-05-07"
        })
      })
    ]);

    vi.setSystemTime(new Date(2026, 4, 8, 7, 0, 0));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(tasks.filter((task) => task.agentId === "history-agent")).toHaveLength(2);
    scheduler.stop();
  });
});

describe("control-plane scheduler ledger reports", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the weekly ledger report once within the Monday 08:00 window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 11, 7, 59, 0));
    const tasks: Array<{ agentId: string; meta?: Record<string, unknown> }> = [];
    const reports: Array<{
      id: string;
      kind: "weekly" | "monthly";
      periodStart: string;
      periodEnd: string;
    }> = [];

    const scheduler = createControlPlaneScheduler({
      newsIntervalMs: 24 * 60 * 60 * 1000,
      orchestrator: {
        async runSystemTask(input: { agentId: string; meta?: Record<string, unknown> }) {
          tasks.push(input);

          if (input.meta?.action === "generate-weekly-report") {
            reports.unshift({
              id: "weekly-2026-05-04",
              kind: "weekly",
              periodStart: "2026-05-04",
              periodEnd: "2026-05-10"
            });
          }

          return {} as any;
        }
      } as any,
      store: {
        getState() {
          return {
            historyPush: {
              lastTriggeredDate: null
            },
            nightlyReview: {
              lastTriggeredDate: null
            }
          };
        },
        getLedgerReports() {
          return reports;
        },
        setNightlyReviewDate() {}
      } as any
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(
      tasks.filter((task) => task.meta?.action === "generate-weekly-report")
    ).toHaveLength(1);
    expect(tasks).toContainEqual(
      expect.objectContaining({
        agentId: "ledger-agent",
        meta: expect.objectContaining({
          action: "generate-weekly-report",
          kind: "weekly",
          periodStart: "2026-05-04",
          periodEnd: "2026-05-10"
        })
      })
    );

    scheduler.stop();
  });

  it("runs the monthly ledger report once within the first-day 08:05 window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 8, 4, 0));
    const tasks: Array<{ agentId: string; meta?: Record<string, unknown> }> = [];
    const reports: Array<{
      id: string;
      kind: "weekly" | "monthly";
      periodStart: string;
      periodEnd: string;
    }> = [];

    const scheduler = createControlPlaneScheduler({
      newsIntervalMs: 24 * 60 * 60 * 1000,
      orchestrator: {
        async runSystemTask(input: { agentId: string; meta?: Record<string, unknown> }) {
          tasks.push(input);

          if (input.meta?.action === "generate-monthly-report") {
            reports.unshift({
              id: "monthly-2026-05",
              kind: "monthly",
              periodStart: "2026-05-01",
              periodEnd: "2026-05-31"
            });
          }

          return {} as any;
        }
      } as any,
      store: {
        getState() {
          return {
            historyPush: {
              lastTriggeredDate: null
            },
            nightlyReview: {
              lastTriggeredDate: null
            }
          };
        },
        getLedgerReports() {
          return reports;
        },
        setNightlyReviewDate() {}
      } as any
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(
      tasks.filter((task) => task.meta?.action === "generate-monthly-report")
    ).toHaveLength(1);
    expect(tasks).toContainEqual(
      expect.objectContaining({
        agentId: "ledger-agent",
        meta: expect.objectContaining({
          action: "generate-monthly-report",
          kind: "monthly",
          periodStart: "2026-05-01",
          periodEnd: "2026-05-31"
        })
      })
    );

    scheduler.stop();
  });
});
