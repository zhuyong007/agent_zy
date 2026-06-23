// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  fetchMhxyDashboard: vi.fn(async () => ({
    trades: [],
    tradeResults: [],
    priceSnapshots: [],
    inventoryTransfers: [],
    inventoryTargets: [],
    inventory: [],
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
      }
    ],
    assetFlipSummary: {
      holdingCount: 1,
      soldCount: 1,
      holdingCostRmb: 1200,
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
    }
  })),
  createMhxyAssetFlip: vi.fn(async (input) => ({ id: "asset-new", ...input })),
  updateMhxyAssetFlip: vi.fn(),
  createMhxyGameCoinPurchase: vi.fn(async (input) => ({ id: "coin-new", ...input })),
  updateMhxyGameCoinPurchase: vi.fn(),
  createMhxyTrade: vi.fn(async (input) => ({ id: "trade-1", ...input })),
  updateMhxyTrade: vi.fn(),
  createMhxyPriceSnapshot: vi.fn(),
  createMhxyInventoryTransfer: vi.fn(),
  updateMhxyInventoryTransfer: vi.fn(),
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

import { createMhxyAssetFlip, createMhxyGameCoinPurchase, createMhxyTrade } from "../api";
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
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        React.createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          React.createElement(MhxyPage)
        )
      );
    });
    return container;
  }

  it("shows the mhxy data synchronization control", async () => {
    const container = await renderPage();
    expect(container.querySelector('[data-sync-module="mhxy"]')).not.toBeNull();
  });

  function change(input: HTMLInputElement | HTMLSelectElement, value: string) {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

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

  it("switches to asset flips, shows RMB summary, and submits raw asset inputs", async () => {
    const container = await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll(".mhxy-segment button"))
        .find((button) => button.textContent === "召唤兽装备")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("召唤兽 / 装备人民币盈亏");
    expect(container.textContent).toContain("在手成本");
    expect(container.textContent).toContain("¥1,200.00");
    expect(container.textContent).toContain("¥300.00");
    expect(container.textContent).toContain("须弥画魂");
    expect(container.textContent).toContain("持有中");

    const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;
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
        buyPriceRmb: 800,
        sellPriceRmb: 950,
        sellAt: "2026-06-08T10:00"
      })
    );
    expect(createMhxyAssetFlip).not.toHaveBeenCalledWith(
      expect.objectContaining({ profitRmb: expect.anything() })
    );
  });

  it("uses a historical game coin purchase batch to preview asset RMB cost", async () => {
    const container = await renderPage();
    await act(async () => {
      Array.from(container.querySelectorAll(".mhxy-segment button"))
        .find((button) => button.textContent === "召唤兽装备")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("30,000,000 游戏币");
    expect(container.textContent).toContain("剩余成本");

    const assetForm = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;
    await act(async () => {
      change(assetForm.querySelector('[name="purchaseCurrency"]') as HTMLSelectElement, "gameCoin");
      change(assetForm.querySelector('[name="name"]') as HTMLInputElement, "批次成本装备");
      change(assetForm.querySelector('[name="gameCoinCost"]') as HTMLInputElement, "666666");
    });
    expect(container.textContent).toContain("按历史批次折合：¥5.11");

    await act(async () => {
      assetForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createMhxyAssetFlip).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseCurrency: "gameCoin",
        gameCoinCost: 666_666
      })
    );

    const purchaseForm = container.querySelector('[data-form="game-coin-purchase"]') as HTMLFormElement;
    await act(async () => {
      change(purchaseForm.querySelector('[name="gameCoinAmount"]') as HTMLInputElement, "30000000");
      change(purchaseForm.querySelector('[name="rmbCost"]') as HTMLInputElement, "240");
      purchaseForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createMhxyGameCoinPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ gameCoinAmount: 30_000_000, rmbCost: 240 })
    );
  });
});
