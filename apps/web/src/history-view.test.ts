import { describe, expect, it } from "vitest";

import { buildCaptionExcerpt, getHistoryHomePreviewRule } from "./history-view";

describe("history view helpers", () => {
  it("returns distinct preview density for all five home sizes", () => {
    expect(getHistoryHomePreviewRule("max")).toMatchObject({
      visibleCards: 5,
      showPrompts: true,
      showStats: true
    });
    expect(getHistoryHomePreviewRule("large")).toMatchObject({
      visibleCards: 4,
      showCaption: true,
      showPrompts: false
    });
    expect(getHistoryHomePreviewRule("medium")).toMatchObject({
      visibleCards: 3,
      showSummary: true,
      showStats: false
    });
    expect(getHistoryHomePreviewRule("smaller")).toMatchObject({
      visibleCards: 2,
      showCaption: false
    });
    expect(getHistoryHomePreviewRule("small")).toMatchObject({
      visibleCards: 1,
      showSummary: false
    });
  });

  it("truncates long caption copy with an ellipsis", () => {
    expect(buildCaptionExcerpt("1234567890", 6)).toBe("12345…");
    expect(buildCaptionExcerpt("简短文案", 10)).toBe("简短文案");
  });
});
