import type { NotificationRecord } from "@agent-zy/shared-types";
import { describe, expect, it } from "vitest";

import {
  buildCaptionExcerpt,
  getHistoryHomePreviewRule,
  getHistoryNotifications,
  isHistoryDynastyPayload
} from "./history-view";

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

  it("does not treat incomplete dynasty payloads as renderable dynasty results", () => {
    const incompletePayload = {
      dynasty: "东汉",
      modules: undefined
    };

    expect(isHistoryDynastyPayload(incompletePayload as never)).toBe(false);
  });

  it("filters incomplete history notifications before the UI renders them", () => {
    const notifications: NotificationRecord[] = [
      {
        id: "bad-dynasty",
        kind: "history-post",
        title: "朝代四件套：东汉",
        body: "旧版异常数据",
        createdAt: "2026-06-03T10:00:00.000Z",
        persistent: true,
        read: false,
        payload: {
          dynasty: "东汉",
          modules: undefined
        } as never
      }
    ];

    expect(getHistoryNotifications(notifications)).toHaveLength(0);
  });
});
