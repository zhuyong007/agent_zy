import { normalizeModelOutput, parseModelJson } from "@agent-zy/agent-sdk";
import type { ChildMealPlan, ChildSummary } from "@agent-zy/shared-types";
import type { z } from "zod";

import { FORBIDDEN_TERMS, FRUIT_FOODS, PROTEIN_FOODS, STAPLE_FOODS, VEGETABLE_FOODS, feedingStage } from "./constants/nutrition-rules";
export { getSeasonalFoodPool } from "./constants/seasonal-foods";
export * from "./prompts";
export * from "./schemas";
import { mealPlanSchema } from "./schemas";

export function buildChildSummary(birthDate: string, now = new Date()): ChildSummary {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  let monthAge = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();
  if (now.getUTCDate() < birth.getUTCDate()) monthAge -= 1;
  monthAge = Math.max(0, monthAge);
  const years = Math.floor(monthAge / 12);
  const months = monthAge % 12;
  return {
    birthDate,
    ageText: `${years ? `${years}岁` : ""}${months}个月`,
    monthAge,
    stage: feedingStage(monthAge),
    importantNotes: []
  };
}

function includesAny(values: string[], candidates: readonly string[]) {
  return values.some((value) => candidates.some((candidate) => value.includes(candidate)));
}

export function validateMealPlan(plan: ChildMealPlan, context: {
  allergies: string[];
  recentMainDishes: string[];
  recentIngredientCombinations: string[];
  recentlyRejectedFoods?: string[];
}) {
  const issues: string[] = [];
  const allText = JSON.stringify(plan);
  const expectedDays = { today: 1, tomorrow: 1, three_days: 3, seven_days: 7 }[plan.planType];
  if (plan.days.length !== expectedDays) issues.push(`计划类型 ${plan.planType} 必须包含 ${expectedDays} 天食谱`);
  for (const allergy of context.allergies.filter(Boolean)) {
    if (allText.includes(allergy)) issues.push(`食谱包含过敏或不适食材：${allergy}`);
  }
  for (const term of ["药物", "保健品", "补剂", "营养补充剂", "品牌商品"]) {
    if (allText.includes(term)) issues.push(`食谱包含禁忌内容：${term}`);
  }
  for (const day of plan.days) {
    const ingredients = day.meals.flatMap((meal) => meal.ingredients);
    const dishText = day.meals.map((meal) => `${meal.mealName} ${meal.ingredients.join(" ")}`).join(" ");
    for (const term of FORBIDDEN_TERMS.filter((item) => !["药物", "保健品", "补剂", "营养补充剂"].includes(item))) {
      if (dishText.includes(term)) issues.push(`食谱包含禁忌内容：${term}`);
    }
    if (!includesAny(ingredients, STAPLE_FOODS)) issues.push(`${day.date} 缺少主食`);
    if (!includesAny(ingredients, VEGETABLE_FOODS)) issues.push(`${day.date} 缺少蔬菜`);
    if (!includesAny(ingredients, PROTEIN_FOODS)) issues.push(`${day.date} 缺少动物蛋白或蛋类`);
    if (!ingredients.some((item) => /鸡蛋|蛋/.test(item))) issues.push(`${day.date} 缺少蛋类`);
    if (!includesAny([...ingredients, day.fruitSuggestion], FRUIT_FOODS)) issues.push(`${day.date} 缺少水果`);
    for (const meal of day.meals) {
      if (context.recentMainDishes.includes(meal.mealName)) issues.push(`3天内重复主菜：${meal.mealName}`);
      if ((context.recentlyRejectedFoods ?? []).includes(meal.mealName)) issues.push(`拒绝食物未间隔3天：${meal.mealName}`);
      const combo = [...meal.ingredients].sort().join("|");
      if (context.recentIngredientCombinations.includes(combo)) issues.push(`7天内重复食材组合：${meal.mealName}`);
    }
  }
  return [...new Set(issues)];
}

export async function parseMealPlanWithRepair(raw: string, repair: (issues: string) => Promise<string>) {
  const parse = (value: string) => mealPlanSchema.safeParse(normalizeModelOutput(parseModelJson(value) ?? value));
  const first = parse(raw);
  if (first.success) return first.data;
  const second = parse(await repair(first.error.issues.map((issue) => issue.message).join("；")));
  if (!second.success) throw new Error(`食谱生成失败：${second.error.issues.map((issue) => issue.message).join("；")}`);
  return second.data;
}
