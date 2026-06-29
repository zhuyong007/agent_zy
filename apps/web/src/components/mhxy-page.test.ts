// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  fetchMhxyDashboard: vi.fn(async () => ({
    trades: [],
    tradeResults: [],
    priceSnapshots: [
      {
        id: "snapshot-1",
        itemName: "高级连击",
        capturedAt: "2026-05-30T04:00:00.000Z",
        serverName: "藏宝阁（兽决）",
        currency: "rmb",
        rmbUnitPrice: 340,
        note: "根据用户提供的藏宝阁价格表图片整理",
        createdAt: "2026-06-28T12:00:00.000Z",
        updatedAt: "2026-06-28T12:00:00.000Z"
      },
      {
        id: "snapshot-2",
        itemName: "高级连击",
        capturedAt: "2026-04-13T04:00:00.000Z",
        serverName: "藏宝阁（兽决）",
        currency: "rmb",
        rmbUnitPrice: 349,
        createdAt: "2026-06-28T12:00:00.000Z",
        updatedAt: "2026-06-28T12:00:00.000Z"
      },
      {
        id: "snapshot-3",
        itemName: "高级连击",
        capturedAt: "2026-01-31T04:00:00.000Z",
        serverName: "藏宝阁（兽决）",
        currency: "rmb",
        rmbUnitPrice: 366,
        createdAt: "2026-06-28T12:00:00.000Z",
        updatedAt: "2026-06-28T12:00:00.000Z"
      },
      {
        id: "snapshot-4",
        itemName: "高级必杀",
        capturedAt: "2026-05-30T04:00:00.000Z",
        serverName: "藏宝阁（兽决）",
        currency: "rmb",
        rmbUnitPrice: 353,
        createdAt: "2026-06-28T12:00:00.000Z",
        updatedAt: "2026-06-28T12:00:00.000Z"
      }
    ],
    inventoryTransfers: [],
    inventoryTargets: [],
    inventory: [
      {
        itemName: "高级连击",
        serverName: "山东2区-水泊梁山",
        characterName: "商人甲",
        quantity: 2,
        inventoryCostRmb: 564,
        averageUnitCostRmb: 282,
        expectedSellServerName: "山东2区-水泊梁山",
        latestRmbUnitPrice: 340,
        valuationSourceName: "藏宝阁（兽决）",
        marketValueRmb: 680,
        unrealizedProfitRmb: 116
      }
    ],
    summary: {
      inventoryCostRmb: 0,
      realizedProfitRmb: 0,
      marketValueRmb: 0,
      unrealizedProfitRmb: 0,
      pendingValuationCount: 0
    },
    assetFlips: [
      {
        id: "asset-1",
        category: "summon",
        name: "须弥画魂",
        buyAt: "2026-06-01T10:00:00.000Z",
        purchaseCurrency: "rmb",
        buyPriceRmb: 1200,
        status: "holding",
        profitRmb: null,
        serverName: "长安城",
        characterName: "商人甲",
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:00:00.000Z"
      },
      {
        id: "asset-2",
        category: "equipment",
        name: "160 项链",
        buyAt: "2026-06-01T10:00:00.000Z",
        purchaseCurrency: "rmb",
        buyPriceRmb: 3000,
        sellAt: "2026-06-03T10:00:00.000Z",
        sellPriceRmb: 3300,
        status: "sold",
        profitRmb: 300,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-03T10:00:00.000Z"
      },
      {
        id: "asset-3",
        category: "role",
        name: "175 大唐官府",
        buyAt: "2026-06-05T10:00:00.000Z",
        purchaseCurrency: "rmb",
        buyPriceRmb: 5000,
        status: "holding",
        profitRmb: null,
        serverName: "长安城",
        characterName: "旧归属",
        createdAt: "2026-06-05T10:00:00.000Z",
        updatedAt: "2026-06-05T10:00:00.000Z"
      }
    ],
    assetFlipSummary: {
      holdingCount: 2,
      soldCount: 1,
      holdingCostRmb: 6200,
      realizedProfitRmb: 300,
      realizedRevenueRmb: 3300
    },
    gameCoinPurchases: [
      {
        id: "coin-1",
        acquiredAt: "2026-06-01T09:00:00.000Z",
        gameCoinAmount: 30_000_000,
        rmbCost: 230,
        remainingGameCoinAmount: 30_000_000,
        remainingRmbCost: 230,
        createdAt: "2026-06-01T09:00:00.000Z",
        updatedAt: "2026-06-01T09:00:00.000Z"
      }
    ],
    gameCoinBalance: {
      gameCoinAmount: 30_000_000,
      rmbCost: 230
    },
    combinedSummary: {
      holdingCostRmb: 6430,
      realizedProfitRmb: 300,
      gameCoinBalanceCostRmb: 230,
      mainLedgerMarketValueRmb: 0,
      mainLedgerUnrealizedProfitRmb: 0
    }
  })),
  createMhxyAssetFlip: vi.fn(async (input) => ({ id: "asset-new", ...input })),
  updateMhxyAssetFlip: vi.fn(),
  deleteMhxyAssetFlip: vi.fn(async (id) => ({ id })),
  createMhxyGameCoinPurchase: vi.fn(async (input) => ({ id: "coin-new", ...input })),
  updateMhxyGameCoinPurchase: vi.fn(),
  deleteMhxyGameCoinPurchase: vi.fn(),
  createMhxyTrade: vi.fn(async (input) => ({ id: "trade-1", ...input })),
  updateMhxyTrade: vi.fn(),
  deleteMhxyTrade: vi.fn(),
  createMhxyPriceSnapshot: vi.fn(),
  deleteMhxyPriceSnapshot: vi.fn(),
  createMhxyInventoryTransfer: vi.fn(),
  updateMhxyInventoryTransfer: vi.fn(),
  deleteMhxyInventoryTransfer: vi.fn(),
  setMhxyInventoryTarget: vi.fn()
}));

