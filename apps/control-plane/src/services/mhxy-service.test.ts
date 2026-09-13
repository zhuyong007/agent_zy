import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

  it("imports only the lowest watched CBG price and deduplicates identical daily observations", () => {
    const service = createService();
    service.createPriceSnapshot({
      itemName: "金刚石",
      serverName: "藏宝阁（全部道具）",
      currency: "rmb",
      rmbUnitPrice: 340,
      capturedAt: "2026-08-30T10:00:00.000Z"
    });

    const watchlist = service.getPriceCollectorWatchlist();
    expect(watchlist.priceRule).toBe("lowest");
    expect(watchlist.catalogCount).toBeGreaterThan(50);
    const watchedItem = watchlist.items.find((item) =>
      item.itemName === "金刚石" && item.serverName === "藏宝阁（全部道具）"
    );
    expect(watchedItem).toMatchObject({ latestRmbUnitPrice: 340 });
    const watchKey = watchedItem?.watchKey ?? "";
    const input = {
      sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/query.py?act=query",
      capturedAt: "2026-08-31T02:00:00.000Z",
      records: [{
        watchKey,
        candidates: [
          { rmbPrice: 339, listingId: "listing-high" },
          { rmbPrice: 298.88, listingId: "listing-low" },
          { rmbPrice: 320, listingId: "listing-middle" }
        ]
      }]
    };

    const first = service.importCollectedLowestPrices(input);
    expect(first).toMatchObject({ priceRule: "lowest", importedCount: 1, skippedCount: 0 });
    expect(first.imported[0]).toMatchObject({
      itemName: "金刚石",
      serverName: "藏宝阁（全部道具）",
      currency: "rmb",
      rmbUnitPrice: 298.88,
      capturedAt: "2026-08-31T02:00:00.000Z"
    });
    expect(first.imported[0].note).toContain("浏览器自动采集最低价");
    expect(first.imported[0].note).toContain("样本 3");
    expect(first.imported[0].note).toContain("最低价商品 listing-low");

    const duplicate = service.importCollectedLowestPrices(input);
    expect(duplicate).toMatchObject({ importedCount: 0, skippedCount: 1 });
    expect(duplicate.skipped[0].reason).toBe("duplicate");

    const nextDay = service.importCollectedLowestPrices({
      ...input,
      capturedAt: "2026-09-01T02:00:00.000Z"
    });
    expect(nextDay.importedCount).toBe(1);
    expect(service.getDashboard().priceSnapshots).toHaveLength(3);
  });

  it("uses the maintained price catalog as the collector's only allowlist", () => {
    const service = createService();
    const existing = service.getPriceCatalogItems().find((item) => item.itemName === "炼兽珍经");
    expect(existing).toBeTruthy();

    service.deletePriceCatalogItem(existing!.id);
    expect(service.getPriceCollectorWatchlist().items.some((item) => item.itemName === "炼兽珍经")).toBe(false);
    expect(service.importCollectedLowestPrices({
      sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/query.py?act=query",
      capturedAt: "2026-09-01T03:00:00.000Z",
      records: [{ itemName: "炼兽珍经", candidates: [{ rmbPrice: 38 }] }]
    })).toMatchObject({ importedCount: 0, skippedCount: 1 });

    const created = service.createPriceCatalogItem({
      itemName: "测试灵珠",
      matchNames: ["测试灵珠", "测试珠"],
      matchMode: "exact",
      carryLimit: 12,
      transferLockDays: 30,
      note: "测试道具",
      cbgOverallKindIds: ["998877"]
    });
    service.updatePriceCatalogItem(created.id, { carryLimit: 18, matchMode: "contains" });
    expect(service.getPriceCollectorWatchlist()).toMatchObject({
      catalogCount: expect.any(Number),
      items: expect.arrayContaining([expect.objectContaining({
        itemName: "测试灵珠",
        carryLimit: 18,
        matchMode: "contains",
        allServerSearch: { searchType: "overall_search_equip", kindIds: ["998877"] }
      })])
    });
    expect(service.importCollectedLowestPrices({
      sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/query.py?act=query",
      capturedAt: "2026-09-01T04:00:00.000Z",
      records: [{ itemName: "测试珠", candidates: [{ rmbPrice: 66 }] }]
    })).toMatchObject({
      importedCount: 1,
      imported: [expect.objectContaining({ itemName: "测试灵珠", rmbUnitPrice: 66 })]
    });
  });

  it("creates a new lowest-price series for an item discovered by the record-all button", () => {
    const service = createService();
    const result = service.importCollectedLowestPrices({
      sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/query.py?act=query",
      capturedAt: "2026-09-01T03:00:00.000Z",
      records: [{
        itemName: "神兜兜",
        candidates: [
          { rmbPrice: 99, listingId: "listing-high" },
          { rmbPrice: 88.5, listingId: "listing-low" }
        ]
      }]
    });

    expect(result).toMatchObject({
      importedCount: 1,
      createdSeriesCount: 1,
      imported: [expect.objectContaining({
        itemName: "神兜兜",
        serverName: "藏宝阁（全部道具）",
        rmbUnitPrice: 88.5
      })]
    });
    expect(service.getPriceCollectorWatchlist().items).toContainEqual(expect.objectContaining({
      itemName: "神兜兜",
      latestRmbUnitPrice: 88.5
    }));
  });

  it("keeps one lowest quote per server and exposes flat-transfer comparison data", () => {
    const transferDir = mkdtempSync(join(tmpdir(), "agent-zy-transfer-status-"));
    tempDirs.push(transferDir);
    const databasePath = join(transferDir, "transfer.sqlite3");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE game_servers (
        id INTEGER PRIMARY KEY,
        region_name TEXT NOT NULL,
        server_name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE transfer_snapshots (
        id INTEGER PRIMARY KEY,
        server_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO game_servers (id, region_name, server_name, active) VALUES
        (1, '测试大区', '平转一服', 1),
        (2, '测试大区', '开放二服', 1);
      INSERT INTO transfer_snapshots (server_id, snapshot_date, status) VALUES
        (1, '2026-09-02', 'flat'),
        (2, '2026-09-02', 'open');
    `);
    database.close();
    const previousPath = process.env.MHXY_TRANSFER_DATABASE_PATH;
    process.env.MHXY_TRANSFER_DATABASE_PATH = databasePath;
    try {
      const service = createService(() => new Date("2026-09-02T08:00:00.000Z"));
      const watchKey = service.getPriceCollectorWatchlist().items
        .find((item) => item.itemName === "金刚石")?.watchKey ?? "";
      const imported = service.importCollectedLowestPrices({
        sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_equip",
        capturedAt: "2026-09-02T07:00:00.000Z",
        records: [{
          watchKey,
          candidates: [
            { rmbPrice: 130, serverId: "101", regionName: "测试大区", serverName: "平转一服" },
            { rmbPrice: 118, serverId: "101", regionName: "测试大区", serverName: "平转一服" },
            { rmbPrice: 95, serverId: "102", regionName: "测试大区", serverName: "开放二服" }
          ]
        }]
      });

      expect(imported.importedCount).toBe(2);
      expect(imported.imported).toEqual(expect.arrayContaining([
        expect.objectContaining({ serverName: "平转一服", rmbUnitPrice: 118, transferStatus: "flat" }),
        expect.objectContaining({ serverName: "开放二服", rmbUnitPrice: 95, transferStatus: "open" })
      ]));
      expect(service.getPriceMarket()).toMatchObject({
        itemCount: 1,
        serverCount: 2,
        transferStatusDate: "2026-09-02",
        quotes: expect.arrayContaining([
          expect.objectContaining({ serverName: "平转一服", transferStatus: "flat", rmbUnitPrice: 118 }),
          expect.objectContaining({ serverName: "开放二服", transferStatus: "open", rmbUnitPrice: 95 })
        ])
      });
    } finally {
      if (previousPath === undefined) delete process.env.MHXY_TRANSFER_DATABASE_PATH;
      else process.env.MHXY_TRANSFER_DATABASE_PATH = previousPath;
    }
  });

  it("keeps separate lowest-price series for each 百炼精铁 level and rejects missing levels", () => {
    const service = createService(() => new Date("2026-09-02T08:00:00.000Z"));
    const watchKey = service.getPriceCollectorWatchlist().items
      .find((item) => item.itemName === "百炼精铁")?.watchKey ?? "";

    const result = service.importCollectedLowestPrices({
      sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/equipquery.py?act=show_overall_search_equip",
      capturedAt: "2026-09-02T07:00:00.000Z",
      records: [{
        watchKey,
        candidates: [
          { rmbPrice: 35, itemLevel: 130, serverId: "101", regionName: "测试大区", serverName: "测试一服" },
          { rmbPrice: 30, itemLevel: 130, serverId: "101", regionName: "测试大区", serverName: "测试一服" },
          { rmbPrice: 30, itemLevel: 140, serverId: "101", regionName: "测试大区", serverName: "测试一服" },
          { rmbPrice: 3, serverId: "101", regionName: "测试大区", serverName: "测试一服" }
        ]
      }]
    });

    expect(result).toMatchObject({ importedCount: 2, skippedCount: 1 });
    expect(result.skipped).toContainEqual(expect.objectContaining({ reason: "missing-required-level" }));
    expect(result.imported).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemName: "百炼精铁（130级）", itemLevel: 130, rmbUnitPrice: 30 }),
      expect.objectContaining({ itemName: "百炼精铁（140级）", itemLevel: 140, rmbUnitPrice: 30 })
    ]));
    expect(service.getPriceMarket()).toMatchObject({ itemCount: 2, serverCount: 1 });
    expect(() => service.createPriceSnapshot({
      itemName: "百炼精铁",
      serverName: "测试一服",
      currency: "rmb",
      rmbUnitPrice: 30,
      capturedAt: "2026-09-02T07:00:00.000Z"
    })).toThrow("百炼精铁等级");
  });

  it("rejects role, equipment, pet, and other items outside the transfer-item catalog", () => {
    const service = createService();
    service.createPriceSnapshot({
      itemName: "玉龙",
      serverName: "藏宝阁（全部道具）",
      currency: "rmb",
      rmbUnitPrice: 3.5,
      capturedAt: "2026-08-31T03:00:00.000Z"
    });
    const result = service.importCollectedLowestPrices({
      sourcePageUrl: "https://xyq.cbg.163.com/cgi-bin/query.py?act=recommend_search",
      capturedAt: "2026-09-01T03:00:00.000Z",
      records: [
        { itemName: "13141314", candidates: [{ rmbPrice: 16000 }] },
        { itemName: "玉龙", candidates: [{ rmbPrice: 3.5 }] },
        { itemName: "超级神牛", candidates: [{ rmbPrice: 9999 }] }
      ]
    });

    expect(result).toMatchObject({ importedCount: 0, createdSeriesCount: 0, skippedCount: 3 });
    expect(result.skipped.every((record) => record.reason === "not-allowed")).toBe(true);
    expect(service.getPriceCollectorWatchlist().items.some((record) => record.itemName === "玉龙")).toBe(false);
    expect(service.getDashboard().priceSnapshots).toHaveLength(1);
  });

  it("rejects automatic price imports from non-CBG pages", () => {
    const service = createService();
    service.createPriceSnapshot({
      itemName: "高级连击",
      currency: "rmb",
      rmbUnitPrice: 340,
      capturedAt: "2026-08-30T10:00:00.000Z"
    });
    const watchKey = service.getPriceCollectorWatchlist().items[0].watchKey;

    expect(() => service.importCollectedLowestPrices({
      sourcePageUrl: "https://example.com/fake-price-list",
      capturedAt: "2026-08-31T02:00:00.000Z",
      records: [{ watchKey, candidates: [{ rmbPrice: 1 }] }]
    })).toThrow("只接受梦幻西游藏宝阁页面");
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
        },
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
    expect(service.getDashboard().trades).toContainEqual(expect.objectContaining({
      id: "legacy-fixed-rmb-buy",
      accountingMode: "legacyRate",
      rmbAmount: 12.34
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
