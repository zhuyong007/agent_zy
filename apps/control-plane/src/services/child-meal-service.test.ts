import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createChildMealService } from "./child-meal-service";
import { createControlPlaneStore } from "./store";

describe("child meal service", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function setup(outputs: unknown[] = []) {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-child-meal-"));
    dirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);
    const chat = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()) }));
    const service = createChildMealService({
      store,
      modelRuntime: { chat } as any,
      now: () => new Date("2026-06-11T00:00:00.000Z")
    });
    return { service, store, chat };
  }

  it("initializes the default child profile and recalculates month age", () => {
    const { service } = setup();

    expect(service.getOverview().childSummary).toMatchObject({
      birthDate: "2025-01-22",
      monthAge: 16,
      stage: "12-24月龄幼儿软饭阶段"
    });
  });

  it("persists notes and meal records and derives history statistics", () => {
    const { service, store } = setup();
    service.createNote({ content: "最近喜欢吃鸡蛋羹", tags: ["偏好"] });
    service.createRecord({
      date: "2026-06-11",
      mealType: "lunch",
      foodName: "番茄牛肉软饭",
      ingredients: ["番茄", "牛肉", "米饭"],
      cookingMethods: ["炒"],
      acceptance: "喜欢",
      discomfort: false
    });

    const overview = service.getOverview();
    expect(overview.recentNotes[0].content).toContain("鸡蛋羹");
    expect(overview.historyStats.frequentIngredients30d).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "番茄", count: 1 })
    ]));
    expect(store.getState().childMeal?.records).toHaveLength(1);
  });

  it("retries one invalid generated plan and fails without exposing it", async () => {
    const invalid = { planType: "today" };
    const { service, chat } = setup([invalid, invalid, invalid, invalid]);

    await expect(service.generatePlan({ planType: "today" })).rejects.toThrow("食谱生成失败");
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
