import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createControlPlaneApp } from "./app";
import { DEFAULT_NEWS_INTERVAL_MS } from "./services/scheduler";

describe("control-plane app", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-test-"));
  let feedUrl = "";
  let articleUrl = "";
  const app = createControlPlaneApp({
    dataDir,
    startSchedulers: false
  });

  beforeAll(async () => {
    articleUrl = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
        <html>
          <body>
            <article>
              <p>First paragraph from the full article.</p>
              <p>Second paragraph explains why the update matters.</p>
            </article>
          </body>
        </html>`)}`;
    feedUrl = `data:application/rss+xml;charset=utf-8,${encodeURIComponent(`<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>AI agents reshape personal workspaces</title>
              <link>${articleUrl}</link>
              <pubDate>${new Date().toUTCString()}</pubDate>
            </item>
          </channel>
        </rss>`)}`;
    await app.ready();
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

  it("manages news sources, fetches full articles, and analyzes an item on demand", async () => {
    const sourceResponse = await app.inject({
      method: "POST",
      url: "/api/news/sources",
      payload: {
        name: "AI Daily",
        url: feedUrl,
        category: "ai"
      }
    });

    expect(sourceResponse.statusCode).toBe(200);
    expect(sourceResponse.json().sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "AI Daily",
          category: "ai"
        })
      ])
    );

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/news/refresh",
      payload: {
        reason: "test"
      }
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshedNews = refreshResponse.json();
    expect(refreshedNews.items.length).toBeGreaterThan(0);
    expect(refreshedNews.lastSummaryInputItemIds.length).toBeGreaterThan(0);
    const sourceId = refreshedNews.sources[0].id;

    const itemId = refreshedNews.items[0].id;
    const articlesResponse = await app.inject({
      method: "POST",
      url: `/api/news/items/${itemId}/articles`
    });

    expect(articlesResponse.statusCode).toBe(200);
    expect(articlesResponse.json()).toMatchObject({
      itemId,
      articles: [
        expect.objectContaining({
          sourceName: "AI Daily",
          url: articleUrl,
          content: expect.stringContaining("First paragraph from the full article.")
        })
      ]
    });

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/news/sources/${sourceId}`,
      payload: {
        name: "AI Brief",
        enabled: false
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sourceId,
          name: "AI Brief",
          enabled: false
        })
      ])
    );

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

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/news/sources/${sourceId}`
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      sources: [],
      rawItems: [],
      items: []
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

  it("uses a 30-minute default news refresh interval", () => {
    expect(DEFAULT_NEWS_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});
