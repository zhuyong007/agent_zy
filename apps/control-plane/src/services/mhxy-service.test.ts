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
});
