import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  UI_ROUTE_COUNT,
  UI_ROUTES,
  UI_TOUCH_TARGET_PX,
  UI_VIEWPORTS,
  shouldCollapseNavigationByDefault
} from "./ui-contract";

describe("UI foundation contract", () => {
  it("covers every registered product route exactly once", () => {
    const paths = UI_ROUTES.map((route) => route.path);

    expect(UI_ROUTE_COUNT).toBe(17);
    expect(paths).toHaveLength(UI_ROUTE_COUNT);
    expect(new Set(paths).size).toBe(UI_ROUTE_COUNT);
    expect(paths).toContain("/");
    expect(paths).toContain("/tools/browser-automation");
  });

  it("keeps the agreed responsive and touch baselines explicit", () => {
    expect(UI_VIEWPORTS.mobile).toEqual({ width: 390, height: 844 });
    expect(UI_VIEWPORTS.desktop).toEqual({ width: 1280, height: 720 });
    expect(UI_TOUCH_TARGET_PX).toBe(44);
    expect(shouldCollapseNavigationByDefault(UI_VIEWPORTS.mobile.width)).toBe(true);
    expect(shouldCollapseNavigationByDefault(UI_VIEWPORTS.desktop.width)).toBe(false);
  });

  it("keeps the AI HOT toolbar and timeline in separate grid rows", () => {
    const newsPage = readFileSync(
      new URL("./components/news-page.tsx", import.meta.url),
      "utf8"
    );
    const foundationStyles = readFileSync(
      new URL("./ui-foundation.css", import.meta.url),
      "utf8"
    );

    expect(newsPage).toContain("news-digest__body--${view}");
    expect(foundationStyles).toMatch(
      /\.news-digest__body--all\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s
    );
    expect(foundationStyles).toMatch(
      /\.news-digest__body--all \.news-digest__toolbar--timeline\s*\{[^}]*min-height:\s*40px/s
    );
  });
});
