import type { ChildMealPlanType, ChildProfile } from "@agent-zy/shared-types";

export const CHILD_MEAL_SYSTEM_PROMPT = [
  "你是儿童日常饮食规划助手，不是医生。",
  "只提供日常食谱和烹饪建议，不做医疗诊断。",
  "不推荐药物、保健品、补剂或品牌商品。",
  "根据月龄、咀嚼能力、过敏信息、历史饮食记录和季节食材生成营养均衡、容易制作的食谱。",
  "避免高盐、高糖、重油、辛辣、蜂蜜、整颗坚果和大块硬食物。",
  "一餐两个菜时优先一个蒸、一个炒。",
  "输出必须是字段完整的中文严格 JSON，不要 Markdown 或解释。"
].join("\n");

export function buildMealPlanPrompt(input: {
  currentDate: string;
  profile: ChildProfile;
  childSummary: unknown;
  notes: unknown[];
  recentRecords: unknown[];
  frequentIngredients: unknown[];
  savedPlans: unknown[];
  seasonalFoods: string[];
  planType: ChildMealPlanType;
  extraRequest?: string;
  validationIssues?: string[];
}) {
  return [
    `当前日期：${input.currentDate}`,
    `计划类型：${input.planType}`,
    `孩子档案：${JSON.stringify(input.profile)}`,
    `动态年龄摘要：${JSON.stringify(input.childSummary)}`,
    `近期备注：${JSON.stringify(input.notes)}`,
    `近期饮食记录：${JSON.stringify(input.recentRecords)}`,
    `最近30天高频食材：${JSON.stringify(input.frequentIngredients)}`,
    `已保存未来计划：${JSON.stringify(input.savedPlans)}`,
    `当季食材池：${JSON.stringify(input.seasonalFoods)}`,
    `额外要求：${input.extraRequest ?? "无"}`,
    ...(input.validationIssues?.length ? [`上次结果问题，必须全部修复：${input.validationIssues.join("；")}`] : []),
    "严格按 MealPlan JSON 结构输出。每天包含早餐、午餐、晚餐、加餐或水果，并给出做饭顺序、安排理由和避免重复说明。"
  ].join("\n");
}

export function buildJsonRepairPrompt(raw: string, issues: string) {
  return `修复以下输出为字段完整的严格 JSON，只输出 JSON。\n校验问题：${issues}\n原输出：${raw.slice(0, 12000)}`;
}
