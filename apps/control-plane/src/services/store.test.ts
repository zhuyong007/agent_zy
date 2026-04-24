import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createControlPlaneStore } from "./store";

describe("control-plane store", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, {
        recursive: true,
        force: true
      });
    }
  });

  it("removes legacy placeholder news data during load", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(
      join(dataDir, "state.json"),
      JSON.stringify({
        tasks: [],
        messages: [],
        notifications: [],
        ledger: {
          entries: [],
          modules: []
        },
        schedule: {
          items: [],
          pendingReview: null
        },
        news: {
          items: [
            {
              id: "news-1",
              title: "placeholder",
              summary: "placeholder",
              category: "ai",
              importance: "low",
              sourceCount: 1,
              sources: ["AI Daily"],
              rawItemIds: ["raw-1"],
              updatedAt: "2026-04-23T10:00:00.000Z"
            }
          ],
          rawItems: [
            {
              id: "raw-1",
              sourceId: "source-1",
              sourceName: "AI Daily",
              category: "ai",
              title: "placeholder",
              url: "https://news.example.com/story",
              publishedAt: "2026-04-23T10:00:00.000Z",
              fetchedAt: "2026-04-23T10:05:00.000Z",
              fingerprint: "raw-1"
            }
          ],
          sources: [
            {
              id: "source-1",
              name: "AI Daily",
              url: "data:application/rss+xml;charset=utf-8,placeholder",
              category: "ai",
              enabled: true,
              createdAt: "2026-04-23T08:00:00.000Z"
            }
          ],
          lastFetchedAt: "2026-04-23T10:05:00.000Z",
          lastUpdatedAt: "2026-04-23T10:05:00.000Z",
          lastSummarizedAt: "2026-04-23T10:05:00.000Z",
          lastSummaryInputItemIds: ["raw-1"],
          lastSummaryProvider: "fallback",
          lastSummaryError: null,
          status: "idle"
        },
        newsBodies: [
          {
            rawItemId: "raw-1",
            sourceId: "source-1",
            sourceName: "AI Daily",
            title: "placeholder",
            url: "https://news.example.com/story",
            content: "placeholder body",
            excerpt: "placeholder body",
            fetchedAt: "2026-04-23T10:06:00.000Z",
            status: "ready"
          }
        ],
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    const store = createControlPlaneStore(dataDir);
    const state = store.getState() as any;

    expect(state.news.sources).toHaveLength(0);
    expect(state.news.rawItems).toHaveLength(0);
    expect(state.news.items).toHaveLength(0);
    expect(state.newsBodies).toHaveLength(0);
  });
});