vi.mock("./dashboard-page", () => ({
  CommandRail: () => React.createElement("nav"),
  useHomeLayoutPreferences: () => ({ layout: [] }),
  useLiveClock: () => "",
  useThemePreference: () => ["day", vi.fn()]
}));

vi.mock("./data-sync-control", async () => {
  const react = await import("react");
  return {
    DataSyncControl: ({ module }: { module: string }) =>
      react.createElement("div", { "data-sync-module": module })
  };
});

import {
  createMhxyAssetFlip,
  createMhxyPriceSnapshot,
  createMhxyTrade,
  deleteMhxyAssetFlip,
  fetchMhxyDashboard,
  updateMhxyAssetFlip
} from "../api";
import { MhxyPage } from "./mhxy-page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MhxyPage", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderPage() {
    const container = document.createElement("div");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } }
    });
    document.body.appendChild(container);
    await queryClient.prefetchQuery({ queryKey: ["mhxy"], queryFn: fetchMhxyDashboard });
    root = createRoot(container);
    await act(async () => {
      root?.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MhxyPage)
        )
      );
    });
    return container;
  }

  it("shows the mhxy data synchronization control", async () => {
    const container = await renderPage();
    expect(container.querySelector('[data-sync-module="mhxy"]')).not.toBeNull();
    expect(container.textContent).toContain("持有总成本");
    expect(container.textContent).toContain("¥6,430.00");
  });

  function change(input: HTMLInputElement | HTMLSelectElement, value: string) {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function switchTab(container: HTMLElement, label: string) {
    const button = Array.from(container.querySelectorAll(".mhxy-segment button"))
      .find((item) => item.textContent === label);
    expect(button).not.toBeUndefined();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  async function setDetailsOpen(details: HTMLDetailsElement, open: boolean) {
    await act(async () => {
      details.open = open;
      details.dispatchEvent(new Event("toggle"));
    });
  }

  it("separates mhxy workflows into three tabs", async () => {
    const container = await renderPage();
    const labels = Array.from(container.querySelectorAll(".mhxy-segment button"))
      .map((button) => button.textContent);

    expect(labels).toEqual([
      "跨服交易记录",
      "资产交易记录",
      "物价记录"
    ]);
    expect(container.querySelector('[data-form="trade"]')).not.toBeNull();
    expect(container.querySelector('[data-form="price-snapshot"]')).toBeNull();
    expect(container.querySelector('[data-form="asset-flip"]')).toBeNull();

    await switchTab(container, "物价记录");
    expect(container.querySelector('[data-form="price-snapshot"]')).not.toBeNull();
    expect(container.querySelector('[data-form="trade"]')).toBeNull();

    await switchTab(container, "资产交易记录");
    expect(container.querySelector('[data-form="asset-flip"]')).not.toBeNull();
    expect(container.querySelector('[data-form="price-snapshot"]')).toBeNull();
  });

  it("keeps cross-server inventory and activity primary while forms stay collapsed", async () => {
    const container = await renderPage();
    const workspace = container.querySelector("[data-cross-server-workspace]") as HTMLElement;
    expect(workspace).not.toBeNull();
    const actions = Array.from(workspace.querySelectorAll(".mhxy-cross-action")) as HTMLDetailsElement[];
    expect(actions).toHaveLength(2);
    expect(actions.every((details) => details.open === false)).toBe(true);
    expect(actions[0].querySelector('[data-form="trade"]')).not.toBeNull();
    expect(actions[1].querySelector('[data-form="inventory-transfer"]')).not.toBeNull();
    expect(workspace.querySelector("[data-cross-inventory]")).not.toBeNull();
    expect(workspace.querySelector("[data-cross-trades]")).not.toBeNull();
    expect(workspace.querySelector("[data-cross-transfers]")).not.toBeNull();
  });

  it("shows current and target servers separately and explains the market valuation", async () => {
    const container = await renderPage();
    const inventory = container.querySelector("[data-cross-inventory]") as HTMLElement;
    const header = inventory.querySelector(".mhxy-row--head") as HTMLElement;
    const cells = Array.from(header.children).map((cell) => cell.textContent);

    expect(cells).toEqual(["道具", "当前区", "目标区", "数量", "人民币成本", "市场估值"]);
    expect(inventory.textContent).toContain("山东2区-水泊梁山");
    expect(inventory.textContent).toContain("单价 ¥340.00 · 藏宝阁（兽决）");
    expect(inventory.textContent).toContain("¥680.00");
    expect((inventory.querySelector('input[aria-label="高级连击目标区"]') as HTMLInputElement).value)
      .toBe("山东2区-水泊梁山");
  });

  it("keeps asset holdings and sold history primary while the asset editor stays collapsed", async () => {
    const container = await renderPage();
    await switchTab(container, "资产交易记录");
    const workspace = container.querySelector("[data-role-assets-workspace]") as HTMLElement;
    expect(workspace).not.toBeNull();
    const addAsset = workspace.querySelector(".mhxy-asset-add") as HTMLDetailsElement;
    expect(addAsset).not.toBeNull();
    expect(addAsset.open).toBe(false);
    expect(addAsset.querySelector('[data-form="asset-flip"]')).not.toBeNull();
    expect(workspace.querySelector('[aria-label="资产当前库存"]')).not.toBeNull();
    expect(workspace.querySelector('[aria-label="资产交易历史"]')).not.toBeNull();
  });

  it("switches to game coin fields, previews conversion, and submits raw inputs", async () => {
    const container = await renderPage();
    const form = container.querySelector('[data-form="trade"]') as HTMLFormElement;

    await act(async () => {
      change(form.querySelector('[name="type"]') as HTMLSelectElement, "sell");
      change(form.querySelector('[name="currency"]') as HTMLSelectElement, "gameCoin");
      change(form.querySelector('[name="itemName"]') as HTMLInputElement, "金刚石");
      change(form.querySelector('[name="quantity"]') as HTMLInputElement, "2");
      change(form.querySelector('[name="unitPrice"]') as HTMLInputElement, "1000");
      change(form.querySelector('[name="rmbPerGameCoinWan"]') as HTMLInputElement, "0.08");
    });

    expect(container.textContent).toContain("本次交易：2000 万游戏币");
    expect(container.textContent).toContain("折合人民币：160.00 元");
    expect(container.textContent).toContain("固定手续费：8.00 元");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMhxyTrade).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sell",
        currency: "gameCoin",
        itemName: "金刚石",
        quantity: 2,
        unitPrice: 1000,
        rmbPerGameCoinWan: 0.08
      })
    );
    expect(createMhxyTrade).not.toHaveBeenCalledWith(
      expect.objectContaining({ rmbAmount: expect.anything() })
    );
  });

  it("uses the page content area as the scroll container", async () => {
    const container = await renderPage();
    const page = container.querySelector(".mhxy-page") as HTMLElement;

    expect(page).not.toBeNull();
    expect(page.classList.contains("mhxy-page--scrollable")).toBe(true);
  });

  it("requires the historical exchange rate for game coin price snapshots", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const form = container.querySelector('[data-form="price-snapshot"]') as HTMLFormElement;

    await act(async () => {
      change(form.querySelector('[name="currency"]') as HTMLSelectElement, "gameCoin");
    });

    const rate = form.querySelector('[name="rate"]') as HTMLInputElement;
    expect(rate).not.toBeNull();
    expect(rate.required).toBe(true);
    expect(rate.min).toBe("0.000001");
    expect(form.textContent).toContain("当时兑换比例（必填）");
    expect(form.textContent).toContain("用于固定这次商品价值");
  });

  it("keeps price snapshot inputs when the API rejects the submission", async () => {
    vi.mocked(createMhxyPriceSnapshot).mockRejectedValueOnce(new Error("保存失败"));
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const form = container.querySelector('[data-form="price-snapshot"]') as HTMLFormElement;
    const itemName = form.querySelector('[name="itemName"]') as HTMLInputElement;
    const serverName = form.querySelector('[name="serverName"]') as HTMLInputElement;
    const price = form.querySelector('[name="price"]') as HTMLInputElement;

    await act(async () => {
      change(itemName, "金刚石");
      change(serverName, "长安城");
      change(price, "100");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(itemName.value).toBe("金刚石");
    expect(serverName.value).toBe("长安城");
    expect(price.value).toBe("100");
  });

  it("shows the captured date for historical price snapshots", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");

    expect(container.textContent).toContain("高级连击");
    expect(container.textContent).toContain("藏宝阁（兽决）");
    expect(container.textContent).toContain("2026-05-30");
  });

  it("focuses the price workspace on one item's trend and history", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");

    const trend = container.querySelector("[data-price-trend]") as HTMLElement;
    const history = container.querySelector("[data-price-history]") as HTMLElement;
    expect(trend.textContent).toContain("高级连击");
    expect(trend.querySelector("svg")).not.toBeNull();
    expect(history.textContent).toContain("2026-01-31");
    expect(history.textContent).toContain("2026-04-13");
    expect(history.textContent).toContain("2026-05-30");
    expect(history.textContent).not.toContain("¥353.00");
  });

  it("switches the trend and history when selecting another item", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const itemButton = Array.from(container.querySelectorAll("[data-price-item]"))
      .find((button) => button.textContent?.includes("高级必杀"));
    expect(itemButton).not.toBeUndefined();

    await act(async () => {
      itemButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const trend = container.querySelector("[data-price-trend]") as HTMLElement;
    const history = container.querySelector("[data-price-history]") as HTMLElement;
    expect(trend.textContent).toContain("高级必杀");
    expect(history.textContent).toContain("¥353.00");
    expect(history.textContent).not.toContain("¥340.00");
  });

  it("keeps adding a snapshot behind a secondary collapsed action", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");

    const addRecord = container.querySelector(".mhxy-price-add") as HTMLDetailsElement;
    expect(addRecord).not.toBeNull();
    expect(addRecord.open).toBe(false);
    expect(addRecord.textContent).toContain("添加记录");
    expect(addRecord.querySelector('[data-form="price-snapshot"]')).not.toBeNull();
  });

  it("quickly records an RMB snapshot for the active price series", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const quickAdd = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
    await setDetailsOpen(quickAdd, true);
    const form = quickAdd.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;

    expect(form.textContent).toContain("高级连击");
    expect(form.textContent).toContain("藏宝阁（兽决）");
    expect(form.querySelector('[name="itemName"]')).toBeNull();
    expect(form.querySelector('[name="serverName"]')).toBeNull();

    await act(async () => {
      change(form.querySelector('[name="price"]') as HTMLInputElement, "338");
      change(form.querySelector('[name="capturedAt"]') as HTMLInputElement, "2026-06-29T09:30");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMhxyPriceSnapshot).toHaveBeenCalledWith({
      itemName: "高级连击",
      serverName: "藏宝阁（兽决）",
      currency: "rmb",
      rmbUnitPrice: 338,
      capturedAt: "2026-06-29T09:30"
    });
    expect(quickAdd.open).toBe(false);
  });

  it("keeps only the full snapshot entry in the empty price state", async () => {
    const dashboard = await fetchMhxyDashboard();
    vi.mocked(fetchMhxyDashboard).mockResolvedValueOnce({ ...dashboard, priceSnapshots: [] });
    const container = await renderPage();
    await switchTab(container, "物价记录");

    expect(container.querySelector(".mhxy-price-quick-add")).toBeNull();
    expect(container.querySelector(".mhxy-price-add")).not.toBeNull();
  });

  it("requires a rate and quickly records a game coin snapshot", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const quickAdd = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
    await setDetailsOpen(quickAdd, true);
    const form = quickAdd.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;

    await act(async () => {
      change(form.querySelector('[name="currency"]') as HTMLSelectElement, "gameCoin");
    });
    const rate = form.querySelector('[name="rate"]') as HTMLInputElement;
    expect(rate.required).toBe(true);
    expect(rate.min).toBe("0.000001");

    await act(async () => {
      change(form.querySelector('[name="price"]') as HTMLInputElement, "4200");
      change(rate, "0.081");
      change(form.querySelector('[name="capturedAt"]') as HTMLInputElement, "2026-06-29T10:00");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMhxyPriceSnapshot).toHaveBeenCalledWith({
      itemName: "高级连击",
      serverName: "藏宝阁（兽决）",
      currency: "gameCoin",
      gameCoinUnitPriceWan: 4200,
      rmbPerGameCoinWan: 0.081,
      capturedAt: "2026-06-29T10:00"
    });
  });

  it("closes and clears the quick entry when switching the observed item", async () => {
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const quickAdd = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
    await setDetailsOpen(quickAdd, true);
    const oldForm = quickAdd.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;
    await act(async () => {
      change(oldForm.querySelector('[name="price"]') as HTMLInputElement, "999");
    });

    const itemButton = Array.from(container.querySelectorAll("[data-price-item]"))
      .find((button) => button.textContent?.includes("高级必杀"));
    await act(async () => {
      itemButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const switchedQuickAdd = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
    expect(switchedQuickAdd.open).toBe(false);
    await setDetailsOpen(switchedQuickAdd, true);
    const newForm = switchedQuickAdd.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;
    expect(newForm.textContent).toContain("高级必杀");
    expect((newForm.querySelector('[name="price"]') as HTMLInputElement).value).toBe("");
  });

  it("keeps the quick entry open and preserves its price when saving fails", async () => {
    vi.mocked(createMhxyPriceSnapshot).mockRejectedValueOnce(new Error("保存失败"));
    const container = await renderPage();
    await switchTab(container, "物价记录");
    const quickAdd = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
    await setDetailsOpen(quickAdd, true);
    const form = quickAdd.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;
    const price = form.querySelector('[name="price"]') as HTMLInputElement;

    await act(async () => {
      change(price, "337");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(quickAdd.open).toBe(true);
    expect(price.value).toBe("337");
    expect(container.textContent).toContain("保存失败");
  });

  it("shows separate asset inventory and sold history with RMB totals", async () => {
    const container = await renderPage();
    await switchTab(container, "资产交易记录");

    expect(container.textContent).toContain("角色 / 召唤兽 / 装备人民币盈亏");
    expect(container.textContent).toContain("库存价值");
    expect(container.textContent).toContain("总盈亏");
    expect(container.textContent).toContain("¥6,200.00");
    expect(container.textContent).toContain("¥300.00");

    const records = container.querySelector('[aria-label="资产记录"]') as HTMLElement;
    const inventory = container.querySelector('[aria-label="资产当前库存"]') as HTMLElement;
    const history = container.querySelector('[aria-label="资产交易历史"]') as HTMLElement;
    expect(records).not.toBeNull();
    expect(inventory.textContent).toContain("须弥画魂");
    expect(inventory.textContent).toContain("175 大唐官府");
    expect(inventory.textContent).toContain("角色 · 长安城");
    expect(inventory.textContent).not.toContain("160 项链");
    expect(history.textContent).toContain("160 项链");
    expect(history.textContent).toContain("装备 · 未填区服 · 未填归属角色");
    expect(history.textContent).not.toContain("须弥画魂");
    expect(history.textContent).not.toContain("175 大唐官府");

    const category = container.querySelector('[name="category"]') as HTMLSelectElement;
    expect(Array.from(category.options).map((option) => [option.value, option.textContent])).toEqual([
      ["role", "角色"],
      ["summon", "召唤兽"],
      ["equipment", "装备"]
    ]);
    expect((container.querySelector('[name="characterName"]') as HTMLInputElement).parentElement?.textContent)
      .toContain("归属角色");
  });

  it("uses generic empty states for asset records", async () => {
    const dashboard = await fetchMhxyDashboard();
    vi.mocked(fetchMhxyDashboard).mockResolvedValueOnce({
      ...dashboard,
      assetFlips: [],
      assetFlipSummary: {
        ...dashboard.assetFlipSummary,
        holdingCount: 0,
        soldCount: 0,
        holdingCostRmb: 0,
        realizedProfitRmb: 0,
        realizedRevenueRmb: 0
      }
    });
    const container = await renderPage();
    await switchTab(container, "资产交易记录");

    expect(container.textContent).toContain("当前没有持有中的资产。");
    expect(container.textContent).toContain("还没有已售出的资产记录。");
  });

  it("submits asset trades as RMB-only trades", async () => {
    const container = await renderPage();
    await switchTab(container, "资产交易记录");

    const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;
    expect(form.querySelector('[name="purchaseCurrency"]')).toBeNull();
    expect(form.querySelector('[name="gameCoinCost"]')).toBeNull();
    expect(container.querySelector('[data-form="game-coin-purchase"]')).toBeNull();
    await act(async () => {
      change(form.querySelector('[name="category"]') as HTMLSelectElement, "equipment");
      change(form.querySelector('[name="name"]') as HTMLInputElement, "140 鞋子");
      change(form.querySelector('[name="buyPriceRmb"]') as HTMLInputElement, "800");
      change(form.querySelector('[name="sellPriceRmb"]') as HTMLInputElement, "950");
      change(form.querySelector('[name="sellAt"]') as HTMLInputElement, "2026-06-08T10:00");
    });

    expect(container.textContent).toContain("预计盈亏：¥150.00");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMhxyAssetFlip).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "equipment",
        name: "140 鞋子",
        purchaseCurrency: "rmb",
        buyPriceRmb: 800,
        sellPriceRmb: 950,
        sellAt: "2026-06-08T10:00"
      })
    );
    expect(createMhxyAssetFlip).not.toHaveBeenCalledWith(
      expect.objectContaining({ profitRmb: expect.anything() })
    );
  });

  it("hides and clears the owner character when submitting a role asset", async () => {
    const container = await renderPage();
    await switchTab(container, "资产交易记录");
    const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;

    expect(form.textContent).toContain("归属角色");
    await act(async () => {
      change(form.querySelector('[name="characterName"]') as HTMLInputElement, "商人甲");
      change(form.querySelector('[name="category"]') as HTMLSelectElement, "role");
    });

    expect(form.querySelector('[name="characterName"]')).toBeNull();
    await act(async () => {
      change(form.querySelector('[name="name"]') as HTMLInputElement, "175 大唐官府");
      change(form.querySelector('[name="buyPriceRmb"]') as HTMLInputElement, "5000");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createMhxyAssetFlip).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "role",
        name: "175 大唐官府",
        characterName: undefined,
        purchaseCurrency: "rmb",
        buyPriceRmb: 5000
      })
    );
  });

  it("clears stale owner character when saving an existing role asset", async () => {
    const container = await renderPage();
    await switchTab(container, "资产交易记录");
    const row = Array.from(container.querySelectorAll(".mhxy-asset-row"))
      .find((item) => item.textContent?.includes("175 大唐官府")) as HTMLElement;

    await act(async () => {
      Array.from(row.querySelectorAll("button"))
        .find((button) => button.textContent === "编辑")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;
    expect(form.querySelector('[name="characterName"]')).toBeNull();

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(updateMhxyAssetFlip).toHaveBeenCalledWith(
      "asset-3",
      expect.objectContaining({
        category: "role",
        name: "175 大唐官府",
        characterName: undefined
      })
    );
  });

  it("converts persisted UTC timestamps to local datetime inputs when editing", async () => {
    const timezone = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);
    const container = await renderPage();
    await switchTab(container, "资产交易记录");
    const row = Array.from(container.querySelectorAll(".mhxy-asset-row"))
      .find((item) => item.textContent?.includes("须弥画魂")) as HTMLElement;

    await act(async () => {
      Array.from(row.querySelectorAll("button"))
        .find((button) => button.textContent === "编辑")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;
    expect((form.querySelector('[name="buyAt"]') as HTMLInputElement).value).toBe(
      "2026-06-01T18:00"
    );
    timezone.mockRestore();
  });

  it("shows the frozen RMB cost when editing a legacy game coin asset", async () => {
    const dashboard = await fetchMhxyDashboard();
    vi.mocked(fetchMhxyDashboard).mockResolvedValueOnce({
      ...dashboard,
      assetFlips: [
        {
          ...dashboard.assetFlips[0],
          purchaseCurrency: "gameCoin",
          gameCoinCost: 100,
          buyPriceRmb: 10,
          gameCoinAllocations: [
            { gameCoinPurchaseId: "original", gameCoinAmount: 100, rmbCost: 10 }
          ]
        }
      ],
      gameCoinPurchases: [
        {
          id: "earlier",
          acquiredAt: "2026-05-01T10:00:00.000Z",
          gameCoinAmount: 100,
          rmbCost: 20,
          remainingGameCoinAmount: 100,
          remainingRmbCost: 20,
          createdAt: "2026-06-04T10:00:00.000Z",
          updatedAt: "2026-06-04T10:00:00.000Z"
        },
        {
          id: "original",
          acquiredAt: "2026-06-01T10:00:00.000Z",
          gameCoinAmount: 100,
          rmbCost: 10,
          remainingGameCoinAmount: 0,
          remainingRmbCost: 0,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z"
        }
      ]
    });
    const container = await renderPage();
    await switchTab(container, "资产交易记录");
    const row = Array.from(container.querySelectorAll(".mhxy-asset-row"))
      .find((item) => item.textContent?.includes("须弥画魂")) as HTMLElement;

    await act(async () => {
      Array.from(row.querySelectorAll("button"))
        .find((button) => button.textContent === "编辑")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;
    expect((form.querySelector('[name="buyPriceRmb"]') as HTMLInputElement).value).toBe("10");
    expect(form.querySelector('[name="purchaseCurrency"]')).toBeNull();
  });

  it("requires a second click before deleting an asset record", async () => {
    const container = await renderPage();
    await switchTab(container, "资产交易记录");
    const row = Array.from(container.querySelectorAll(".mhxy-asset-row"))
      .find((item) => item.textContent?.includes("须弥画魂")) as HTMLElement;
    const deleteButton = Array.from(row.querySelectorAll("button"))
      .find((button) => button.textContent === "删除") as HTMLButtonElement;

    await act(async () => deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(deleteMhxyAssetFlip).not.toHaveBeenCalled();
    const confirm = Array.from(row.querySelectorAll("button"))
      .find((button) => button.textContent === "确认") as HTMLButtonElement;
    await act(async () => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(deleteMhxyAssetFlip).toHaveBeenCalledWith("asset-1");
  });
});
