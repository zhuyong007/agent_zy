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
});
