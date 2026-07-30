import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createControlPlaneStore } from "../store";
import { createMhxyRepository } from "../mhxy-repository";
import { createMhxyService } from "../mhxy-service";
import { createModelSecretsRepository } from "../model-secrets";
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

  it("syncs model settings without API keys and preserves local secret references on import", () => {
    const { dataDir, store, adapters } = fixture();
    const profile = store.getState().modelSettings.profiles[0];
    createModelSecretsRepository(dataDir).save(profile.id, "sk-never-upload-this");
    store.updateModelProfile(profile.id, {
      displayName: "本地模型",
      apiKeyRef: `secret:${profile.id}`
    });

    const records = adapters.models.read();
    const serialized = JSON.stringify([...records]);

    expect(serialized).toContain("本地模型");
    expect(serialized).not.toContain("sk-never-upload-this");
    expect(serialized).not.toContain("apiKeyRef");
    expect(serialized).not.toContain("maskedKey");

    const syncedProfile = records.get(`profile:${profile.id}`)!;
    syncedProfile.displayName = "远端模型";
    adapters.models.write(records);

    const imported = store.getState().modelSettings.profiles.find((item) => item.id === profile.id);
    expect(imported).toMatchObject({
      displayName: "远端模型",
      apiKeyRef: `secret:${profile.id}`
    });

    records.set(`profile:${profile.id}`, { ...syncedProfile, apiKey: "sk-forbidden" });
    expect(() => adapters.models.validate?.(records)).toThrow("不允许同步的字段：apiKey");
  });

  it("round-trips the game creator workspace as one conflict-safe record", () => {
    const { adapters } = fixture();
    const state = {
      version: 1,
      date: "2026-07-30",
      projectId: "game-video-1",
      updatedAt: "2026-07-30T01:00:00.000Z",
      activeStage: "script",
      completedTaskIds: ["brief-audience"],
      checkedQualityIds: [],
      ready: false,
      completedVideos: 2,
      draft: {
        game: "空洞骑士",
        audience: "新玩家",
        format: "5–15 分钟 · B站横版中视频",
        promise: "少走弯路",
        angle: "攻略 / 教学",
        title: "开荒指南",
        coverCopy: "开荒避坑",
        opening: "先看结果",
        outline: "三段结构",
        assetNotes: "",
        editNotes: "",
        tags: "动作游戏",
        publishedUrl: "",
        retrospective: ""
      }
    };

    adapters["game-creator"].write(new Map([["workspace:main", state]]));
    expect(adapters["game-creator"].read().get("workspace:main")).toEqual(state);
    expect(() => adapters["game-creator"].write(new Map([["workspace:other", state]]))).toThrow(
      "必须且只能包含 workspace:main"
    );
    expect(adapters["game-creator"].read().get("workspace:main")).toEqual(state);
  });

  it("round-trips all mhxy repository record categories", () => {
    const { dataDir, adapters } = fixture();
    const repository = createMhxyRepository(dataDir);
    const service = createMhxyService(dataDir);
    service.createTrade({ type: "buy", itemName: "金刚石", quantity: 1, unitPrice: 10, currency: "rmb", occurredAt: "2026-01-01", serverName: "Source", characterName: "Buyer" });
    service.createInventoryTransfer({ scope: "role", characterName: "Buyer", sourceServerName: "Source", targetServerName: "Server", transferCostRmb: 0, occurredAt: "2026-01-02" });
    service.createTrade({ type: "sell", itemName: "金刚石", quantity: 1, unitPrice: 0.01, currency: "gameCoin", rmbPerGameCoinWan: 1, occurredAt: "2026-01-03", serverName: "Server", characterName: "Buyer" });

    const records = adapters.mhxy.read();
    expect([...records.keys()].some((key) => key.startsWith("game-coin-"))).toBe(false);
    records.set("game-coin-purchase:legacy", {
      id: "legacy",
      acquiredAt: "2026-01-01",
      gameCoinAmount: 100,
      rmbCost: 10,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01"
    });
    records.set("game-coin-cashout:legacy", {
      id: "legacy",
      occurredAt: "2026-01-02",
      serverName: "Server",
      characterName: "Buyer",
      gameCoinAmount: 100,
      rmbReceived: 12,
      createdAt: "2026-01-02",
      updatedAt: "2026-01-02"
    });

    repository.writeTrades([]);
    repository.writeInventoryTransfers([]);
    adapters.mhxy.write(records);

    expect(repository.readTrades()).toHaveLength(2);
  });

  it("imports legacy mhxy game coin trades that already have a fixed RMB amount", () => {
    const { dataDir, adapters } = fixture();
    const repository = createMhxyRepository(dataDir);

    adapters.mhxy.write(new Map([[
      "trade:legacy-fixed-rmb-buy",
      {
        id: "legacy-fixed-rmb-buy",
        type: "buy",
        itemName: "Imported Fixed RMB Item",
        quantity: 1,
        unitPrice: 999,
        currency: "gameCoin",
        rmbAmount: 12.34,
        feeRmb: 0,
        occurredAt: "2026-06-01T11:00:00.000Z",
        serverName: "Legacy Server",
        characterName: "Legacy Buyer",
        createdAt: "2026-06-01T11:00:00.000Z",
        updatedAt: "2026-06-01T11:00:00.000Z"
      }
    ]]));

    expect(repository.readTrades()).toContainEqual(expect.objectContaining({
      id: "legacy-fixed-rmb-buy",
      rmbAmount: 12.34
    }));
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
