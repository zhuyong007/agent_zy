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

  it("normalizes legacy news data to the AI HOT state shape during load", () => {
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
              category: "ai-products",
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
              category: "ai-products",
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
              category: "ai-products",
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
        newsBodies: [],
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    const store = createControlPlaneStore(dataDir);
    const state = store.getState() as any;

    expect(state.news).toMatchObject({
      feed: {
        items: []
      },
      daily: null,
      dailyArchive: [],
      lastError: null,
      status: "idle"
    });
    expect("newsBodies" in state).toBe(false);
  });

  it("keeps persistent notifications until they are explicitly cancelled", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);

    store.addNotifications([
      {
        id: "history-1",
        kind: "history-post",
        title: "每日历史知识点",
        body: "一条常驻历史推文策划",
        createdAt: "2026-05-07T07:00:00.000Z",
        read: false,
        persistent: true,
        payload: {
          topic: "玄奘取经为什么重要",
          summary: "玄奘西行推动了知识交流。",
          cardCount: 1,
          cards: [
            {
              title: "路线",
              imageText: "从长安到那烂陀",
              prompt: "小红书历史知识卡片"
            }
          ],
          xiaohongshuCaption: "今天讲玄奘西行。",
          generatedAt: "2026-05-07T07:00:00.000Z"
        }
      } as any
    ]);
    store.addNotifications(
      Array.from({ length: 25 }, (_, index) => ({
        id: `normal-${index}`,
        kind: "task-update",
        title: `普通通知 ${index}`,
        body: "普通通知",
        createdAt: `2026-05-07T08:${String(index).padStart(2, "0")}:00.000Z`,
        read: false
      }))
    );

    expect(store.getState().notifications.some((item) => item.id === "history-1")).toBe(true);

    store.cancelNotification("history-1");

    expect(store.getState().notifications.some((item) => item.id === "history-1")).toBe(false);
  });

  it("persists home layout custom names in state.json", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);

    store.setHomeLayout([
      ...store.getState().homeLayout.map((item) =>
        item.id === "news"
          ? {
              ...item,
              customName: "",
              showInNavigation: true
            }
          : item
      )
    ]);

    const reloadedStore = createControlPlaneStore(dataDir);

    expect(reloadedStore.getState().homeLayout.find((item) => item.id === "news")).toMatchObject({
      customName: "",
      showInNavigation: true
    });
  });
});
