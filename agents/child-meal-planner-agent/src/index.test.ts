import { describe, expect, it } from "vitest";

import {
  buildChildSummary,
  getSeasonalFoodPool,
  mealPlanSchema,
  validateMealPlan
} from "./index";

const validPlan = {
  childSummary: {
    birthDate: "2025-01-22",
    ageText: "1岁4个月",
    monthAge: 16,
    stage: "12-24月龄幼儿软饭阶段",
    importantNotes: []
  },
  planType: "today",
  dateRange: { start: "2026-06-11", end: "2026-06-11" },
  days: [
    {
      date: "2026-06-11",
      dailyNutritionFocus: "均衡摄入",
      avoidRepeatReason: "避开近期牛肉主菜",
      meals: [
        {
          mealType: "breakfast",
          mealName: "鸡蛋蔬菜软面",
          ingredients: ["面条", "鸡蛋", "菠菜"],
          cookingMethods: ["煮"],
          textureAdvice: "剪成小段",
          simpleSteps: ["煮软面条", "加入蛋液和菠菜"],
          nutritionPurpose: "补充主食、蛋类和蔬菜",
          safetyNotes: ["充分煮熟"]
        },
        {
          mealType: "lunch",
          mealName: "番茄鸡肉软饭",
          ingredients: ["米饭", "番茄", "鸡肉"],
          cookingMethods: ["炒", "煮"],
          textureAdvice: "鸡肉切碎",
          simpleSteps: ["炒熟鸡肉番茄", "拌入软饭"],
          nutritionPurpose: "补充主食、动物蛋白和蔬菜",
          safetyNotes: ["少盐"]
        },
        {
          mealType: "dinner",
          mealName: "南瓜猪肉粥",
          ingredients: ["大米", "南瓜", "猪肉"],
          cookingMethods: ["煮"],
          textureAdvice: "煮至软烂",
          simpleSteps: ["全部食材煮软"],
          nutritionPurpose: "补充主食、动物蛋白和蔬菜",
          safetyNotes: ["猪肉熟透"]
        },
        {
          mealType: "snack",
          mealName: "蓝莓酸奶",
          ingredients: ["蓝莓", "原味酸奶"],
          cookingMethods: ["切碎"],
          textureAdvice: "蓝莓压碎",
          simpleSteps: ["蓝莓压碎后拌酸奶"],
          nutritionPurpose: "补充水果和奶类",
          safetyNotes: ["避免整颗蓝莓"]
        }
      ],
      cookingOrder: ["先煮粥", "再处理午餐食材"],
      fruitSuggestion: "蓝莓",
      milkAndWaterNote: "按日常习惯喝奶并少量多次饮水",
      parentNotes: []
    }
  ],
  weeklyBalanceSummary: {
    proteinRotation: ["鸡蛋", "鸡肉", "猪肉"],
    vegetableRotation: ["菠菜", "番茄", "南瓜"],
    fruitRotation: ["蓝莓"],
    stapleFoodRotation: ["面条", "米饭", "大米"]
  },
  warnings: [],
  notMedicalAdvice: "本工具只提供日常饮食规划，不替代儿科医生建议。"
};

describe("child meal planner contract", () => {
  it("calculates complete month age and feeding stage from the current date", () => {
    expect(buildChildSummary("2025-01-22", new Date("2026-06-11T00:00:00.000Z"))).toMatchObject({
      ageText: "1岁4个月",
      monthAge: 16,
      stage: "12-24月龄幼儿软饭阶段"
    });
    expect(buildChildSummary("2025-01-22", new Date("2025-07-21T00:00:00.000Z")).monthAge).toBe(5);
  });

  it("returns the configured northern-China seasonal food pool", () => {
    expect(getSeasonalFoodPool(new Date("2026-06-11T00:00:00.000Z"), "")).toEqual(
      expect.arrayContaining(["西红柿", "冬瓜", "蓝莓", "鸡蛋", "米饭"])
    );
  });

  it("validates the strict meal plan schema and business safety rules", () => {
    const parsed = mealPlanSchema.parse(validPlan);
    expect(validateMealPlan(parsed, {
      allergies: ["虾"],
      recentMainDishes: ["番茄牛肉软饭"],
      recentIngredientCombinations: [],
      recentlyRejectedFoods: []
    })).toEqual([]);

    const unsafe = structuredClone(parsed);
    unsafe.days[0].meals[1].ingredients.push("虾");
    expect(validateMealPlan(unsafe, {
      allergies: ["虾"],
      recentMainDishes: [],
      recentIngredientCombinations: [],
      recentlyRejectedFoods: []
    })).toContain("食谱包含过敏或不适食材：虾");

    const wrongLength = structuredClone(parsed);
    wrongLength.planType = "three_days";
    expect(validateMealPlan(wrongLength, {
      allergies: [],
      recentMainDishes: [],
      recentIngredientCombinations: []
    })).toContain("计划类型 three_days 必须包含 3 天食谱");
  });
});
