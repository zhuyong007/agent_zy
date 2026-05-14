import { describe, expect, it } from "vitest";

import { parseLedgerInput } from "./ledger-parser";

describe("parseLedgerInput", () => {
  const now = new Date("2026-05-14T10:30:00+08:00");

  it("parses expense amount, time, and simple semantic hints", () => {
    const draft = parseLedgerInput("昨天和老婆吃火锅花了 280", now);

    expect(draft.status).toBe("confirmed");
    expect(draft.issues).toEqual([]);
    expect(draft.fact).toMatchObject({
      sourceType: "chat",
      rawText: "昨天和老婆吃火锅花了 280",
      normalizedText: "昨天和老婆吃火锅花了 280",
      direction: "expense",
      amountCents: 28000,
      currency: "CNY",
      status: "confirmed"
    });
    expect(draft.fact.occurredAt.startsWith("2026-05-13")).toBe(true);
    expect(draft.semantic).toMatchObject({
      primaryCategory: "餐饮",
      people: ["老婆"],
      scene: "火锅"
    });
  });

  it("parses income amount and game scene hints", () => {
    const draft = parseLedgerInput("今天梦幻西游卖货赚了 500", now);

    expect(draft.status).toBe("confirmed");
    expect(draft.issues).toEqual([]);
    expect(draft.fact).toMatchObject({
      direction: "income",
      amountCents: 50000,
      status: "confirmed"
    });
    expect(draft.fact.occurredAt.startsWith("2026-05-14")).toBe(true);
    expect(draft.semantic).toMatchObject({
      primaryCategory: "游戏",
      scene: "梦幻西游"
    });
  });

  it("marks missing amount for review", () => {
    const draft = parseLedgerInput("昨天和老婆吃火锅", now);

    expect(draft.status).toBe("needs_review");
    expect(draft.issues).toEqual(["amount_missing"]);
    expect(draft.fact).toMatchObject({
      direction: "expense",
      amountCents: null,
      status: "needs_review"
    });
  });

  it("marks direction-unknown inputs for review instead of confirming expense", () => {
    const draft = parseLedgerInput("转给老婆 200", now);

    expect(draft.status).toBe("needs_review");
    expect(draft.issues).toEqual(["direction_unknown"]);
    expect(draft.fact).toMatchObject({
      direction: null,
      amountCents: 20000,
      status: "needs_review"
    });
  });
});
