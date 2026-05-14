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
      modules: ["工作", "生活"]
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
    taskId: "task-ledger-1",
    trigger: "user",
    message,
    requestedAt: "2026-05-14T10:30:00.000Z",
    state: createState()
  };
}

describe("ledger agent", () => {
  it("returns parsed ledger metadata without creating legacy entries", async () => {
    const result = await agent.execute(createRequest("昨天和老婆吃火锅花了 280"));

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("280");
    expect(result.metadata?.ledger?.fact).toMatchObject({
      sourceType: "chat",
      rawText: "昨天和老婆吃火锅花了 280",
      normalizedText: "昨天和老婆吃火锅花了 280",
      direction: "expense",
      amountCents: 28000,
      currency: "CNY",
      recordedAt: "2026-05-14T10:30:00.000Z",
      taskId: "task-ledger-1",
      status: "confirmed"
    });
    expect(result.metadata?.ledger?.semantic).toMatchObject({
      factId: result.metadata?.ledger?.fact?.id,
      primaryCategory: "餐饮",
      secondaryCategories: ["火锅"],
      people: ["老婆"],
      confidence: 0.86,
      parserVersion: "rule-parser-v1"
    });
    expect(result.domainUpdates?.ledger?.entries).toEqual([]);
  });

  it("asks for amount when parser cannot find one", async () => {
    const result = await agent.execute(createRequest("昨天和老婆吃火锅"));

    expect(result.status).toBe("waiting_feedback");
    expect(result.summary).toContain("缺少金额");
    expect(result.assistantMessage).toContain("多少钱");
    expect(result.metadata?.ledger?.draft).toMatchObject({
      issues: ["amount_missing"],
      fact: {
        direction: "expense"
      },
      semantic: {
        primaryCategory: "餐饮",
        people: ["老婆"],
        scene: "火锅"
      }
    });
    expect(result.metadata?.ledger?.draft?.fact.occurredAt.startsWith("2026-05-13")).toBe(true);
    expect(result.domainUpdates?.ledger?.entries).toEqual([]);
  });

  it("records amount-bearing review items with review metadata", async () => {
    const result = await agent.execute(createRequest("转给老婆 200"));

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("待确认");
    expect(result.assistantMessage).toContain("已先记录");
    expect(result.assistantMessage).toContain("待你确认");
    expect(result.metadata?.ledger?.fact).toMatchObject({
      direction: "transfer",
      amountCents: 20000,
      status: "needs_review",
      counterparty: "老婆"
    });
    expect(result.metadata?.ledger?.semantic).toMatchObject({
      factId: result.metadata?.ledger?.fact?.id,
      primaryCategory: "",
      secondaryCategories: [],
      tags: ["needs_review", "direction_unknown"],
      people: ["老婆"],
      confidence: 0.86,
      parserVersion: "rule-parser-v1"
    });
    expect(result.domainUpdates?.ledger?.entries).toEqual([]);
  });

  it("uses transfer wording for confirmed transfer-like records", async () => {
    const result = await agent.execute(createRequest("转账支出 200"));

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("转账");
    expect(result.assistantMessage).toContain("转账");
    expect(result.metadata?.ledger?.fact).toMatchObject({
      direction: "transfer",
      amountCents: 20000,
      status: "confirmed"
    });
  });
});
