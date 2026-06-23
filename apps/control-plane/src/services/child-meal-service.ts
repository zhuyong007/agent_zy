import { nanoid } from "nanoid";

import {
  CHILD_MEAL_SYSTEM_PROMPT,
  buildChildSummary,
  buildJsonRepairPrompt,
  buildMealPlanPrompt,
  getSeasonalFoodPool,
  parseMealPlanWithRepair,
  validateMealPlan
} from "@agent-zy/child-meal-planner-agent";
import type {
  ChildMealAcceptance,
  ChildMealOverview,
  ChildMealPlan,
  ChildMealPlanType,
  ChildMealRecord,
  ChildMealState,
  ChildMealType,
  ChildNote,
  ChildProfile
} from "@agent-zy/shared-types";

import type { ModelRuntime } from "./model-runtime";
import type { ControlPlaneStore } from "./store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(date: Date, count: number) {
  const result = new Date(date);
  result.setDate(result.getDate() - count);
  return localDate(result);
}

const HEALTH_WARNING = /严重过敏|持续腹泻|呕吐|体重异常|便血|呼吸困难/;
const PROTEIN = /鸡肉|猪肉|牛肉|鱼|虾|鸡蛋|蛋|豆腐/;
const VEGETABLE = /菠菜|油菜|番茄|西红柿|黄瓜|冬瓜|南瓜|山药|胡萝卜|白菜|土豆|茄子|西葫芦/;
const FRUIT = /苹果|梨|桃|西瓜|蓝莓|葡萄|橙子|草莓|水果/;

function stats(records: ChildMealRecord[], now: Date) {
  const recent = records.filter((record) => record.date >= daysAgo(now, 30));
  const counts = new Map<string, number>();
  for (const ingredient of recent.flatMap((record) => record.ingredients)) {
    counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
  }
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  return {
    frequentIngredients30d: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    rejectedFoods: unique(recent.filter((record) => record.acceptance === "拒绝" || record.acceptance === "不喜欢").map((record) => record.foodName)),
    discomfortFoods: unique(recent.filter((record) => record.discomfort).flatMap((record) => record.ingredients)),
    likedFoods: unique(recent.filter((record) => record.acceptance === "喜欢").map((record) => record.foodName)),
    proteinRotation: unique(recent.flatMap((record) => record.ingredients.filter((item) => PROTEIN.test(item)))),
    vegetableRotation: unique(recent.flatMap((record) => record.ingredients.filter((item) => VEGETABLE.test(item)))),
    fruitRotation: unique(recent.flatMap((record) => record.ingredients.filter((item) => FRUIT.test(item))))
  };
}

