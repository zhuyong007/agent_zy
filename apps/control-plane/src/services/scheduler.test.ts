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
