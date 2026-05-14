import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";
import { DEFAULT_NEWS_INTERVAL_MS } from "./services/scheduler";

describe("control-plane app", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-test-"));
  const app = createControlPlaneApp({
    dataDir,
    startSchedulers: false
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterEach(() => {
    delete process.env.AIHOT_BASE_URL;
    delete process.env.AIHOT_ITEMS_FIXTURE_JSON;
    delete process.env.AIHOT_DAILY_FIXTURE_JSON;
    delete process.env.AIHOT_DAILIES_FIXTURE_JSON;
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_MODEL;
    delete process.env.HISTORY_POST_FIXTURE_JSON;
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, {
      recursive: true,
      force: true
    });
  });

  it("routes a chat request through the manifest-driven runtime and returns a task result", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "今天工作午餐花了 128 元，记到账本"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      route: {
        agentId: "ledger-agent"
      },
      task: {
        status: "completed"
      }
    });
  });

  it("records ledger facts through the ledger-agent path and exposes them in dashboard recent facts", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-record-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T14:30:00+08:00"));

    try {
      const recordResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/ledger/record",
        payload: {
          message: "今天梦幻西游卖货赚了 500"
        }
      });

      expect(recordResponse.statusCode).toBe(200);
      expect(recordResponse.json()).toMatchObject({
        route: {
          agentId: "ledger-agent"
        },
        task: {
          status: "completed"
        }
      });

      const dashboardResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/dashboard"
      });

      expect(dashboardResponse.statusCode).toBe(200);
      expect(dashboardResponse.json().ledger.dashboard.recentFacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            amountCents: 50000,
            summary: expect.stringContaining("梦幻西游")
          })
        ])
      );
      expect(dashboardResponse.json().ledger.summary.todayIncome).toBe(
        dashboardResponse.json().ledger.dashboard.todayIncomeCents / 100
      );
      expect(dashboardResponse.json().ledger.summary.todayIncome).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("returns repository-backed ledger timeline facts", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-timeline-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const recordResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/ledger/record",
        payload: {
          message: "昨天和老婆吃火锅花了 280"
        }
      });

      expect(recordResponse.statusCode).toBe(200);

      const timelineResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/ledger/timeline"
      });

      expect(timelineResponse.statusCode).toBe(200);
      expect(timelineResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fact: expect.objectContaining({
              rawText: "昨天和老婆吃火锅花了 280",
              amountCents: 28000,
              direction: "expense"
            }),
            semantic: expect.objectContaining({
              primaryCategory: "餐饮",
              confidence: 0.86
            })
          })
        ])
      );
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("returns the minimal ledger reports list", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-reports-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const reportsResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/ledger/reports"
      });

      expect(reportsResponse.statusCode).toBe(200);
      expect(reportsResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: expect.stringMatching(/weekly|monthly/),
            summary: expect.any(String),
            insights: expect.any(Array)
          })
        ])
      );
      expect(
        JSON.parse(readFileSync(join(isolatedDataDir, "ledger", "reports.json"), "utf8"))
      ).toEqual([]);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects empty ledger record messages", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-empty-record-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/ledger/record",
        payload: {
          message: "   "
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: expect.stringContaining("message")
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("syncs AI HOT all items and daily reports", async () => {
    process.env.AIHOT_ITEMS_FIXTURE_JSON = JSON.stringify({
      count: 1,
      hasNext: false,
      nextCursor: null,
      items: [
        {
          id: "cmow6i2aq036jslcxxneym5zm",
          title: "Claude v2.1.133 版本更新",
          url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.133",
          source: "Claude Code：GitHub Releases（RSS）",
          publishedAt: "2026-05-07T23:49:04.000Z",
          summary: "Claude 发布 v2.1.133 版本，新增多项配置与优化。",
          category: "ai-products"
        }
      ]
    });
    process.env.AIHOT_DAILY_FIXTURE_JSON = JSON.stringify({
      date: "2026-05-08",
      generatedAt: "2026-05-08T11:00:00.000Z",
      windowStart: "2026-05-07T00:00:00.000Z",
      windowEnd: "2026-05-08T00:00:00.000Z",
      lead: {
        title: "今日 AI 摘要",
        summary: "AI 产品和模型更新密集。"
      },
      sections: [],
      flashes: []
    });
    process.env.AIHOT_DAILIES_FIXTURE_JSON = JSON.stringify({
      count: 1,
      items: [
        {
          date: "2026-05-08",
          generatedAt: "2026-05-08T11:00:00.000Z",
          leadTitle: "今日 AI 摘要"
        }
      ]
    });

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/news/refresh",
      payload: {
        reason: "test",
        view: "all"
      }
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshedNews = refreshResponse.json();
    expect(refreshedNews).toMatchObject({
      feed: {
        items: [
          expect.objectContaining({
            title: "Claude v2.1.133 版本更新",
            category: "ai-products",
            source: "Claude Code：GitHub Releases（RSS）"
          })
        ]
      },
      lastError: null
    });

    const dailyResponse = await app.inject({
      method: "POST",
      url: "/api/news/refresh",
      payload: {
        reason: "test",
        view: "daily"
      }
    });

    expect(dailyResponse.statusCode).toBe(200);
    expect(dailyResponse.json()).toMatchObject({
      daily: {
        date: "2026-05-08",
        lead: {
          title: "今日 AI 摘要"
        }
      },
      dailyArchive: [
        {
          date: "2026-05-08",
          leadTitle: "今日 AI 摘要"
        }
      ]
    });
  });

  it("does not expose the removed news analysis endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/news/items/missing/analyze"
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns the current news state", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/news"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "idle",
      feed: {
        items: expect.any(Array)
      },
      dailyArchive: expect.any(Array)
    });
  });

  it("generates and returns AI self-media topic ideas", async () => {
    const generateResponse = await app.inject({
      method: "POST",
      url: "/api/topics/generate",
      payload: {
        reason: "test"
      }
    });

    expect(generateResponse.statusCode).toBe(200);
    expect(generateResponse.json()).toMatchObject({
      dimensions: expect.any(Array),
      currentByDimension: expect.any(Array),
      current: expect.any(Array),
      history: expect.any(Array),
      status: "idle"
    });
    expect(generateResponse.json().dimensions).toHaveLength(3);
    expect(generateResponse.json().currentByDimension).toHaveLength(3);
    expect(generateResponse.json().current).toHaveLength(3);

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/topics"
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().current).toHaveLength(3);
  });

  it("generates a history post from the manual generation endpoint", async () => {
    process.env.HISTORY_POST_FIXTURE_JSON = JSON.stringify({
      topic: "张骞出使西域如何改变丝绸之路",
      summary: "一次外交行动，重塑了贸易、地理认知和文化交流。",
      cardCount: 2,
      cards: [
        {
          title: "先讲出发背景",
          imageText: "汉朝为什么一定要向西走？",
          prompt: "中国古代使者，丝路地图，知识卡片风格"
        },
        {
          title: "再讲长期影响",
          imageText: "打开的不是一条路，而是一整套交流网络",
          prompt: "丝绸之路商队，地图与文明交流，竖版海报"
        }
      ],
      xiaohongshuCaption: "今天用两张图讲清张骞出使西域为什么是历史转折点。"
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/history/generate",
      payload: {
        reason: "test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: expect.arrayContaining([
        expect.objectContaining({
          kind: "history-post",
          title: "每日历史知识点：张骞出使西域如何改变丝绸之路"
        })
      ])
    });
  });

  it("exposes a notification cancellation endpoint", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/notifications/missing-notification"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: expect.any(Array)
    });
  });

  it("uses a 30-minute default news refresh interval", () => {
    expect(DEFAULT_NEWS_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});