export function createChildMealService(options: {
  store: ControlPlaneStore;
  modelRuntime: ModelRuntime;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());

  function getState(): ChildMealState {
    return options.store.getState().childMeal!;
  }

  function save(state: ChildMealState) {
    return options.store.setChildMealState({ ...state, lastUpdatedAt: now().toISOString() });
  }

  function getOverview(): ChildMealOverview {
    const state = getState();
    const current = now();
    const today = localDate(current);
    const warnings = state.notes.filter((note) => HEALTH_WARNING.test(note.content)).map(() => "近期备注涉及健康风险，建议咨询儿科医生。");
    const discomfort = stats(state.records, current).discomfortFoods;
    if (discomfort.length) warnings.push(`近期不适食材：${discomfort.join("、")}，后续推荐将避开。`);
    return {
      profile: state.profile,
      childSummary: { ...buildChildSummary(state.profile.birthDate, current), importantNotes: warnings },
      recentNotes: state.notes.filter((note) => note.date >= daysAgo(current, 30)).sort((a, b) => b.date.localeCompare(a.date)),
      todayRecords: state.records.filter((record) => record.date === today),
      recentRecords: state.records.filter((record) => record.date >= daysAgo(current, 30)).sort((a, b) => b.date.localeCompare(a.date)),
      savedPlans: state.plans,
      historyStats: stats(state.records, current),
      warnings: [...new Set(warnings)]
    };
  }

  function updateProfile(input: unknown) {
    if (!isRecord(input)) throw new Error("孩子档案格式无效");
    const state = getState();
    const profile: ChildProfile = {
      ...state.profile,
      ...input,
      id: state.profile.id,
      birthDate: text(input.birthDate) || state.profile.birthDate,
      height: text(input.height),
      weight: text(input.weight),
      region: text(input.region) || "中国北方",
      chewingAbility: text(input.chewingAbility),
      allergies: strings(input.allergies),
      dislikedFoods: strings(input.dislikedFoods),
      favoriteFoods: strings(input.favoriteFoods),
      householdIngredients: strings(input.householdIngredients),
      householdRestrictions: strings(input.householdRestrictions),
      cookingEquipment: strings(input.cookingEquipment),
      premature: Boolean(input.premature),
      updatedAt: now().toISOString()
    } as ChildProfile;
    save({ ...state, profile });
    return getOverview();
  }

  function createNote(input: unknown) {
    if (!isRecord(input) || !text(input.content)) throw new Error("备注内容不能为空");
    const state = getState();
    const timestamp = now().toISOString();
    const note: ChildNote = {
      id: `child-note-${nanoid()}`,
      childId: state.profile.id,
      date: text(input.date) || localDate(now()),
      content: text(input.content),
      tags: strings(input.tags),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    save({ ...state, notes: [note, ...state.notes] });
    return note;
  }

  function listNotes(query: Record<string, unknown> = {}) {
    return getState().notes.filter((note) =>
      (!text(query.childId) || note.childId === text(query.childId)) &&
      (!text(query.start) || note.date >= text(query.start)) &&
      (!text(query.end) || note.date <= text(query.end))
    ).sort((a, b) => b.date.localeCompare(a.date));
  }

  function updateNote(id: string, input: unknown) {
    if (!isRecord(input)) throw new Error("备注格式无效");
    const state = getState();
    const current = state.notes.find((note) => note.id === id);
    if (!current) throw new Error("备注不存在");
    const note = { ...current, ...input, content: text(input.content) || current.content, tags: strings(input.tags), updatedAt: now().toISOString() };
    save({ ...state, notes: state.notes.map((item) => item.id === id ? note : item) });
    return note;
  }

  function deleteNote(id: string) {
    const state = getState();
    save({ ...state, notes: state.notes.filter((note) => note.id !== id) });
    return { ok: true as const };
  }

  function createRecord(input: unknown) {
    if (!isRecord(input) || !text(input.foodName)) throw new Error("食物名称不能为空");
    const state = getState();
    const timestamp = now().toISOString();
    const record: ChildMealRecord = {
      id: `meal-record-${nanoid()}`,
      childId: state.profile.id,
      date: text(input.date) || localDate(now()),
      mealType: (text(input.mealType) || "lunch") as ChildMealType,
      foodName: text(input.foodName),
      ingredients: strings(input.ingredients),
      cookingMethods: strings(input.cookingMethods),
      amount: text(input.amount),
      acceptance: (text(input.acceptance) || "一般") as ChildMealAcceptance,
      discomfort: Boolean(input.discomfort),
      note: text(input.note),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    save({ ...state, records: [record, ...state.records] });
    return record;
  }

  function listRecords(query: Record<string, unknown> = {}) {
    return getState().records.filter((record) =>
      (!text(query.childId) || record.childId === text(query.childId)) &&
      (!text(query.start) || record.date >= text(query.start)) &&
      (!text(query.end) || record.date <= text(query.end))
    ).sort((a, b) => b.date.localeCompare(a.date));
  }

  function updateRecord(id: string, input: unknown) {
    if (!isRecord(input)) throw new Error("饮食记录格式无效");
    const state = getState();
    const current = state.records.find((record) => record.id === id);
    if (!current) throw new Error("饮食记录不存在");
    const record: ChildMealRecord = {
      ...current,
      ...input,
      ingredients: Object.hasOwn(input, "ingredients") ? strings(input.ingredients) : current.ingredients,
      cookingMethods: Object.hasOwn(input, "cookingMethods") ? strings(input.cookingMethods) : current.cookingMethods,
      updatedAt: now().toISOString()
    } as ChildMealRecord;
    save({ ...state, records: state.records.map((item) => item.id === id ? record : item) });
    return record;
  }

  function deleteRecord(id: string) {
    const state = getState();
    save({ ...state, records: state.records.filter((record) => record.id !== id) });
    return { ok: true as const };
  }

  async function generatePlan(input: { planType: ChildMealPlanType; userExtraRequest?: string }) {
    const overview = getOverview();
    const state = getState();
    const current = now();
    const recent3 = state.records.filter((record) => record.date >= daysAgo(current, 3));
    const recent7 = state.records.filter((record) => record.date >= daysAgo(current, 7));
    const savedFutureMeals = state.plans
      .filter((plan) => plan.dateRange.end >= localDate(current))
      .flatMap((plan) => plan.days.flatMap((day) => day.meals));
    const validationContext = {
      allergies: [...overview.profile.allergies, ...overview.historyStats.discomfortFoods],
      recentMainDishes: [...recent3.map((record) => record.foodName), ...savedFutureMeals.map((meal) => meal.mealName)],
      recentIngredientCombinations: [...recent7.map((record) => [...record.ingredients].sort().join("|")), ...savedFutureMeals.map((meal) => [...meal.ingredients].sort().join("|"))],
      recentlyRejectedFoods: recent3.filter((record) => record.acceptance === "拒绝" || record.acceptance === "不喜欢").map((record) => record.foodName)
    };

    async function call(validationIssues?: string[]) {
      const response = await options.modelRuntime.chat({
        kind: "chat",
        agentId: "child-meal-planner-agent",
        purpose: "general",
        responseFormat: "json",
        maxTokens: 7000,
        messages: [
          { role: "system", content: CHILD_MEAL_SYSTEM_PROMPT },
          { role: "user", content: buildMealPlanPrompt({
            currentDate: localDate(current),
            profile: overview.profile,
            childSummary: overview.childSummary,
            notes: overview.recentNotes,
            recentRecords: overview.recentRecords,
            frequentIngredients: overview.historyStats.frequentIngredients30d,
            savedPlans: overview.savedPlans,
            seasonalFoods: getSeasonalFoodPool(current, overview.profile.region),
            planType: input.planType,
            extraRequest: input.userExtraRequest,
            validationIssues
          }) }
        ]
      });
      return parseMealPlanWithRepair(response.text, async (issues) => {
        const repaired = await options.modelRuntime.chat({
          kind: "chat",
          agentId: "child-meal-planner-agent",
          purpose: "general",
          responseFormat: "json",
          maxTokens: 7000,
          messages: [
            { role: "system", content: CHILD_MEAL_SYSTEM_PROMPT },
            { role: "user", content: buildJsonRepairPrompt(response.text, issues) }
          ]
        });
        return repaired.text;
      });
    }

    const first = await call();
    const firstIssues = validateMealPlan(first, validationContext);
    if (!firstIssues.length) return first;
    const second = await call(firstIssues);
    const secondIssues = validateMealPlan(second, validationContext);
    if (secondIssues.length) throw new Error(`食谱生成失败：${secondIssues.join("；")}`);
    return second;
  }

  function savePlan(input: unknown) {
    if (!isRecord(input)) throw new Error("食谱计划格式无效");
    const state = getState();
    const timestamp = now().toISOString();
    const plan = { ...(input as unknown as ChildMealPlan), id: `meal-plan-${nanoid()}`, childId: state.profile.id, createdAt: timestamp, updatedAt: timestamp };
    save({ ...state, plans: [plan, ...state.plans] });
    return plan;
  }

  function convertMealToRecord(input: unknown) {
    if (!isRecord(input) || !isRecord(input.meal)) throw new Error("计划餐次格式无效");
    return createRecord({
      date: input.date,
      mealType: input.meal.mealType,
      foodName: input.meal.mealName,
      ingredients: input.meal.ingredients,
      cookingMethods: input.meal.cookingMethods,
      acceptance: input.acceptance ?? "一般",
      note: "由已计划食谱转为实际记录"
    });
  }

  return {
    getOverview,
    updateProfile,
    createNote,
    listNotes,
    updateNote,
    deleteNote,
    createRecord,
    listRecords,
    updateRecord,
    deleteRecord,
    generatePlan,
    savePlan,
    convertMealToRecord
  };
}

export type ChildMealService = ReturnType<typeof createChildMealService>;
