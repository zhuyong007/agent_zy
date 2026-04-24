import { describe, expect, it } from "vitest";

import {
  createTaskRecord,
  groupTasksByStatus,
  transitionTaskStatus
} from "./index";

describe("task-core", () => {
  it("creates queued tasks with an initial history entry", () => {
    const task = createTaskRecord({
      id: "task_1",
      agentId: "ledger-agent",
      input: {
        message: "工作报销 128 元"
      },
      summary: "记录账本"
    });

    expect(task.status).toBe("queued");
    expect(task.history).toHaveLength(1);
    expect(task.history[0]).toMatchObject({
      status: "queued",
      note: "Task created"
    });
  });

  it("does not allow leaving a terminal state", () => {
    const task = createTaskRecord({
      id: "task_2",
      agentId: "schedule-agent",
      input: {
        message: "今天的安排是什么"
      },
      summary: "查看日程"
    });

    const completed = transitionTaskStatus(task, "completed", "Handled");

    expect(() =>
      transitionTaskStatus(completed, "running", "Should be rejected")
    ).toThrow(/terminal/i);
  });

  it("groups tasks into stable kanban buckets", () => {
    const queued = createTaskRecord({
      id: "task_3",
      agentId: "news-agent",
      input: {
        trigger: "poll"
      },
      summary: "刷新热点"
    });
    const running = transitionTaskStatus(queued, "running", "Worker started");
    const waiting = transitionTaskStatus(
      createTaskRecord({
        id: "task_4",
        agentId: "schedule-agent",
        input: {
          trigger: "nightly-review"
        },
        summary: "夜间回顾"
      }),
      "waiting_feedback",
      "Waiting for user confirmation"
    );
    const completed = transitionTaskStatus(
      createTaskRecord({
        id: "task_5",
        agentId: "ledger-agent",
        input: {
          amount: 66
        },
        summary: "记账"
      }),
      "completed",
      "Saved"
    );

    const groups = groupTasksByStatus([running, waiting, completed]);

    expect(groups.todo).toEqual([]);
    expect(groups.inProgress.map((task) => task.id)).toEqual(["task_3"]);
    expect(groups.waitingFeedback.map((task) => task.id)).toEqual(["task_4"]);
    expect(groups.done.map((task) => task.id)).toEqual(["task_5"]);
  });
});
