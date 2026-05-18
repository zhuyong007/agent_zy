import { describe, expect, it } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState } from "@agent-zy/shared-types";

import { agent } from "./index";

function createState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: {
      entries: [],
      modules: []
    },
    schedule: {
      items: [],
      pendingReview: null
    },
    news: {
      feed: {
        count: 0,
        hasNext: false,
        nextCursor: null,
        items: []
      },
      daily: null,
      dailyArchive: [],
      lastFetchedAt: null,
      lastUpdatedAt: null,
      lastError: null,
      status: "idle"
    },
    topics: {
      dimensions: [],
      current: [],
      currentByDimension: [],
      history: [],
      lastGeneratedAt: null,
      status: "idle",
      strategy: "manual-curation",
      lastError: null
    },
    summary: {
      entries: [],
      drafts: [],
      lastUpdatedAt: null,
      settings: {
        defaultSummaryType: "daily"
      }
    },
    historyPush: {
      lastTriggeredDate: null
    },
    nightlyReview: {
      lastTriggeredDate: null
    }
  };
}

function createRequest(message: string): AgentExecutionRequest {
  return {
    taskId: "task-summary-1",
    trigger: "user",
    message,
    requestedAt: "2026-05-18T21:30:00.000Z",
    state: createState()
  };
}

describe("summary agent", () => {
  it("generates a daily summary draft without creating a final summary", async () => {
    const result = await agent.execute(
      createRequest("今天上班很累，晚上研究了一会儿 AI agent，有点进展，但剪视频没动，有点焦虑。")
    );

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("总结草稿");
    expect(result.domainUpdates?.summary?.entries).toHaveLength(0);
    expect(result.domainUpdates?.summary?.drafts).toEqual([
      expect.objectContaining({
        summaryType: "daily",
        rawInput: expect.stringContaining("AI agent"),
        finalSummary: "",
        aiDraft: expect.stringContaining("不是没做事"),
        structuredFields: expect.objectContaining({
          todayEvents: expect.any(Array),
          oneSentenceSummary: expect.any(String),
          tomorrowFocus: expect.any(String)
        }),
        moodTags: expect.arrayContaining(["焦虑"]),
        keywords: expect.arrayContaining(["AI agent"])
      })
    ]);
  });
});
