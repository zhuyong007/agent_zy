import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createMhxyService } from "./mhxy-service";

describe("mhxy service", () => {
  const tempDirs: string[] = [];

  function createService(now?: () => Date) {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-"));
    tempDirs.push(dataDir);
    return createMhxyService(dataDir, now);
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records RMB buys and calculates moving weighted realized profit", () => {
    const service = createService();

    service.createTrade({
      type: "buy",
      itemName: "金刚石",
      quantity: 2,
      unitPrice: 100,
      currency: "rmb",
      feeRmb: 10,
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });
    service.createTrade({
      type: "buy",
      itemName: "金刚石",
      quantity: 1,
      unitPrice: 180,
      currency: "rmb",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });
    const sell = service.createTrade({
      type: "sell",
      itemName: "金刚石",
      quantity: 1,
      unitPrice: 200,
      currency: "rmb",
      feeRmb: 5,
      occurredAt: "2026-06-03T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });

    expect(sell.rmbAmount).toBe(200);
    expect(service.getDashboard().tradeResults.at(-1)).toMatchObject({
      tradeId: sell.id,
      costBasisRmb: 130,
      netIncomeRmb: 195,
      realizedProfitRmb: 65
    });
    expect(service.getDashboard().inventory).toEqual([
      expect.objectContaining({
        itemName: "金刚石",
        quantity: 2,
        inventoryCostRmb: 260,
        averageUnitCostRmb: 130
      })
    ]);
  });

  it("keeps future trades in history without applying them to the current dashboard", () => {
    const service = createService(() => new Date("2026-06-01T00:00:00.000Z"));
    const future = service.createTrade({
      type: "buy",
      itemName: "未来道具",
      quantity: 1,
      unitPrice: 100,
      currency: "rmb",
      occurredAt: "2026-06-02T00:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });

    const dashboard = service.getDashboard();
    expect(dashboard.trades).toContainEqual(expect.objectContaining({ id: future.id }));
    expect(dashboard.inventory).toEqual([]);
    expect(dashboard.overviewSummary.crossServer.holdingCostRmb).toBe(0);
  });

  it("uses a fixed exchange rate for game coin trades without wallets", () => {
    const service = createService();
    const buy = service.createTrade({
      type: "buy",
      itemName: "高级魔兽要诀",
      quantity: 2,
      unitPrice: 1000,
      currency: "gameCoin",
      rmbPerGameCoinWan: 0.08,
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });
    const sell = service.createTrade({
      type: "sell",
      itemName: "高级魔兽要诀",
      quantity: 1,
      unitPrice: 1200,
      currency: "gameCoin",
      rmbPerGameCoinWan: 0.1,
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });

    expect(buy).toMatchObject({
      accountingMode: "legacyRate",
      gameCoinAmountWan: 2000,
      rmbAmount: 160,
      feeRmb: 0
    });
    expect(sell).toMatchObject({
      accountingMode: "legacyRate",
      gameCoinAmountWan: 1200,
      rmbAmount: 120,
      feeRmb: 0
    });
    expect(service.getDashboard().tradeResults).toContainEqual(expect.objectContaining({
      tradeId: sell.id,
      costBasisRmb: 80,
      netIncomeRmb: 120,
      realizedProfitRmb: 40
    }));
    expect(() => service.createTrade({
      type: "buy",
      itemName: "缺比例",
      quantity: 1,
      unitPrice: 100,
      currency: "gameCoin",
      occurredAt: "2026-06-01T10:00:00.000Z"
    })).toThrow("游戏币交易必须填写大于 0 的兑换比例");
  });

  it("values inventory using the expected sell server latest RMB snapshot", () => {
    const service = createService();

    service.createTrade({
      type: "buy",
      itemName: "金刚石",
      quantity: 2,
      unitPrice: 100,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });
    service.createPriceSnapshot({
      itemName: "金刚石",
      currency: "gameCoin",
      gameCoinUnitPriceWan: 1500,
      rmbPerGameCoinWan: 0.1,
      capturedAt: "2026-06-02T10:00:00.000Z",
      serverName: "紫禁城"
    });
    service.setInventoryTarget({
      itemName: "金刚石",
      serverName: "长安城",
      characterName: "商人甲",
      expectedSellServerName: "紫禁城"
    });

    expect(service.getDashboard().inventory[0]).toMatchObject({
      expectedSellServerName: "紫禁城",
      latestRmbUnitPrice: 150,
      marketValueRmb: 300,
      unrealizedProfitRmb: 100
    });
  });

  it("requires the historical exchange rate for game coin price snapshots", () => {
    const service = createService();

    expect(() => service.createPriceSnapshot({
      itemName: "金刚石",
      currency: "gameCoin",
      gameCoinUnitPriceWan: 1500,
      capturedAt: "2026-06-02T10:00:00.000Z"
    } as never)).toThrow("游戏币价格快照必须填写");
  });

  it("moves every item held by a role without capitalizing the transfer expense", () => {
    const service = createService();
    service.createTrade({
      type: "buy",
      itemName: "高级连击",
      quantity: 1,
      unitPrice: 300,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });
    service.createInventoryTransfer({
      scope: "role",
      characterName: "商人甲",
      sourceServerName: "长安城",
      targetServerName: "紫禁城",
      transferCostRmb: 20,
      occurredAt: "2026-06-02T10:00:00.000Z"
    });

    const dashboard = service.getDashboard();
    expect(dashboard.inventory[0]).toMatchObject({
      itemName: "高级连击",
      serverName: "紫禁城",
      inventoryCostRmb: 300
    });
    expect(dashboard.summary.realizedProfitRmb).toBe(-20);
  });

  it("tracks role, summon, and equipment asset flips with RMB-only profit", () => {
    const service = createService();
    service.createAssetFlip({
      category: "summon",
      name: "须弥画魂",
      buyAt: "2026-06-01T10:00:00.000Z",
      buyPriceRmb: 1200,
      sellAt: "2026-06-03T10:00:00.000Z",
      sellPriceRmb: 1350,
      serverName: "长安城",
      characterName: "商人甲"
    });
    service.createAssetFlip({
      category: "role",
      name: "175 大唐官府",
      buyAt: "2026-06-02T10:00:00.000Z",
      buyPriceRmb: 5000,
      serverName: "紫禁城"
    });

    const dashboard = service.getDashboard();
    expect(dashboard.assetFlipSummary).toMatchObject({
      holdingCount: 1,
      soldCount: 1,
      holdingCostRmb: 5000,
      realizedProfitRmb: 150
    });
    expect(dashboard.assetFlips).toEqual(expect.arrayContaining([
      expect.objectContaining({ purchaseCurrency: "rmb", buyPriceRmb: 1200, profitRmb: 150 }),
      expect.objectContaining({ purchaseCurrency: "rmb", buyPriceRmb: 5000, profitRmb: null })
    ]));
  });

  it("normalizes imported records and rejects semantically invalid data", () => {
    const service = createService();
    service.replaceAllData({
      trades: [
        {
          id: "legacy-buy",
          type: "buy",
          itemName: "Legacy Item",
          quantity: 2,
          unitPrice: 1000,
          currency: "gameCoin",
          rmbPerGameCoinWan: 0.08,
          rmbAmount: 160,
          feeRmb: 0,
          occurredAt: "2026-06-01T10:00:00.000Z",
          serverName: "Legacy Server",
          characterName: "Legacy Buyer",
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z"
        }
      ],
      priceSnapshots: [],
      inventoryTransfers: [],
      inventoryTargets: [],
      assetFlips: []
    });

    expect(service.getDashboard().trades).toContainEqual(expect.objectContaining({
      id: "legacy-buy",
      accountingMode: "legacyRate",
      rmbAmount: 160
    }));
    expect(() => service.replaceAllData({
      trades: [],
      priceSnapshots: [],
      inventoryTransfers: [],
      inventoryTargets: [],
      assetFlips: [
        {
          id: "bad-asset",
          category: "summon",
          name: "",
          buyAt: "2026-06-01T10:00:00.000Z",
          purchaseCurrency: "rmb",
          buyPriceRmb: 100,
          status: "holding",
          profitRmb: null,
          serverName: "长安城",
          characterName: "商人甲",
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z"
        }
      ]
    })).toThrow("名称不能为空");
  });
});
