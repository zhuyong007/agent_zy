// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { ScreenMonitorWorkspace } from "./screen-monitor-page";
import type { ScreenMonitorSession, ScreenMonitorState } from "@agent-zy/shared-types";

const now = "2026-06-25T10:00:00.000Z";

function createSession(patch: Partial<ScreenMonitorSession> = {}): ScreenMonitorSession {
  return {
    id: "screen-session-1",
    prompt: "查看当前游戏还剩多少回合",
    intervalMs: 30000,
    muted: false,
    status: "running",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    stoppedAt: null,
    lastObservationId: "screen-observation-1",
    lastResultText: "剩余 30 回合",
    lastAnnouncement: "当前剩余 30 回合",
    lastError: null,
    observations: [
      {
        id: "screen-observation-1",
        sessionId: "screen-session-1",
        checkedAt: now,
        status: "completed",
        trigger: "manual",
        resultText: "剩余 30 回合",
        confidence: 0.9,
        done: false,
        announcement: "当前剩余 30 回合",
        reason: "屏幕中显示 30",
        announced: true,
        error: null
      }
    ],
    ...patch
  };
}

function createState(session: ScreenMonitorSession | null = null): ScreenMonitorState {
  return {
    sessions: session ? [session] : [],
    activeSessionId: session?.id ?? null,
    lastUpdatedAt: session?.updatedAt ?? null
  };
}

describe("ScreenMonitorWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderWorkspace(props: Parameters<typeof ScreenMonitorWorkspace>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ScreenMonitorWorkspace, props));
    });
  }

  function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("starts a monitor session and renders latest screen result", async () => {
    const session = createSession();
    const fetchAction = vi.fn().mockResolvedValue(createState());
    const startAction = vi.fn().mockResolvedValue(session);

    await renderWorkspace({
      fetchAction,
      startAction,
      stopAction: vi.fn(),
      checkAction: vi.fn()
    });

    const prompt = container.querySelector('textarea[name="prompt"]') as HTMLTextAreaElement;
    await act(async () => {
      typeInto(prompt, "查看当前游戏还剩多少回合");
      prompt.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(startAction).toHaveBeenCalledWith({
      prompt: "查看当前游戏还剩多少回合",
      intervalMs: 180000,
      muted: false
    });
    expect(container.textContent).toContain("运行中");
    expect(container.textContent).toContain("剩余 30 回合");
    expect(container.textContent).toContain("当前剩余 30 回合");
  });

  it("checks and stops an active session", async () => {
    const session = createSession();
    const checked = createSession({
      lastResultText: "剩余 27 回合",
      observations: [
        {
          ...session.observations[0],
          id: "screen-observation-2",
          resultText: "剩余 27 回合",
          announcement: "当前剩余 27 回合"
        },
        ...session.observations
      ]
    });
    const fetchAction = vi.fn().mockResolvedValue(createState(session));
    const checkAction = vi.fn().mockResolvedValue(checked.observations[0]);
    const stopAction = vi.fn().mockResolvedValue({ ...checked, status: "stopped" });

    await renderWorkspace({
      fetchAction,
      startAction: vi.fn(),
      stopAction,
      checkAction
    });

    await act(async () => {
      container.querySelector('button[data-action="check-now"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(checkAction).toHaveBeenCalledWith(session.id);
    expect(container.textContent).toContain("剩余 27 回合");

    await act(async () => {
      container.querySelector('button[data-action="stop"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(stopAction).toHaveBeenCalledWith(session.id);
    expect(container.textContent).toContain("已停止");
  });
});
