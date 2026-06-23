import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createMhxyService } from "./mhxy-service";

describe("mhxy service", () => {
  const tempDirs: string[] = [];

  function createService() {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-"));
    tempDirs.push(dataDir);
    return createMhxyService(dataDir);
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

  it("freezes game coin conversion and charges five percent only on game coin sells", () => {
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
      gameCoinAmountWan: 2000,
      rmbAmount: 160,
      feeRmb: 0
    });
    expect(sell).toMatchObject({
      gameCoinAmountWan: 1200,
      rmbAmount: 120,
      feeRmb: 6
    });

    service.createPriceSnapshot({
      itemName: "高级魔兽要诀",
      currency: "gameCoin",
      gameCoinUnitPriceWan: 2000,
      rmbPerGameCoinWan: 0.2,
      capturedAt: "2026-06-03T10:00:00.000Z",
      serverName: "长安城"
    });

    expect(service.getDashboard().tradeResults.at(-1)).toMatchObject({
      netIncomeRmb: 114,
      costBasisRmb: 80,
      realizedProfitRmb: 34
    });
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
      latestRmbUnitPrice: 150,
      marketValueRmb: 300,
      unrealizedProfitRmb: 100,
      expectedSellServerName: "紫禁城"
    });
  });

  it("moves weighted inventory cost and mandatory transfer cost across servers", () => {
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
    service.createInventoryTransfer({
      itemName: "金刚石",
      quantity: 1,
      sourceServerName: "长安城",
      sourceCharacterName: "商人甲",
      targetServerName: "紫禁城",
      targetCharacterName: "商人乙",
      transferCostRmb: 20,
      occurredAt: "2026-06-02T10:00:00.000Z"
    });

    expect(service.getDashboard().inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serverName: "长安城",
          quantity: 1,
          inventoryCostRmb: 100
        }),
        expect.objectContaining({
          serverName: "紫禁城",
          quantity: 1,
          inventoryCostRmb: 120
        })
      ])
    );
  });

  it("rejects missing rates, oversells, and edits that make history invalid without writing", () => {
    const service = createService();

    expect(() =>
      service.createTrade({
        type: "buy",
        itemName: "金刚石",
        quantity: 1,
        unitPrice: 1000,
        currency: "gameCoin",
        occurredAt: "2026-06-01T10:00:00.000Z"
      })
    ).toThrow("游戏币交易必须填写大于 0 的兑换比例");

    const buy = service.createTrade({
      type: "buy",
      itemName: "金刚石",
      quantity: 2,
      unitPrice: 100,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });
    service.createTrade({
      type: "sell",
      itemName: "金刚石",
      quantity: 2,
      unitPrice: 120,
      currency: "rmb",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "长安城",
      characterName: "商人甲"
    });

    expect(() => service.updateTrade(buy.id, { quantity: 1 })).toThrow("库存不足");
    expect(service.getDashboard().trades.find((trade) => trade.id === buy.id)?.quantity).toBe(2);
  });

  it("tracks summon and equipment asset flips with RMB-only holding cost and realized profit", () => {
    const service = createService();

    service.createAssetFlip({
      category: "summon",
      name: "须弥画魂",
      buyAt: "2026-06-01T10:00:00.000Z",
      buyPriceRmb: 1200,
      serverName: "长安城",
      characterName: "商人甲"
    });
    service.createAssetFlip({
      category: "equipment",
      name: "160 项链",
      buyAt: "2026-06-02T10:00:00.000Z",
      buyPriceRmb: 3000,
      sellAt: "2026-06-04T10:00:00.000Z",
      sellPriceRmb: 2800
    });

    const dashboard = service.getDashboard();
    expect(dashboard.assetFlips).toHaveLength(2);
    expect(dashboard.assetFlips.find((item) => item.name === "160 项链")).toMatchObject({
      status: "sold",
      profitRmb: -200
    });
    expect(dashboard.assetFlipSummary).toMatchObject({
      holdingCount: 1,
      soldCount: 1,
      holdingCostRmb: 1200,
      realizedRevenueRmb: 2800,
      realizedProfitRmb: -200
    });
  });

  it("updates a holding asset flip to sold and validates sell fields", () => {
    const service = createService();
    const record = service.createAssetFlip({
      category: "summon",
      name: "力劈童子",
      buyAt: "2026-06-01T10:00:00.000Z",
      buyPriceRmb: 800
    });

    expect(() => service.updateAssetFlip(record.id, { sellPriceRmb: 950 })).toThrow(
      "卖出时间和卖出价格必须同时填写"
    );

    const sold = service.updateAssetFlip(record.id, {
      sellAt: "2026-06-05T10:00:00.000Z",
      sellPriceRmb: 950.235
    });

    expect(sold).toMatchObject({
      status: "sold",
      sellPriceRmb: 950.24,
      profitRmb: 150.24
    });
    expect(service.getDashboard().assetFlipSummary).toMatchObject({
      holdingCount: 0,
      soldCount: 1,
      holdingCostRmb: 0,
      realizedProfitRmb: 150.24
    });
  });

  it("uses the original game coin purchase batch cost instead of a later market rate", () => {
    const service = createService();

    const firstBatch = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 30_000_000,
      rmbCost: 230
    });
    const asset = service.createAssetFlip({
      category: "equipment",
      name: "测试装备",
      buyAt: "2026-06-02T10:00:00.000Z",
      purchaseCurrency: "gameCoin",
      gameCoinCost: 666_666
    });

    expect(asset).toMatchObject({
      purchaseCurrency: "gameCoin",
      gameCoinCost: 666_666,
      buyPriceRmb: 5.11,
      gameCoinAllocations: [
        {
          gameCoinPurchaseId: firstBatch.id,
          gameCoinAmount: 666_666,
          rmbCost: 5.11
        }
      ]
    });

    service.createGameCoinPurchase({
      acquiredAt: "2026-06-03T10:00:00.000Z",
      gameCoinAmount: 30_000_000,
      rmbCost: 240
    });

    const dashboard = service.getDashboard();
    expect(dashboard.assetFlips.find((item) => item.id === asset.id)?.buyPriceRmb).toBe(5.11);
    expect(dashboard.gameCoinBalance).toEqual({
      gameCoinAmount: 59_333_334,
      rmbCost: 464.89
    });
  });

  it("spans FIFO game coin batches and rejects spending more than the historical balance", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 1_000_000,
      rmbCost: 10
    });
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-02T10:00:00.000Z",
      gameCoinAmount: 1_000_000,
      rmbCost: 20
    });

    const asset = service.createAssetFlip({
      category: "summon",
      name: "跨批次召唤兽",
      buyAt: "2026-06-03T10:00:00.000Z",
      purchaseCurrency: "gameCoin",
      gameCoinCost: 1_500_000
    });
    expect(asset.buyPriceRmb).toBe(20);
    expect(asset.gameCoinAllocations).toEqual([
      expect.objectContaining({ gameCoinAmount: 1_000_000, rmbCost: 10 }),
      expect.objectContaining({ gameCoinAmount: 500_000, rmbCost: 10 })
    ]);

    expect(() =>
      service.createAssetFlip({
        category: "equipment",
        name: "余额不足装备",
        buyAt: "2026-06-04T10:00:00.000Z",
        purchaseCurrency: "gameCoin",
        gameCoinCost: 600_000
      })
    ).toThrow("游戏币余额不足");
    expect(service.getDashboard().assetFlips).toHaveLength(1);
  });
});
