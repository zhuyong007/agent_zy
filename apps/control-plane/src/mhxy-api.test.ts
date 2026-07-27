import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createControlPlaneApp } from "./app";
import { createMhxyService } from "./services/mhxy-service";

describe("mhxy API", () => {
  it("classifies not-found, ledger-conflict, and unexpected errors", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      const missing = await app.inject({
        method: "DELETE",
        url: "/api/mhxy/trades/missing"
      });
      expect(missing.statusCode).toBe(404);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "sell",
          itemName: "不存在的库存",
          quantity: 1,
          unitPrice: 100,
          currency: "rmb",
          occurredAt: "2026-06-01T10:00:00.000Z",
          serverName: "长安城",
          characterName: "商人甲"
        }
      });
      expect(conflict.statusCode).toBe(409);
    } finally {
      await app.close();
    }

    const failingService = createMhxyService(dataDir);
    const failingApp = createControlPlaneApp({
      dataDir,
      startSchedulers: false,
      mhxyService: {
        ...failingService,
        createTrade() {
          throw new Error("unexpected storage failure");
        }
      }
    });
    await failingApp.ready();
    try {
      const unexpected = await failingApp.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 1,
          unitPrice: 100,
          currency: "rmb",
          occurredAt: "2026-06-01T10:00:00.000Z"
        }
      });
      expect(unexpected.statusCode).toBe(500);
      expect(unexpected.json().message).toBe("梦幻西游账本操作失败");
    } finally {
      await failingApp.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

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

      const forged = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 2,
          unitPrice: 80,
          currency: "rmb",
          rmbAmount: 1,
          occurredAt: "2026-06-01T10:00:00.000Z",
          serverName: "长安城",
          characterName: "商人甲"
        }
      });
      expect(forged.statusCode).toBe(400);

      const invalidCurrency = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 1,
          unitPrice: 100,
          currency: "usd",
          occurredAt: "2026-06-01T10:00:00.000Z"
        }
      });
      expect(invalidCurrency.statusCode).toBe(400);

      const buy = await app.inject({
        method: "POST",
        url: "/api/mhxy/trades",
        payload: {
          type: "buy",
          itemName: "金刚石",
          quantity: 2,
          unitPrice: 80,
          currency: "rmb",
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
          unitPrice: 120,
          currency: "rmb",
          feeRmb: 6,
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
          scope: "role",
          characterName: "商人甲",
          sourceServerName: "长安城",
          targetServerName: "紫禁城",
          transferCostRmb: 20,
          occurredAt: "2026-06-02T10:00:00.000Z"
        }
      });
      expect(transfer.statusCode).toBe(200);
      expect(transfer.json()).toMatchObject({
        scope: "role",
        characterName: "商人甲",
        sourceServerName: "长安城",
        targetServerName: "紫禁城"
      });

      const immutableSource = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/inventory-transfers/${transfer.json().id}`,
        payload: { sourceServerName: "建邺城" }
      });
      expect(immutableSource.statusCode).toBe(400);

      const snapshotWithoutRate = await app.inject({
        method: "POST",
        url: "/api/mhxy/price-snapshots",
        payload: {
          itemName: "金刚石",
          currency: "gameCoin",
          gameCoinUnitPriceWan: 1500,
          capturedAt: "2026-06-03T09:00:00.000Z",
          serverName: "紫禁城"
        }
      });
      expect(snapshotWithoutRate.statusCode).toBe(400);
      expect(snapshotWithoutRate.json().message).toContain("当时兑换比例");

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
      expect(dashboard.inventory).toEqual([
        expect.objectContaining({
          serverName: "紫禁城",
          characterName: "商人甲",
          quantity: 2,
          inventoryCostRmb: 200,
          marketValueRmb: 300
        })
      ]);
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
          serverName: "长安城",
          characterName: "商人甲"
        }
      });
      expect(created.statusCode).toBe(200);
      expect(created.json()).toMatchObject({
        name: "160 项链",
        buyPriceRmb: 3000.24,
        serverName: "长安城",
        characterName: "商人甲",
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

      const reopened = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/asset-flips/${created.json().id}`,
        payload: {
          sellAt: null,
          sellPriceRmb: null
        }
      });
      expect(reopened.statusCode).toBe(200);
      expect(reopened.json()).toMatchObject({
        status: "holding",
        profitRmb: null
      });
      expect(reopened.json()).not.toHaveProperty("sellAt");
      expect(reopened.json()).not.toHaveProperty("sellPriceRmb");

      const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
      expect(dashboard.assetFlips).toHaveLength(1);
      expect(dashboard.assetFlipSummary).toMatchObject({
        holdingCount: 1,
        soldCount: 0,
        holdingCostRmb: 3000.24,
        realizedProfitRmb: 0
      });
      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/mhxy/asset-flips/${created.json().id}`
      });
      expect(deleted.statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/mhxy" })).json().assetFlips).toEqual([]);
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("creates, sells, and summarizes role asset flips", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/mhxy/asset-flips",
        payload: {
          category: "role",
          name: "175 大唐官府",
          buyAt: "2026-06-01T10:00:00.000Z",
          buyPriceRmb: 5000,
          serverName: "长安城"
        }
      });
      expect(created.statusCode).toBe(200);
      expect(created.json()).toMatchObject({
        category: "role",
        status: "holding",
        buyPriceRmb: 5000
      });

      const sold = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/asset-flips/${created.json().id}`,
        payload: {
          sellAt: "2026-06-03T10:00:00.000Z",
          sellPriceRmb: 5600
        }
      });
      expect(sold.json()).toMatchObject({ status: "sold", profitRmb: 600 });

      const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
      expect(dashboard.assetFlips).toEqual([
        expect.objectContaining({
          category: "role",
          name: "175 大唐官府",
          status: "sold",
          buyPriceRmb: 5000,
          sellPriceRmb: 5600,
          profitRmb: 600,
          serverName: "长安城"
        })
      ]);
      expect(dashboard.assetFlipSummary).toMatchObject({
        holdingCount: 0,
        soldCount: 1,
        realizedProfitRmb: 600
      });
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("clears stale ownership when changing an asset to a role", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/mhxy/asset-flips",
        payload: {
          category: "equipment",
          name: "转换前装备",
          buyAt: "2026-06-01T10:00:00.000Z",
          buyPriceRmb: 5000,
          serverName: "长安城",
          characterName: "旧归属"
        }
      });
      expect(created.statusCode).toBe(200);
      expect(created.json()).toMatchObject({ characterName: "旧归属" });

      const patched = await app.inject({
        method: "PATCH",
        url: `/api/mhxy/asset-flips/${created.json().id}`,
        payload: { category: "role" }
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ category: "role" });
      expect(patched.json()).not.toHaveProperty("characterName");

      const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
      const saved = dashboard.assetFlips.find((item: { id: string }) => item.id === created.json().id);
      expect(saved).toMatchObject({ category: "role" });
      expect(saved).not.toHaveProperty("characterName");
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("updates and merges isolated price series through the API", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-price-series-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    await app.ready();

    try {
      for (const [itemName, rmbUnitPrice] of [["A", 100], ["B", 200], ["C", 300]] as const) {
        const created = await app.inject({
          method: "POST",
          url: "/api/mhxy/price-snapshots",
          payload: {
            itemName,
            currency: "rmb",
            rmbUnitPrice,
            capturedAt: `2026-06-0${rmbUnitPrice / 100}T10:00:00.000Z`,
            serverName: "长安城"
          }
        });
        expect(created.statusCode).toBe(200);
      }

      const updated = await app.inject({
        method: "PATCH",
        url: "/api/mhxy/price-series",
        payload: {
          current: { itemName: "C", serverName: "长安城" },
          next: { itemName: "D", serverName: "紫禁城" }
        }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        updatedCount: 1,
        targetRecordCount: 0,
        merged: false
      });

      const unconfirmedMerge = await app.inject({
        method: "PATCH",
        url: "/api/mhxy/price-series",
        payload: {
          current: { itemName: "A", serverName: "长安城" },
          next: { itemName: "B", serverName: "长安城" }
        }
      });
      expect(unconfirmedMerge.statusCode).toBe(409);
      expect(unconfirmedMerge.json().message).toContain("确认合并");

      const confirmedMerge = await app.inject({
        method: "PATCH",
        url: "/api/mhxy/price-series",
        payload: {
          current: { itemName: "A", serverName: "长安城" },
          next: { itemName: "B", serverName: "长安城" },
          confirmMerge: true
        }
      });
      expect(confirmedMerge.statusCode).toBe(200);
      expect(confirmedMerge.json()).toMatchObject({
        updatedCount: 1,
        targetRecordCount: 1,
        merged: true
      });

      const blankItemName = await app.inject({
        method: "PATCH",
        url: "/api/mhxy/price-series",
        payload: {
          current: { itemName: "D", serverName: "紫禁城" },
          next: { itemName: "   ", serverName: "紫禁城" }
        }
      });
      expect(blankItemName.statusCode).toBe(400);
      expect(blankItemName.json().message).toContain("道具名不能为空");
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
