// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { ChildMealWorkspace } from "./child-meal-page";

const overview = {
  profile: {
    id: "default-child",
    name: "",
    birthDate: "2025-01-22",
    height: "",
    weight: "",
    region: "中国北方",
    premature: false,
    chewingAbility: "",
    allergies: [],
    dislikedFoods: [],
    favoriteFoods: [],
    milkNote: "",
    sleepNote: "",
    wakeTime: "",
    bedtime: "",
    napNote: "",
    householdIngredients: [],
    householdRestrictions: [],
    cookingEquipment: [],
    createdAt: "",
    updatedAt: ""
  },
  childSummary: { birthDate: "2025-01-22", ageText: "1岁4个月", monthAge: 16, stage: "12-24月龄幼儿软饭阶段", importantNotes: [] },
  recentNotes: [],
  todayRecords: [],
  recentRecords: [],
  savedPlans: [],
  historyStats: {
    frequentIngredients30d: [],
    rejectedFoods: [],
    discomfortFoods: [],
    likedFoods: [],
    proteinRotation: [],
    vegetableRotation: [],
    fruitRotation: []
  },
  warnings: []
};

describe("ChildMealWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("loads the default child and completes note, record and plan actions", async () => {
    const createNoteAction = vi.fn().mockResolvedValue({});
    const createRecordAction = vi.fn().mockResolvedValue({});
    const savePlanAction = vi.fn().mockResolvedValue({});
    const plan = {
      childSummary: overview.childSummary,
      planType: "today",
      dateRange: { start: "2026-06-11", end: "2026-06-11" },
      days: [{
        date: "2026-06-11",
        dailyNutritionFocus: "均衡",
        avoidRepeatReason: "轮换蛋白",
        meals: [{
          mealType: "lunch",
          mealName: "番茄鸡肉软饭",
          ingredients: ["番茄", "鸡肉", "米饭"],
          cookingMethods: ["炒"],
          textureAdvice: "切碎",
          simpleSteps: ["炒熟后拌饭"],
          nutritionPurpose: "补充蛋白",
          safetyNotes: ["充分熟透"]
        }],
        cookingOrder: ["先蒸后炒"],
        fruitSuggestion: "蓝莓",
        milkAndWaterNote: "少量多次饮水",
        parentNotes: []
      }],
      weeklyBalanceSummary: { proteinRotation: [], vegetableRotation: [], fruitRotation: [], stapleFoodRotation: [] },
      warnings: [],
      notMedicalAdvice: "本工具只提供日常饮食规划，不替代儿科医生建议。"
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ChildMealWorkspace, {
        fetchAction: vi.fn().mockResolvedValue(overview),
        saveProfileAction: vi.fn().mockResolvedValue(overview),
        createNoteAction,
        deleteNoteAction: vi.fn(),
        createRecordAction,
        deleteRecordAction: vi.fn(),
        generatePlanAction: vi.fn().mockResolvedValue(plan),
        savePlanAction,
        convertMealAction: vi.fn().mockResolvedValue({})
      }));
    });

    expect(container.textContent).toContain("1岁4个月");
    expect(container.textContent).toContain("12-24月龄幼儿软饭阶段");

    await act(async () => {
      const input = container.querySelector('input[name="noteContent"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "最近喜欢鸡蛋羹");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector('form[data-role="note-form"]')?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createNoteAction).toHaveBeenCalled();

    await act(async () => {
      container.querySelector('button[data-action="generate-plan"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("番茄鸡肉软饭");

    await act(async () => {
      container.querySelector('button[data-action="save-plan"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(savePlanAction).toHaveBeenCalledWith(plan);
  });
});
