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

  it("conserves the full inventory cost when selling the entire position", () => {
    const service = createService();
    service.createTrade({
      type: "buy",
      itemName: "尾差测试",
      quantity: 3,
      unitPrice: 0.33,
      feeRmb: 0.01,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z"
    });
    service.createTrade({
      type: "sell",
      itemName: "尾差测试",
      quantity: 3,
      unitPrice: 0,
      currency: "rmb",
      occurredAt: "2026-06-02T10:00:00.000Z"
    });

    expect(service.getDashboard().tradeResults[0]).toMatchObject({
      costBasisRmb: 1,
      realizedProfitRmb: -1
    });
  });

  it("uses wallet cost for new game coin trades and does not add the legacy fee", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-05-31T10:00:00.000Z",
      gameCoinAmount: 20_000_000,
      rmbCost: 160,
      serverName: "长安城",
      characterName: "商人甲"
    });

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
      rmbAmount: null,
      feeRmb: 0
    });

    service.createPriceSnapshot({
      itemName: "高级魔兽要诀",
      currency: "gameCoin",
      gameCoinUnitPriceWan: 2000,
      rmbPerGameCoinWan: 0.2,
      capturedAt: "2026-06-03T10:00:00.000Z",
      serverName: "长安城"
    });

    expect(service.getDashboard().tradeResults).toHaveLength(0);
  });

  it("keeps imported historical rate trades frozen in legacy accounting mode", () => {
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
        },
        {
          id: "legacy-sell",
          type: "sell",
          itemName: "Legacy Item",
          quantity: 1,
          unitPrice: 1200,
          currency: "gameCoin",
          rmbPerGameCoinWan: 0.1,
          rmbAmount: 120,
          feeRmb: 6,
          occurredAt: "2026-06-02T10:00:00.000Z",
          serverName: "Legacy Server",
          characterName: "Legacy Buyer",
          createdAt: "2026-06-02T10:00:00.000Z",
          updatedAt: "2026-06-02T10:00:00.000Z"
        }
      ],
      priceSnapshots: [],
      inventoryTransfers: [],
      inventoryTargets: [],
      assetFlips: [],
      gameCoinPurchases: [],
      gameCoinCashouts: []
    });

    const dashboard = service.getDashboard();
    expect(dashboard.trades).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legacy-buy", accountingMode: "legacyRate", rmbAmount: 160 }),
      expect.objectContaining({ id: "legacy-sell", accountingMode: "legacyRate", feeRmb: 6 })
    ]));
    expect(dashboard.tradeResults).toContainEqual(expect.objectContaining({
      tradeId: "legacy-sell",
      realizedProfitRmb: 34
    }));
    expect(dashboard.gameCoinWallets).toEqual([]);
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
      valuationSourceName: "紫禁城",
      marketValueRmb: 300,
      unrealizedProfitRmb: 100,
      expectedSellServerName: "紫禁城"
    });
  });

  it("falls back to the latest item snapshot when the target server has no dedicated price", () => {
    const service = createService();

    service.createTrade({
      type: "buy",
      itemName: "Advanced Combo",
      quantity: 2,
      unitPrice: 100,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "Current Server",
      characterName: "Trader"
    });
    service.createPriceSnapshot({
      itemName: "Advanced Combo",
      currency: "rmb",
      rmbUnitPrice: 160,
      capturedAt: "2026-05-01T10:00:00.000Z",
      serverName: "Catalog A"
    });
    service.createPriceSnapshot({
      itemName: "Advanced Combo",
      currency: "rmb",
      rmbUnitPrice: 180,
      capturedAt: "2026-06-02T10:00:00.000Z",
      serverName: "Catalog B"
    });
    service.setInventoryTarget({
      itemName: "Advanced Combo",
      serverName: "Current Server",
      characterName: "Trader",
      expectedSellServerName: "Target Server"
    });

    expect(service.getDashboard().inventory[0]).toMatchObject({
      serverName: "Current Server",
      expectedSellServerName: "Target Server",
      latestRmbUnitPrice: 180,
      valuationSourceName: "Catalog B",
      marketValueRmb: 360,
      unrealizedProfitRmb: 160
    });
  });

  it("requires the historical exchange rate for game coin price snapshots", () => {
    const service = createService();

    expect(() =>
      service.createPriceSnapshot({
        itemName: "高级魔兽要诀",
        currency: "gameCoin",
        gameCoinUnitPriceWan: 1500,
        capturedAt: "2026-06-02T10:00:00.000Z",
        serverName: "长安城"
      } as never)
    ).toThrow("必须填写大于 0 的当时兑换比例");

    expect(() =>
      service.createPriceSnapshot({
        itemName: "高级魔兽要诀",
        currency: "gameCoin",
        gameCoinUnitPriceWan: 1500,
        rmbPerGameCoinWan: 0,
        capturedAt: "2026-06-02T10:00:00.000Z",
        serverName: "长安城"
      })
    ).toThrow("必须填写大于 0 的当时兑换比例");
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

  it("rejects unlocated game coin trades, oversells, and invalid historical edits", () => {
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
    ).toThrow("游戏币交易必须填写区服和角色");

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
    expect(dashboard.combinedSummary).toMatchObject({
      holdingCostRmb: 1200,
      realizedProfitRmb: -200
    });
  });

  it("imports role asset flips and reports generic asset errors", () => {
    const service = createService();
    const timestamp = "2026-06-01T10:00:00.000Z";

    service.replaceAllData({
      trades: [],
      priceSnapshots: [],
      inventoryTransfers: [],
      inventoryTargets: [],
      gameCoinPurchases: [],
      assetFlips: [
        {
          id: "role-1",
          category: "role",
          name: "175 龙宫",
          buyAt: timestamp,
          purchaseCurrency: "rmb",
          buyPriceRmb: 4200,
          status: "holding",
          profitRmb: null,
          serverName: "长安城",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ]
    });

    const dashboard = service.getDashboard();
    expect(dashboard.assetFlips).toEqual([
      expect.objectContaining({
        category: "role",
        name: "175 龙宫",
        buyPriceRmb: 4200
      })
    ]);
    expect(dashboard.assetFlipSummary).toMatchObject({
      holdingCount: 1,
      holdingCostRmb: 4200
    });
    expect(() => service.updateAssetFlip("missing", {})).toThrow("资产记录不存在");
    expect(() => service.deleteAssetFlip("missing")).toThrow("资产记录不存在");
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
    expect(() => service.updateAssetFlip(record.id, {
      sellAt: "2026-05-01T10:00:00.000Z",
      sellPriceRmb: 950
    })).toThrow("卖出时间不能早于买入时间");

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

  it("conserves all game coin batch RMB cents across many rounded allocations", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 30_000_000,
      rmbCost: 230
    });
    for (let index = 0; index < 45; index += 1) {
      service.createAssetFlip({
        category: "equipment",
        name: `批次物品 ${index}`,
        buyAt: new Date(Date.UTC(2026, 5, 2, 10, 0, index)).toISOString(),
        purchaseCurrency: "gameCoin",
        gameCoinCost: 666_666
      });
    }

    const dashboard = service.getDashboard();
    const allocated = dashboard.assetFlips.reduce((sum, item) => sum + item.buyPriceRmb, 0);
    expect(Math.round((allocated + dashboard.gameCoinBalance.rmbCost) * 100)).toBe(23_000);
  });

  it("keeps historical game coin batch IDs when an earlier batch is added later", () => {
    const service = createService();
    const originalBatch = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 10
    });
    const asset = service.createAssetFlip({
      category: "summon",
      name: "冻结批次资产",
      buyAt: "2026-06-03T10:00:00.000Z",
      purchaseCurrency: "gameCoin",
      gameCoinCost: 100,
      sellAt: "2026-06-04T10:00:00.000Z",
      sellPriceRmb: 30
    });
    service.createGameCoinPurchase({
      acquiredAt: "2026-05-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 20
    });

    const persisted = service.getDashboard().assetFlips.find((item) => item.id === asset.id);
    expect(persisted).toMatchObject({
      buyPriceRmb: 10,
      profitRmb: 20,
      gameCoinAllocations: [expect.objectContaining({ gameCoinPurchaseId: originalBatch.id })]
    });
  });

  it("keeps the original game coin allocation when editing non-cost asset fields", () => {
    const service = createService();
    const originalBatch = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 10
    });
    const asset = service.createAssetFlip({
      category: "summon",
      name: "编辑后仍冻结成本",
      buyAt: "2026-06-03T10:00:00.000Z",
      purchaseCurrency: "gameCoin",
      gameCoinCost: 100
    });
    service.createGameCoinPurchase({
      acquiredAt: "2026-05-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 20
    });

    const updated = service.updateAssetFlip(asset.id, { note: "只修改备注" });

    expect(updated).toMatchObject({
      buyPriceRmb: 10,
      note: "只修改备注",
      gameCoinAllocations: [expect.objectContaining({ gameCoinPurchaseId: originalBatch.id })]
    });
  });

  it("rejects invalid runtime enums and protects referenced game coin batches from deletion", () => {
    const service = createService();
    expect(() => service.createTrade({
      type: "buy",
      itemName: "异常币种",
      quantity: 1,
      unitPrice: 100,
      currency: "usd",
      occurredAt: "2026-06-01T10:00:00.000Z"
    } as never)).toThrow("交易币种必须是人民币或游戏币");

    const purchase = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 10
    });
    const asset = service.createAssetFlip({
      category: "equipment",
      name: "引用批次",
      buyAt: "2026-06-02T10:00:00.000Z",
      purchaseCurrency: "gameCoin",
      gameCoinCost: 100
    });
    expect(() => service.deleteGameCoinPurchase(purchase.id)).toThrow("游戏币批次不存在");
    service.deleteAssetFlip(asset.id);
    expect(service.deleteGameCoinPurchase(purchase.id)).toEqual({ id: purchase.id });
  });

  it("uses located game coin purchase batches to fund cross-server item buys", () => {
    const service = createService();
    const purchase = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 20_000_000,
      rmbCost: 200,
      serverName: "Source Server",
      characterName: "Buyer"
    });

    const trade = service.createTrade({
      type: "buy",
      itemName: "Advanced Combo",
      quantity: 2,
      unitPrice: 500,
      currency: "gameCoin",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "Source Server",
      characterName: "Buyer"
    });

    expect(purchase).toMatchObject({
      rmbPerGameCoinWan: 0.1,
      serverName: "Source Server",
      characterName: "Buyer"
    });
    expect(trade).toMatchObject({
      accountingMode: "wallet",
      gameCoinAmountWan: 1000,
      rmbAmount: 100,
      effectiveRmbPerGameCoinWan: 0.1,
      gameCoinAllocations: [
        expect.objectContaining({
          gameCoinPurchaseId: purchase.id,
          gameCoinAmount: 10_000_000,
          rmbCost: 100
        })
      ]
    });

    const dashboard = service.getDashboard();
    expect(dashboard.inventory[0]).toMatchObject({ inventoryCostRmb: 100, quantity: 2 });
    expect(dashboard.gameCoinWallets).toContainEqual(
      expect.objectContaining({
        purpose: "procurement",
        serverName: "Source Server",
        characterName: "Buyer",
        gameCoinAmount: 10_000_000,
        rmbCostBasis: 100,
        averageRmbPerGameCoinWan: 0.1
      })
    );
  });

  it("does not let a new trade bypass the wallet by supplying a legacy exchange rate", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 10_000_000,
      rmbCost: 100,
      serverName: "Source Server",
      characterName: "Buyer"
    });

    const trade = service.createTrade({
      type: "buy",
      itemName: "Advanced Combo",
      quantity: 1,
      unitPrice: 500,
      currency: "gameCoin",
      rmbPerGameCoinWan: 999,
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "Source Server",
      characterName: "Buyer"
    });

    expect(trade).toMatchObject({ accountingMode: "wallet", rmbAmount: 50 });
    expect(trade).not.toHaveProperty("rmbPerGameCoinWan");
    expect(service.getDashboard().gameCoinWallets).toContainEqual(expect.objectContaining({
      purpose: "procurement",
      gameCoinAmount: 5_000_000,
      rmbCostBasis: 50
    }));
  });

  it("keeps cross-server allocations reserved when a later asset consumes game coin", () => {
    const service = createService();
    const first = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 10,
      serverName: "Source Server",
      characterName: "Buyer"
    });
    const second = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T11:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 20,
      serverName: "Source Server",
      characterName: "Buyer"
    });
    const trade = service.createTrade({
      type: "buy",
      itemName: "Cross Item",
      quantity: 1,
      unitPrice: 0.01,
      currency: "gameCoin",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "Source Server",
      characterName: "Buyer"
    });

    const asset = service.createAssetFlip({
      category: "equipment",
      name: "Asset Item",
      buyAt: "2026-06-03T10:00:00.000Z",
      purchaseCurrency: "gameCoin",
      gameCoinCost: 100
    });

    expect(trade.gameCoinAllocations).toEqual([
      expect.objectContaining({ gameCoinPurchaseId: first.id, gameCoinAmount: 100 })
    ]);
    expect(asset.gameCoinAllocations).toEqual([
      expect.objectContaining({ gameCoinPurchaseId: second.id, gameCoinAmount: 100, rmbCost: 20 })
    ]);
    expect(service.getDashboard().gameCoinBalance).toEqual({ gameCoinAmount: 0, rmbCost: 0 });
  });

  it("rejects game coin trades whose displayed amount cannot resolve to a positive raw coin", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 100,
      rmbCost: 10,
      serverName: "Source Server",
      characterName: "Buyer"
    });

    expect(() => service.createTrade({
      type: "buy",
      itemName: "Free Item",
      quantity: 1,
      unitPrice: 0.00001,
      currency: "gameCoin",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "Source Server",
      characterName: "Buyer"
    })).toThrow("游戏币数量");
    expect(service.getDashboard().trades).toHaveLength(0);
  });

  it("keeps six decimal precision for game coin exchange rates", () => {
    const service = createService();
    const purchase = service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 30_000_000,
      rmbCost: 230,
      serverName: "Source Server",
      characterName: "Buyer"
    });

    expect(purchase.rmbPerGameCoinWan).toBe(0.076667);
    expect(service.getDashboard().gameCoinWallets[0].averageRmbPerGameCoinWan).toBe(0.076667);
  });

  it("moves transferred item proceeds into liquidation and realizes profit only on cashout", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 20_000_000,
      rmbCost: 200,
      serverName: "Source Server",
      characterName: "Buyer"
    });
    service.createTrade({
      type: "buy",
      itemName: "Advanced Combo",
      quantity: 1,
      unitPrice: 1000,
      currency: "gameCoin",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "Source Server",
      characterName: "Buyer"
    });
    service.createInventoryTransfer({
      itemName: "Advanced Combo",
      quantity: 1,
      sourceServerName: "Source Server",
      sourceCharacterName: "Buyer",
      targetServerName: "Target Server",
      targetCharacterName: "Seller",
      transferCostRmb: 20,
      occurredAt: "2026-06-03T10:00:00.000Z"
    });
    const sale = service.createTrade({
      type: "sell",
      itemName: "Advanced Combo",
      quantity: 1,
      unitPrice: 1200,
      currency: "gameCoin",
      occurredAt: "2026-06-04T10:00:00.000Z",
      serverName: "Target Server",
      characterName: "Seller"
    });

    expect(sale).toMatchObject({
      accountingMode: "wallet",
      gameCoinAmountWan: 1200,
      rmbAmount: null
    });
    expect(service.getDashboard()).toMatchObject({
      summary: { realizedProfitRmb: 0 },
      gameCoinWallets: expect.arrayContaining([
        expect.objectContaining({
          purpose: "liquidation",
          serverName: "Target Server",
          characterName: "Seller",
          gameCoinAmount: 12_000_000,
          rmbCostBasis: 120
        })
      ])
    });

    const cashout = service.createGameCoinCashout({
      occurredAt: "2026-06-05T10:00:00.000Z",
      serverName: "Target Server",
      characterName: "Seller",
      gameCoinAmount: 6_000_000,
      rmbReceived: 90
    });

    expect(cashout).toMatchObject({
      rmbPerGameCoinWan: 0.15,
      costBasisRmb: 60,
      realizedProfitRmb: 30
    });
    expect(service.getDashboard()).toMatchObject({
      summary: { realizedProfitRmb: 30 },
      gameCoinCashoutSummary: { realizedProfitRmb: 30 },
      gameCoinWallets: expect.arrayContaining([
        expect.objectContaining({
          purpose: "liquidation",
          gameCoinAmount: 6_000_000,
          rmbCostBasis: 60
        })
      ])
    });
  });

  it("isolates procurement game coin by server and character", () => {
    const service = createService();
    service.createGameCoinPurchase({
      acquiredAt: "2026-06-01T10:00:00.000Z",
      gameCoinAmount: 10_000_000,
      rmbCost: 100,
      serverName: "Server A",
      characterName: "Buyer A"
    });

    expect(() => service.createTrade({
      type: "buy",
      itemName: "Advanced Combo",
      quantity: 1,
      unitPrice: 500,
      currency: "gameCoin",
      occurredAt: "2026-06-02T10:00:00.000Z",
      serverName: "Server A",
      characterName: "Buyer B"
    })).toThrow("游戏币余额不足");
    expect(service.getDashboard().trades).toHaveLength(0);
  });

  it("splits mixed transferred and direct sale proceeds between both wallets", () => {
    const service = createService();
    service.createTrade({
      type: "buy",
      itemName: "Mixed Item",
      quantity: 1,
      unitPrice: 10,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "Target Server",
      characterName: "Seller"
    });
    service.createTrade({
      type: "buy",
      itemName: "Mixed Item",
      quantity: 1,
      unitPrice: 20,
      currency: "rmb",
      occurredAt: "2026-06-01T11:00:00.000Z",
      serverName: "Source Server",
      characterName: "Buyer"
    });
    service.createInventoryTransfer({
      itemName: "Mixed Item",
      quantity: 1,
      sourceServerName: "Source Server",
      sourceCharacterName: "Buyer",
      targetServerName: "Target Server",
      targetCharacterName: "Seller",
      transferCostRmb: 0,
      occurredAt: "2026-06-02T10:00:00.000Z"
    });
    service.createTrade({
      type: "sell",
      itemName: "Mixed Item",
      quantity: 2,
      unitPrice: 0.02,
      currency: "gameCoin",
      occurredAt: "2026-06-03T10:00:00.000Z",
      serverName: "Target Server",
      characterName: "Seller"
    });

    expect(service.getDashboard().gameCoinWallets).toEqual(expect.arrayContaining([
      expect.objectContaining({ purpose: "liquidation", gameCoinAmount: 200, rmbCostBasis: 20 }),
      expect.objectContaining({ purpose: "procurement", gameCoinAmount: 200, rmbCostBasis: 10 })
    ]));
  });

  it("rejects cashing out more than the liquidation balance without writing", () => {
    const service = createService();
    service.createTrade({
      type: "buy",
      itemName: "Cashout Guard",
      quantity: 1,
      unitPrice: 10,
      currency: "rmb",
      occurredAt: "2026-06-01T10:00:00.000Z",
      serverName: "Source",
      characterName: "Buyer"
    });
    service.createInventoryTransfer({
      itemName: "Cashout Guard",
      quantity: 1,
      sourceServerName: "Source",
      sourceCharacterName: "Buyer",
      targetServerName: "Target",
      targetCharacterName: "Seller",
      transferCostRmb: 0,
      occurredAt: "2026-06-02T10:00:00.000Z"
    });
    service.createTrade({
      type: "sell",
      itemName: "Cashout Guard",
      quantity: 1,
      unitPrice: 0.01,
      currency: "gameCoin",
      occurredAt: "2026-06-03T10:00:00.000Z",
      serverName: "Target",
      characterName: "Seller"
    });

    expect(() => service.createGameCoinCashout({
      occurredAt: "2026-06-04T10:00:00.000Z",
      serverName: "Target",
      characterName: "Seller",
      gameCoinAmount: 101,
      rmbReceived: 12
    })).toThrow("准备卖出的游戏币余额不足");
    expect(service.getDashboard().gameCoinCashouts).toHaveLength(0);
  });

  it("conserves liquidation cost cents across partial and final cashouts", () => {
    const service = createService();
    service.createTrade({ type: "buy", itemName: "Cent Item", quantity: 1, unitPrice: 1, currency: "rmb", occurredAt: "2026-06-01T10:00:00.000Z", serverName: "Source", characterName: "Buyer" });
    service.createInventoryTransfer({ itemName: "Cent Item", quantity: 1, sourceServerName: "Source", sourceCharacterName: "Buyer", targetServerName: "Target", targetCharacterName: "Seller", transferCostRmb: 0, occurredAt: "2026-06-02T10:00:00.000Z" });
    service.createTrade({ type: "sell", itemName: "Cent Item", quantity: 1, unitPrice: 0.0003, currency: "gameCoin", occurredAt: "2026-06-03T10:00:00.000Z", serverName: "Target", characterName: "Seller" });

    const first = service.createGameCoinCashout({ occurredAt: "2026-06-04T10:00:00.000Z", serverName: "Target", characterName: "Seller", gameCoinAmount: 1, rmbReceived: 0.5 });
    const second = service.createGameCoinCashout({ occurredAt: "2026-06-05T10:00:00.000Z", serverName: "Target", characterName: "Seller", gameCoinAmount: 2, rmbReceived: 1 });

    expect(first.costBasisRmb).toBe(0.33);
    expect(second.costBasisRmb).toBe(0.67);
    expect(service.getDashboard().gameCoinCashoutSummary).toMatchObject({
      rmbReceived: 1.5,
      realizedProfitRmb: 0.5
    });
    expect(service.getDashboard().gameCoinWallets.some((wallet) => wallet.purpose === "liquidation")).toBe(false);
  });
});
