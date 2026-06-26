import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneStore } from "./store";
import { createScreenMonitorService, type ScreenMonitorNotifier, type ScreenMonitorScreenCapture } from "./screen-monitor-service";
import type { ModelRuntime } from "./model-runtime";

function createModelRuntime(responses: string[]): ModelRuntime {
  const chat = vi.fn(async () => ({
    text: responses.shift() ?? JSON.stringify({
      resultText: "剩余 30 回合",
      confidence: 0.9,
      done: false,
      announcement: "当前剩余 30 回合",
      reason: "屏幕中显示 30"
    })
  }));

  return {
    chat,
    generateText: vi.fn(),
    embedding: vi.fn(),
    testConnection: vi.fn(),
    execute: vi.fn()
  } as unknown as ModelRuntime;
}

function createFixture(responses = [
  JSON.stringify({
    resultText: "剩余 30 回合",
    confidence: 0.9,
    done: false,
    announcement: "当前剩余 30 回合",
    reason: "屏幕中显示 30"
  })
]) {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-screen-monitor-"));
  const store = createControlPlaneStore(dataDir);
  const capture: ScreenMonitorScreenCapture = {
    capture: vi.fn(async () => ({
      dataUrl: "data:image/png;base64,abc",
      capturedAt: "2026-06-25T10:00:00.000Z"
    }))
  };
  const notifier: ScreenMonitorNotifier = {
    announce: vi.fn(async () => ({
      ok: true
    }))
  };
  const modelRuntime = createModelRuntime([...responses]);
  const timers: Array<() => void> = [];
  const service = createScreenMonitorService({
    store,
    modelRuntime,
    capture,
    notifier,
    now: () => "2026-06-25T10:00:00.000Z",
    setIntervalFn: (callback) => {
      timers.push(callback);
      return { timer: timers.length } as unknown as NodeJS.Timeout;
    },
    clearIntervalFn: vi.fn()
  });

  return { dataDir, store, service, capture, notifier, modelRuntime, timers };
}

describe("screen monitor service", () => {
  const dataDirs: string[] = [];

  afterEach(() => {
    for (const dir of dataDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts a session, checks the screen, and announces changed results", async () => {
    const fixture = createFixture([
      JSON.stringify({
        resultText: "剩余 30 回合",
        confidence: 0.9,
        done: false,
        announcement: "当前剩余 30 回合",
        reason: "屏幕中显示 30"
      }),
      JSON.stringify({
        resultText: "剩余 30 回合",
        confidence: 0.9,
        done: false,
        announcement: "当前剩余 30 回合",
        reason: "屏幕仍显示 30"
      }),
      JSON.stringify({
        resultText: "剩余 27 回合",
        confidence: 0.88,
        done: false,
        announcement: "当前剩余 27 回合",
        reason: "屏幕中显示 27"
      })
    ]);
    dataDirs.push(fixture.dataDir);

    const session = await fixture.service.startSession({
      prompt: "查看当前游戏还剩多少回合",
      intervalMs: 30000,
      muted: false
    });
    const repeated = await fixture.service.checkSession(session.id, "manual");
    const changed = await fixture.service.checkSession(session.id, "manual");

    expect(session.status).toBe("running");
    expect(fixture.capture.capture).toHaveBeenCalledTimes(3);
    expect(fixture.notifier.announce).toHaveBeenCalledTimes(2);
    expect(repeated.announced).toBe(false);
    expect(changed).toMatchObject({
      resultText: "剩余 27 回合",
      announced: true
    });
    expect(fixture.service.getState().sessions[0]?.observations).toHaveLength(3);
  });

  it("records invalid model output as a failed observation without crashing", async () => {
    const fixture = createFixture(["not json"]);
    dataDirs.push(fixture.dataDir);

    const session = await fixture.service.startSession({
      prompt: "查看当前游戏还剩多少回合"
    });

    expect(session.status).toBe("running");
    expect(session.observations[0]).toMatchObject({
      status: "failed",
      error: "视觉模型没有返回有效 JSON"
    });
    expect(fixture.notifier.announce).not.toHaveBeenCalled();
  });

  it("stops a running session and clears its timer", async () => {
    const fixture = createFixture();
    dataDirs.push(fixture.dataDir);

    const session = await fixture.service.startSession({
      prompt: "查看当前游戏还剩多少回合"
    });
    const stopped = fixture.service.stopSession(session.id);

    expect(stopped.status).toBe("stopped");
    expect(fixture.service.getState().activeSessionId).toBeNull();
  });
});
