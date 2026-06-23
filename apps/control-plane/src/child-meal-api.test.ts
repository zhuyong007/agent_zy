import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";

describe("child meal API", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-child-meal-api-"));
  const modelRuntime = { chat: vi.fn() } as any;
  const app = createControlPlaneApp({ dataDir, startSchedulers: false, modelRuntime });

  beforeAll(async () => app.ready());
  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("supports the profile, note, record, plan and overview workflow", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/tools/child-meal/overview" });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().childSummary).toMatchObject({ birthDate: "2025-01-22" });

    const profile = await app.inject({
      method: "POST",
      url: "/api/tools/child-meal/profile",
      payload: { chewingAbility: "小块", allergies: ["虾"] }
    });
    expect(profile.json().profile).toMatchObject({ chewingAbility: "小块", allergies: ["虾"] });

    const note = await app.inject({
      method: "POST",
      url: "/api/tools/child-meal/notes",
      payload: { content: "最近喜欢吃鸡蛋羹", tags: ["偏好"] }
    });
    expect(note.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: "/api/tools/child-meal/notes",
      payload: { date: "2026-01-01", content: "旧备注", tags: [] }
    });
    const filteredNotes = await app.inject({
      method: "GET",
      url: "/api/tools/child-meal/notes?start=2026-06-01&end=2026-06-30"
    });
    expect(filteredNotes.json().map((item: { content: string }) => item.content)).toEqual(["最近喜欢吃鸡蛋羹"]);
    const emptyNotes = await app.inject({
      method: "GET",
      url: "/api/tools/child-meal/notes?start=2027-01-01&end=2027-01-31"
    });
    expect(emptyNotes.json()).toEqual([]);

    const record = await app.inject({
      method: "POST",
      url: "/api/tools/child-meal/records",
      payload: {
        date: "2026-06-11",
        mealType: "lunch",
        foodName: "番茄牛肉软饭",
        ingredients: ["番茄", "牛肉", "米饭"],
        cookingMethods: ["炒"],
        acceptance: "喜欢"
      }
    });
    expect(record.statusCode).toBe(200);

    const saved = await app.inject({
      method: "POST",
      url: "/api/tools/child-meal/save-plan",
      payload: {
        childSummary: initial.json().childSummary,
        planType: "today",
        dateRange: { start: "2026-06-11", end: "2026-06-11" },
        days: [],
        weeklyBalanceSummary: { proteinRotation: [], vegetableRotation: [], fruitRotation: [], stapleFoodRotation: [] },
        warnings: [],
        notMedicalAdvice: "本工具只提供日常饮食规划，不替代儿科医生建议。"
      }
    });
    expect(saved.statusCode).toBe(200);

    const converted = await app.inject({
      method: "POST",
      url: "/api/tools/child-meal/records/from-plan",
      payload: {
        date: "2026-06-11",
        meal: {
          mealType: "dinner",
          mealName: "南瓜猪肉粥",
          ingredients: ["南瓜", "猪肉", "大米"],
          cookingMethods: ["煮"]
        }
      }
    });
    expect(converted.json().foodName).toBe("南瓜猪肉粥");

    const overview = await app.inject({ method: "GET", url: "/api/tools/child-meal/overview" });
    expect(overview.json().recentNotes).toHaveLength(1);
    expect(overview.json().todayRecords).toHaveLength(2);
    expect(overview.json().savedPlans).toHaveLength(1);
  });
});
