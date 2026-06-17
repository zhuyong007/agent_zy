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
    }
  })),
  createMhxyAssetFlip: vi.fn(async (input) => ({ id: "asset-new", ...input })),
  updateMhxyAssetFlip: vi.fn(),
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

import { createMhxyAssetFlip, createMhxyTrade } from "../api";
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
});
