// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import type { NewsFeedItem } from "@agent-zy/shared-types";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

import { NewsPanel } from "./components/dashboard-page";

const sampleItems: NewsFeedItem[] = [
  {
    id: "news-1",
    title: "OpenAI 发布新模型",
    titleEn: null,
    url: "https://example.com/news-1",
    source: "AI HOT",
    publishedAt: "2026-05-14T08:00:00.000Z",
    summary: "测试摘要",
    category: "ai-models"
  }
];

describe("NewsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows refresh button and disables it while refreshing", async () => {
    const onRefresh = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(NewsPanel, {
          items: sampleItems,
          updatedAt: "2026-05-14T08:05:00.000Z",
          size: "large",
          filter: "all",
          onFilterChange: () => undefined,
          onRefresh,
          isRefreshing: false,
          refreshError: null
        })
      );
    });

    const refreshButton = container.querySelector('button[aria-label="立即更新 AI 热点"]');

    expect(refreshButton).not.toBeNull();
    expect(refreshButton?.textContent).toBe("立即更新");

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        React.createElement(NewsPanel, {
          items: sampleItems,
          updatedAt: "2026-05-14T08:05:00.000Z",
          size: "large",
          filter: "all",
          onFilterChange: () => undefined,
          onRefresh,
          isRefreshing: true,
          refreshError: null
        })
      );
    });

    const disabledRefreshButton = container.querySelector('button[aria-label="立即更新 AI 热点"]');

    expect(disabledRefreshButton).not.toBeNull();
    expect(disabledRefreshButton?.textContent).toBe("更新中...");
    expect((disabledRefreshButton as HTMLButtonElement | null)?.disabled).toBe(true);
  });

  it("opens news items through the local browser bridge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(NewsPanel, {
          items: sampleItems,
          updatedAt: "2026-05-14T08:05:00.000Z",
          size: "large",
          filter: "all",
          onFilterChange: () => undefined,
          onRefresh: () => undefined,
          isRefreshing: false,
          refreshError: null
        })
      );
    });

    const newsLink = container.querySelector(".news-mini-timeline__item");

    expect(newsLink).not.toBeNull();

    await act(async () => {
      newsLink?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/open-url"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/news-1"
        })
      })
    );
  });
});
