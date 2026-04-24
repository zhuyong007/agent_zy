import type { ChatMessage, ChatResponse } from "@agent-zy/shared-types";

import {
  addSession,
  applyChatSuccess,
  applyOptimisticPrompt,
  createInitialChatWorkspace,
  createSessionLabelFromPrompt,
  removeSession
} from "./chat-workspace";

function createResponse(): ChatResponse {
  return {
    route: {
      agentId: "ledger-agent",
      reason: "识别为记账和账目查询请求",
      confidence: 0.93
    },
    task: {
      id: "task-ledger-1",
      agentId: "ledger-agent",
      summary: "查询本月工作午餐支出",
      trigger: "user",
      input: {},
      status: "completed",
      createdAt: "2026-04-23T12:00:00.000Z",
      updatedAt: "2026-04-23T12:00:08.000Z",
      history: [
        {
          status: "queued",
          at: "2026-04-23T12:00:00.000Z",
          note: "任务已创建"
        },
        {
          status: "completed",
          at: "2026-04-23T12:00:08.000Z",
          note: "已完成查询"
        }
      ],
      resultSummary: "已汇总 12 条账本记录，工作午餐支出 128 元。"
    },
    message: {
      id: "assistant-msg-1",
      role: "assistant",
      content: "你这个月工作午餐共支出 128 元。",
      createdAt: "2026-04-23T12:00:08.000Z",
      agentId: "ledger-agent"
    }
  };
}

describe("chat-workspace", () => {
  test("uses the first user prompt to generate an initial session label", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        content: "今天工作午餐花了多少钱，顺便帮我按模块汇总一下",
        createdAt: "2026-04-23T11:58:00.000Z"
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "我正在查询账本记录。",
        createdAt: "2026-04-23T11:58:03.000Z",
        agentId: "main-agent"
      }
    ];

    const workspace = createInitialChatWorkspace(messages, "2026-04-23T12:00:00.000Z");

    expect(workspace.sessions).toHaveLength(1);
    expect(workspace.sessions[0]?.title).toBe("今天工作午餐花了多少钱");
    expect(workspace.activeSessionId).toBe(workspace.sessions[0]?.id);
  });

  test("creates a new blank session and switches focus to it", () => {
    const initial = createInitialChatWorkspace([], "2026-04-23T12:00:00.000Z");

    const next = addSession(initial, "2026-04-23T12:05:00.000Z");

    expect(next.sessions).toHaveLength(2);
    expect(next.activeSessionId).toBe(next.sessions[1]?.id);
    expect(next.sessions[1]?.title).toBe("新会话");
  });

  test("derives a concise label from the first prompt", () => {
    expect(createSessionLabelFromPrompt("帮我总结今天最值得关注的三条 AI 新闻，并给出风险提示")).toBe(
      "帮我总结今天最值得关注的三条"
    );
  });

  test("adds a user turn and pending progress steps when a prompt is sent", () => {
    const initial = createInitialChatWorkspace([], "2026-04-23T12:00:00.000Z");
    const sessionId = initial.activeSessionId;

    const next = applyOptimisticPrompt(
      initial,
      sessionId,
      "今天工作午餐花了多少钱，帮我查一下",
      "2026-04-23T12:01:00.000Z"
    );

    expect(next.sessions[0]?.title).toBe("今天工作午餐花了多少钱");
    expect(next.sessions[0]?.messages.at(-1)?.content).toBe("今天工作午餐花了多少钱，帮我查一下");
    expect(next.sessions[0]?.progress).toHaveLength(2);
    expect(next.sessions[0]?.progress[0]?.status).toBe("running");
    expect(next.sessions[0]?.progress[1]?.detail).toContain("等待主 Agent");
  });

  test("resolves a prompt into final reply and key progress timeline", () => {
    const initial = createInitialChatWorkspace([], "2026-04-23T12:00:00.000Z");
    const pending = applyOptimisticPrompt(
      initial,
      initial.activeSessionId,
      "今天工作午餐花了多少钱，帮我查一下",
      "2026-04-23T12:01:00.000Z"
    );

    const next = applyChatSuccess(
      pending,
      pending.activeSessionId,
      createResponse(),
      "2026-04-23T12:01:08.000Z"
    );

    expect(next.sessions[0]?.messages.at(-1)?.content).toBe("你这个月工作午餐共支出 128 元。");
    expect(next.sessions[0]?.progress).toHaveLength(3);
    expect(next.sessions[0]?.progress[0]?.detail).toContain("路由到 ledger-agent");
    expect(next.sessions[0]?.progress[1]?.detail).toContain("查询本月工作午餐支出");
    expect(next.sessions[0]?.progress[2]?.detail).toContain("128 元");
  });

  test("removes the chosen session and keeps the adjacent session active", () => {
    const initial = createInitialChatWorkspace([], "2026-04-23T12:00:00.000Z");
    const withTwo = addSession(initial, "2026-04-23T12:01:00.000Z");
    const withThree = addSession(withTwo, "2026-04-23T12:02:00.000Z");

    const removed = removeSession(withThree, withThree.activeSessionId, "2026-04-23T12:03:00.000Z");

    expect(removed.sessions).toHaveLength(2);
    expect(removed.activeSessionId).toBe(removed.sessions[1]?.id);
  });

  test("creates a fallback blank session when the last session is removed", () => {
    const initial = createInitialChatWorkspace([], "2026-04-23T12:00:00.000Z");

    const removed = removeSession(initial, initial.activeSessionId, "2026-04-23T12:03:00.000Z");

    expect(removed.sessions).toHaveLength(1);
    expect(removed.sessions[0]?.title).toBe("新会话");
    expect(removed.activeSessionId).toBe(removed.sessions[0]?.id);
  });
});
