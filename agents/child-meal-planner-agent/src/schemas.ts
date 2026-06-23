import { z } from "zod";

const text = z.string().trim().min(1);
const mealType = z.enum(["breakfast", "lunch", "dinner", "snack", "milk", "fruit"]);

export const plannedMealSchema = z.object({
  mealType,
  mealName: text,
  ingredients: z.array(text).min(1),
  cookingMethods: z.array(text).min(1),
  textureAdvice: text,
  simpleSteps: z.array(text).min(1),
  nutritionPurpose: text,
  safetyNotes: z.array(text)
});

export const mealPlanSchema = z.object({
  childSummary: z.object({
    birthDate: text,
    ageText: text,
    monthAge: z.number().int().min(0),
    stage: text,
    importantNotes: z.array(z.string())
  }),
  planType: z.enum(["today", "tomorrow", "three_days", "seven_days"]),
  dateRange: z.object({ start: text, end: text }),
  days: z.array(z.object({
    date: text,
    dailyNutritionFocus: text,
    avoidRepeatReason: text,
    meals: z.array(plannedMealSchema).min(3),
    cookingOrder: z.array(text).min(1),
    fruitSuggestion: text,
    milkAndWaterNote: text,
    parentNotes: z.array(z.string())
  })).min(1),
  weeklyBalanceSummary: z.object({
    proteinRotation: z.array(z.string()),
    vegetableRotation: z.array(z.string()),
    fruitRotation: z.array(z.string()),
    stapleFoodRotation: z.array(z.string())
  }),
  warnings: z.array(z.string()),
  notMedicalAdvice: text
});
