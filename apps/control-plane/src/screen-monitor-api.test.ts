import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";
import type { ModelRuntime } from "./services/model-runtime";

describe("screen monitor API", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-screen-monitor-api-"));
  const modelRuntime = {
    chat: vi.fn(async () => ({
      text: JSON.stringify({
        resultText: "剩余 30 回合",
        confidence: 0.9,
        done: false,
        announcement: "当前剩余 30 回合",
        reason: "屏幕中显示 30"
      })
    })),
    generateText: vi.fn(),
    embedding: vi.fn(),
    testConnection: vi.fn(),
    execute: vi.fn()
  } as unknown as ModelRuntime;
  const app = createControlPlaneApp({
    dataDir,
    startSchedulers: false,
    modelRuntime,
    screenMonitorCapture: {
      capture: vi.fn(async () => ({
        dataUrl: "data:image/png;base64,abc",
        capturedAt: "2026-06-25T10:00:00.000Z"
      }))
    },
    screenMonitorNotifier: {
      announce: vi.fn(async () => ({ ok: true }))
    }
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("starts, checks, and stops a screen monitor session from a local origin", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/tools/screen-monitor/sessions",
      headers: {
        origin: "http://127.0.0.1:5173"
      },
      payload: {
        prompt: "查看当前游戏还剩多少回合",
        intervalMs: 30000
      }
    });
    const session = createResponse.json();

    expect(createResponse.statusCode).toBe(200);
    expect(session).toMatchObject({
      prompt: "查看当前游戏还剩多少回合",
      status: "running"
    });
    expect(session.observations[0]).toMatchObject({
      resultText: "剩余 30 回合",
      status: "completed"
    });

    const checkResponse = await app.inject({
      method: "POST",
      url: `/api/tools/screen-monitor/sessions/${session.id}/check`,
      headers: {
        origin: "http://localhost:5173"
      },
      payload: {}
    });

    expect(checkResponse.statusCode).toBe(200);
    expect(checkResponse.json().resultText).toBe("剩余 30 回合");

    const stopResponse = await app.inject({
      method: "POST",
      url: `/api/tools/screen-monitor/sessions/${session.id}/stop`,
      headers: {
        origin: "http://localhost:5173"
      },
      payload: {}
    });

    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json().status).toBe("stopped");
  });

  it("rejects remote origins before taking screenshots", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tools/screen-monitor/sessions",
      headers: {
        origin: "https://example.com"
      },
      payload: {
        prompt: "查看当前游戏还剩多少回合"
      }
    });

    expect(response.statusCode).toBe(403);
  });
});
