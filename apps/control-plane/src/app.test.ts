import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createControlPlaneApp } from "./app";
import {
  DEFAULT_NEWS_INTERVAL_MS,
  DEFAULT_TOPIC_INTERVAL_MS
} from "./services/scheduler";

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

  it("syncs AI HOT items and analyzes an item on demand", async () => {
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

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/news/refresh",
      payload: {
        reason: "test"
      }
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshedNews = refreshResponse.json();
    expect(refreshedNews).toMatchObject({
      lastSummaryProvider: "aihot",
      sources: [],
      items: [
        expect.objectContaining({
          title: "Claude v2.1.133 版本更新",
          category: "ai-products",
          sources: ["Claude Code：GitHub Releases（RSS）"]
        })
      ]
    });

    const itemId = refreshedNews.items[0].id;

    const analysisResponse = await app.inject({
      method: "POST",
      url: `/api/news/items/${itemId}/analyze`
    });

    expect(analysisResponse.statusCode).toBe(200);
    expect(analysisResponse.json().items[0].analysis).toMatchObject({
      personalImpact: expect.any(String),
      possibleChanges: expect.any(String),
      relationToMe: expect.any(String)
    });
  });

  it("returns the current news state", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/news"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "idle",
      sources: expect.any(Array),
      items: expect.any(Array)
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
      current: expect.any(Array),
      history: expect.any(Array),
      status: "idle"
    });
    expect(generateResponse.json().current).toHaveLength(5);

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/topics"
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().current).toHaveLength(5);
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

  it("uses a 3-hour default topic push interval", () => {
    expect(DEFAULT_TOPIC_INTERVAL_MS).toBe(3 * 60 * 60 * 1000);
  });
});
