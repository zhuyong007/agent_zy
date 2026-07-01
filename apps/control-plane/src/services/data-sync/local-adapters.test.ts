import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createControlPlaneStore } from "../store";
import { createMhxyRepository } from "../mhxy-repository";
import { createMhxyService } from "../mhxy-service";
import { createLocalDataSyncAdapters } from "./local-adapters";

describe("local data sync adapters", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const projectDir = mkdtempSync(join(tmpdir(), "agent-zy-sync-project-"));
    const dataDir = join(projectDir, ".agent-zy-data");
    roots.push(projectDir);
    const store = createControlPlaneStore(dataDir);
    return { projectDir, dataDir, store, adapters: createLocalDataSyncAdapters({ projectDir, dataDir, store }) };
  }

  it("exports only stable history business data and seeds the local topic archive", () => {
    const { projectDir, dataDir, store, adapters } = fixture();
    mkdirSync(join(projectDir, "data", "history"), { recursive: true });
    writeFileSync(
      join(projectDir, "data", "history", "topic-archive.json"),
      JSON.stringify({ entries: [{ topic: "张骞出使西域", firstGeneratedAt: "2026-01-01", lastGeneratedAt: "2026-01-02", generatedCount: 2 }] })
    );
    const state = store.getState();
    state.notifications = [
      { id: "history-1", kind: "history-post", title: "历史", body: "正文", createdAt: "2026-01-01", read: false, persistent: true },
      { id: "task-1", kind: "task-update", title: "任务", body: "不应同步", createdAt: "2026-01-01", read: false }
    ];
    state.historyXhs = {
      posts: [{ id: "post-1", title: "帖子", publishedAt: null, url: null, views: 1, likes: 2, collects: 3, comments: 4, shares: 5 }],
      overview: { postCount: 1, totalViews: 1, totalLikes: 2, totalCollects: 3, totalComments: 4, totalShares: 5, engagementRate: 14 },
      lastSyncedAt: "2026-01-03",
      status: "failed",
      lastError: "private error",
      sourceUrl: "https://example.com"
    };
    state.historyPush.lastTriggeredDate = "2026-01-03";
    store.replaceState(state);

    const records = adapters.history.read();
    const serialized = JSON.stringify([...records]);

    expect(records.has("notification:history-1")).toBe(true);
    expect(records.has("notification:task-1")).toBe(false);
    expect(records.has("xhs-post:post-1")).toBe(true);
    expect(records.has("topic:张骞出使西域")).toBe(true);
    expect(serialized).not.toContain("private error");
    expect(serialized).not.toContain("lastTriggeredDate");
    expect(existsSync(join(dataDir, "history", "topic-archive.json"))).toBe(true);
  });

  it("exports browser configuration without runs, screenshots, or extracted data", () => {
    const { store, adapters } = fixture();
    const state = store.getState();
    state.browserAutomation = {
      workflows: [{ id: "workflow-1", name: "流程", description: "", enabled: true, steps: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      triggerRules: [{ id: "rule-1", name: "规则", workflowId: "workflow-1", enabled: true, match: {}, createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      runs: [{ id: "run-1", workflowId: "workflow-1", workflowName: "流程", status: "completed", trigger: "user", startedAt: "2026-01-01", finishedAt: "2026-01-01", error: null, logs: [], lastObservation: { url: "https://private.example", title: "私密", text: "secret page", screenshotDataUrl: "data:image/png;base64,secret", capturedAt: "2026-01-01" }, extracted: { token: "secret" } }],
      lastUpdatedAt: "2026-01-01"
    };
    store.replaceState(state);

    const serialized = JSON.stringify([...adapters["browser-automation"].read()]);

    expect(serialized).toContain("workflow-1");
    expect(serialized).toContain("rule-1");
    expect(serialized).not.toContain("run-1");
    expect(serialized).not.toContain("secret page");
  });

  it("round-trips all mhxy repository record categories", () => {
    const { dataDir, adapters } = fixture();
    const repository = createMhxyRepository(dataDir);
    const service = createMhxyService(dataDir);
    const purchase = service.createGameCoinPurchase({ acquiredAt: "2026-01-01", gameCoinAmount: 100, rmbCost: 10 });
    service.createTrade({ type: "buy", itemName: "金刚石", quantity: 1, unitPrice: 10, currency: "rmb", occurredAt: "2026-01-01", serverName: "Source", characterName: "Buyer" });
    service.createInventoryTransfer({ scope: "role", characterName: "Buyer", sourceServerName: "Source", targetServerName: "Server", transferCostRmb: 0, occurredAt: "2026-01-02" });
    service.createTrade({ type: "sell", itemName: "金刚石", quantity: 1, unitPrice: 0.01, currency: "gameCoin", occurredAt: "2026-01-03", serverName: "Server", characterName: "Buyer" });
    const cashout = service.createGameCoinCashout({ occurredAt: "2026-01-04", serverName: "Server", characterName: "Buyer", gameCoinAmount: 100, rmbReceived: 12 });

    const records = adapters.mhxy.read();
    expect(records.has(`game-coin-purchase:${purchase.id}`)).toBe(true);
    expect(records.has(`game-coin-cashout:${cashout.id}`)).toBe(true);

    repository.writeTrades([]);
    repository.writeInventoryTransfers([]);
    repository.writeGameCoinPurchases([]);
    repository.writeGameCoinCashouts([]);
    adapters.mhxy.write(records);

    expect(repository.readTrades()).toHaveLength(2);
    expect(repository.readGameCoinPurchases()).toHaveLength(1);
    expect(repository.readGameCoinCashouts()).toHaveLength(1);
  });

  it("rejects duplicate mhxy record IDs instead of silently dropping data", () => {
    const { dataDir, adapters } = fixture();
    const repository = createMhxyRepository(dataDir);
    const service = createMhxyService(dataDir);
    const snapshot = service.createPriceSnapshot({
      itemName: "金刚石",
      currency: "rmb",
      rmbUnitPrice: 100,
      capturedAt: "2026-01-01"
    });
    repository.writePriceSnapshots([
      snapshot,
      { ...snapshot, itemName: "定魂珠" }
    ]);

    expect(() => adapters.mhxy.read()).toThrow("价格快照存在重复 ID");
  });

  it("rejects unknown snapshot record types before changing local data", () => {
    const { dataDir, adapters } = fixture();
    const repository = createMhxyRepository(dataDir);
    repository.writeTrades([{ id: "trade-1", type: "buy", itemName: "金刚石", quantity: 1, unitPrice: 10, currency: "rmb", occurredAt: "2026-01-01", rmbAmount: 10, feeRmb: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" }]);

    expect(() => adapters.mhxy.write(new Map([["secret:model-key", { id: "model-key" }]]))).toThrow(
      "梦幻西游同步快照包含未知记录类型"
    );
    expect(repository.readTrades()).toHaveLength(1);
  });

  it("rejects semantically invalid mhxy snapshots before replacing local data", () => {
    const { dataDir, adapters } = fixture();
    const repository = createMhxyRepository(dataDir);
    repository.writeTrades([{ id: "trade-1", type: "buy", itemName: "金刚石", quantity: 1, unitPrice: 10, currency: "rmb", occurredAt: "2026-01-01", rmbAmount: 10, feeRmb: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" }]);
    const records = adapters.mhxy.read();
    records.set("trade:trade-2", {
      id: "trade-2",
      type: "sell",
      itemName: "不存在的库存",
      quantity: 1,
      unitPrice: 10,
      currency: "rmb",
      occurredAt: "2026-01-02",
      rmbAmount: 999,
      feeRmb: 0,
      createdAt: "2026-01-02",
      updatedAt: "2026-01-02"
    });

    expect(() => adapters.mhxy.write(records)).toThrow("库存不足");
    expect(repository.readTrades()).toEqual([
      expect.objectContaining({ id: "trade-1", rmbAmount: 10 })
    ]);
  });
});
