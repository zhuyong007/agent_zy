import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchSystemStatus,
  clearEventLogs,
  fetchEventLogs,
  generateCinematic,
  generateHistory,
  openExternalUrl,
  previewPhotoRenames,
  resolveApiBase,
  restartProject,
  reportClientEvent,
  executePhotoRenames,
  syncHistoryXhsAnalytics,
  testModelProfile,
  undoPhotoRenames
} from "./api";

describe("photo renamer API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews, executes, and undoes photo rename batches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ previewToken: "preview-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ undoToken: "undo-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { restored: 1, failed: 0 } }) });
    vi.stubGlobal("fetch", fetchMock);

    await previewPhotoRenames("C:\\photos", "videos");
    await executePhotoRenames("preview-1");
    await undoPhotoRenames("undo-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/tools/photo-renamer/preview"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ directoryPath: "C:\\photos", mediaScope: "videos" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/tools/photo-renamer/execute"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ previewToken: "preview-1" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/api/tools/photo-renamer/undo"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ undoToken: "undo-1" })
      })
    );
  });
});

describe("event log API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries, reports, and clears structured event logs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], nextCursor: null, summary: { total: 0, errorCount: 0, latestTimestamp: null }, warnings: [] })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEventLogs({ level: "error", q: "JSON" });
    await reportClientEvent({ action: "history.generate.clicked", message: "立即生成" });
    await clearEventLogs();

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/logs?level=error&q=JSON");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/logs/client-events");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/api/logs");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE" });
  });
});

describe("resolveApiBase", () => {
  it("uses the current page host when no API URL is configured", () => {
    expect(resolveApiBase(undefined, { protocol: "http:", hostname: "192.168.1.20" })).toBe(
      "http://192.168.1.20:4378"
    );
  });

  it("rewrites loopback API URL overrides for remote web access", () => {
    expect(resolveApiBase("http://127.0.0.1:4378", { protocol: "http:", hostname: "192.168.1.20" })).toBe(
      "http://192.168.1.20:4378"
    );
  });

  it("keeps non-loopback API URL overrides", () => {
    expect(resolveApiBase("https://api.example.com", { protocol: "http:", hostname: "192.168.1.20" })).toBe(
      "https://api.example.com"
    );
  });
});

describe("generateHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to chat and dashboard refresh when dedicated endpoint is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          route: {
            agentId: "history-agent",
            confidence: 0.8,
            reason: "fallback"
          },
          task: {
            status: "completed"
          },
          message: {
            content: "已生成今日历史知识点小红书策划"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          notifications: [
            {
              kind: "history-post",
              title: "每日历史知识点：测试主题"
            }
          ]
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateHistory();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/history/generate");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/chat");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/api/dashboard");
    expect(result).toMatchObject({
      notifications: [
        {
          kind: "history-post",
          title: "每日历史知识点：测试主题"
        }
      ]
    });
  });

  it("sends a custom topic to the dedicated history endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notifications: [],
        recentTasks: []
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await generateHistory({
      reason: "manual",
      topic: " 商鞅变法 "
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reason: "manual",
      topic: "商鞅变法"
    });
  });

  it("sends a dynasty request to the dedicated history endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notifications: [],
        recentTasks: []
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await generateHistory({
      reason: "manual",
      mode: "dynasty",
      dynasty: " 东汉 "
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reason: "manual",
      mode: "dynasty",
      dynasty: "东汉"
    });
  });
});

describe("generateCinematic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces backend generation failures to the caller", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        message: "未找到可用模型配置"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(generateCinematic({ concept: "" })).rejects.toThrow("未找到可用模型配置");
  });
});

describe("testModelProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns backend test failures as a visible model test result", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        message: "model test endpoint failed"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(testModelProfile("profile-1")).resolves.toEqual({
      ok: false,
      message: "model test endpoint failed"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/model-profiles/profile-1/test"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      })
    );
  });
});

describe("syncHistoryXhsAnalytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the history xiaohongshu sync endpoint and refreshes dashboard", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          posts: [],
          overview: {
            totalViews: 1200
          },
          lastSyncedAt: "2026-05-24T08:00:00.000Z",
          status: "idle",
          lastError: null,
          sourceUrl: "https://creator.xiaohongshu.com/statistics/data-analysis"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          notifications: [],
          homeLayout: [],
          recentTasks: []
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await syncHistoryXhsAnalytics();

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/history/xhs/sync");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST"
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/dashboard");
    expect(dashboard.historyXhs?.overview.totalViews).toBe(1200);
  });
});

describe("openExternalUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the URL to the local browser bridge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await openExternalUrl("https://example.com/news-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/open-url"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/news-1"
        })
      })
    );
  });
});

describe("restartProject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the local restart endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        ok: true
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await restartProject();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/system/restart"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      })
    );
  });
});

describe("fetchSystemStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the backend process start marker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        startedAt: "2026-05-24T10:00:00.000Z"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSystemStatus()).resolves.toEqual({
      ok: true,
      startedAt: "2026-05-24T10:00:00.000Z"
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/system/status"));
  });
});
