import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createControlPlaneApp } from "./app";

describe("mhxy API", () => {
  it("creates recalculated records and returns the RMB dashboard", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      const missingRate = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 1,
          unitPrice: 1000,
          currency: "gameCoin",
          occurredAt: "2026-06-01T10:00:00.000Z"
        }
      });
      expect(missingRate.statusCode).toBe(400);
      expect(missingRate.json().message).toContain("兑换比例");

      const buy = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 2,
          unitPrice: 1000,
          currency: "gameCoin",
          rmbPerGameCoinWan: 0.08,
          rmbAmount: 1,
          feeRmb: 999,
          occurredAt: "2026-06-01T10:00:00.000Z",
          serverName: "长安城",
          characterName: "商人甲"
        }
      });
      expect(buy.statusCode).toBe(200);
      expect(buy.json()).toMatchObject({ rmbAmount: 160, feeRmb: 0 });

      const sell = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "sell",
          itemName: "金刚石",
          quantity: 1,
          unitPrice: 1200,
          currency: "gameCoin",
          rmbPerGameCoinWan: 0.1,
          feeRmb: 0,
          occurredAt: "2026-06-02T10:00:00.000Z",
          serverName: "长安城",
          characterName: "商人甲"
        }
      });
      expect(sell.json()).toMatchObject({ rmbAmount: 120, feeRmb: 6 });

      const invalidEdit = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/trades/${buy.json().id}`,
        payload: { quantity: 0 }
      });
      expect(invalidEdit.statusCode).toBe(400);

      const dashboard = await app.inject({ method: "GET", url: "/api/mhxy" });
      expect(dashboard.statusCode).toBe(200);
      expect(dashboard.json().summary).toMatchObject({
        inventoryCostRmb: 80,
        realizedProfitRmb: 34
      });
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("creates snapshots, transfers, and valuation targets", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 2,
          unitPrice: 100,
          currency: "rmb",
          occurredAt: "2026-06-01T10:00:00.000Z",
          serverName: "长安城",
          characterName: "商人甲"
        }
      });
      const transfer = await app.inject({
        method: "POST",
        url: "/api/mhxy/inventory-transfers",
        payload: {
          itemName: "金刚石",
          quantity: 1,
          sourceServerName: "长安城",
          sourceCharacterName: "商人甲",
          targetServerName: "紫禁城",
          targetCharacterName: "商人乙",
          transferCostRmb: 20,
          occurredAt: "2026-06-02T10:00:00.000Z"
        }
      });
      expect(transfer.statusCode).toBe(200);

      const snapshot = await app.inject({
        method: "POST",
        url: "/api/mhxy/price-snapshots",
        payload: {
          itemName: "金刚石",
          currency: "gameCoin",
          gameCoinUnitPriceWan: 1500,
          rmbPerGameCoinWan: 0.1,
          capturedAt: "2026-06-03T10:00:00.000Z",
          serverName: "紫禁城"
        }
      });
      expect(snapshot.json()).toMatchObject({ rmbUnitPrice: 150 });

      const target = await app.inject({
        method: "PUT",
        url: "/api/mhxy/inventory-targets",
        payload: {
          itemName: "金刚石",
          serverName: "长安城",
          characterName: "商人甲",
          expectedSellServerName: "紫禁城"
        }
      });
      expect(target.statusCode).toBe(200);

      const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
      expect(dashboard.inventory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ serverName: "长安城", marketValueRmb: 150 }),
          expect.objectContaining({ serverName: "紫禁城", marketValueRmb: 150 })
        ])
      );
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("creates and edits RMB-only summon equipment asset flips", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      const missingName = await app.inject({
        method: "POST",
        url: "/api/mhxy/asset-flips",
        payload: {
          category: "summon",
          name: "",
          buyAt: "2026-06-01T10:00:00.000Z",
          buyPriceRmb: 1000
        }
      });
      expect(missingName.statusCode).toBe(400);
      expect(missingName.json().message).toContain("名称不能为空");

      const created = await app.inject({
        method: "POST",
        url: "/api/mhxy/asset-flips",
        payload: {
          category: "equipment",
          name: "160 项链",
          buyAt: "2026-06-01T10:00:00.000Z",
          buyPriceRmb: 3000.236,
          serverName: "长安城"
        }
      });
      expect(created.statusCode).toBe(200);
      expect(created.json()).toMatchObject({
        name: "160 项链",
        buyPriceRmb: 3000.24,
        status: "holding",
        profitRmb: null
      });

      const invalidEdit = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/asset-flips/${created.json().id}`,
        payload: { sellPriceRmb: 3300 }
      });
      expect(invalidEdit.statusCode).toBe(400);
      expect(invalidEdit.json().message).toContain("卖出时间和卖出价格");

      const sold = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/asset-flips/${created.json().id}`,
        payload: {
          sellAt: "2026-06-03T10:00:00.000Z",
          sellPriceRmb: 3300
        }
      });
      expect(sold.json()).toMatchObject({
        status: "sold",
        profitRmb: 299.76
      });

      const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
      expect(dashboard.assetFlips).toHaveLength(1);
      expect(dashboard.assetFlipSummary).toMatchObject({
        holdingCount: 0,
        soldCount: 1,
        holdingCostRmb: 0,
        realizedProfitRmb: 299.76
      });
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("derives asset RMB cost from historical game coin purchase batches", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      const purchase = await app.inject({
        method: "POST",
        url: "/api/mhxy/game-coin-purchases",
        payload: {
          acquiredAt: "2026-06-01T10:00:00.000Z",
          gameCoinAmount: 30_000_000,
          rmbCost: 230
        }
      });
      expect(purchase.statusCode).toBe(200);

      const asset = await app.inject({
        method: "POST",
        url: "/api/mhxy/asset-flips",
        payload: {
          category: "equipment",
          name: "批次成本装备",
          buyAt: "2026-06-02T10:00:00.000Z",
          purchaseCurrency: "gameCoin",
          gameCoinCost: 666_666,
          buyPriceRmb: 999
        }
      });
      expect(asset.statusCode).toBe(200);
      expect(asset.json()).toMatchObject({
        buyPriceRmb: 5.11,
        purchaseCurrency: "gameCoin",
        gameCoinCost: 666_666
      });

      const insufficient = await app.inject({
        method: "POST",
        url: "/api/mhxy/asset-flips",
        payload: {
          category: "summon",
          name: "余额不足召唤兽",
          buyAt: "2026-06-02T11:00:00.000Z",
          purchaseCurrency: "gameCoin",
          gameCoinCost: 30_000_000
        }
      });
      expect(insufficient.statusCode).toBe(400);
      expect(insufficient.json().message).toContain("游戏币余额不足");

      const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
      expect(dashboard.gameCoinBalance).toEqual({
        gameCoinAmount: 29_333_334,
        rmbCost: 224.89
      });
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
