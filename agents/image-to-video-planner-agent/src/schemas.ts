import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const keyframeRoleSchema = z.enum(["首帧", "中间帧", "尾帧"]);
export const keyframeStatusSchema = z.enum([
  "PENDING",
  "UPLOADED",
  "REVIEWING",
  "APPROVED",
  "REJECTED",
  "APPROVED_BY_USER"
]);

export const imageAnalysisResultSchema = z.object({
  imageId: nonEmptyString,
  suitableForVideo: z.boolean(),
  unsuitableReason: z.string().trim().nullable(),
  roleSuggestion: z.enum(["首帧", "中间帧", "尾帧", "风格参考"]),
  subjectDescription: nonEmptyString,
  sceneDescription: nonEmptyString,
  composition: nonEmptyString,
  lighting: nonEmptyString,
  mood: nonEmptyString,
  style: nonEmptyString,
  motionPotential: nonEmptyString,
  risks: z.array(nonEmptyString)
});

export const videoPlanSchema = z.object({
  videoDuration: z.number().min(4).max(15),
  coreConcept: nonEmptyString,
  visualStyle: nonEmptyString,
  cameraMovement: nonEmptyString,
  subjectMovement: nonEmptyString,
  sceneMovement: nonEmptyString,
  rhythm: nonEmptyString,
  emotionalArc: nonEmptyString,
  recommendedKeyframes: z.array(z.object({
    keyframeId: nonEmptyString,
    timestamp: z.number().min(0),
    role: keyframeRoleSchema,
    reason: nonEmptyString
  })).min(1),
  bgmSuggestion: nonEmptyString,
  soundEffectSuggestion: nonEmptyString,
  reason: nonEmptyString
}).superRefine((plan, context) => {
  const timestamps = new Set<number>();

  for (const keyframe of plan.recommendedKeyframes) {
    if (keyframe.timestamp > plan.videoDuration) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "关键帧时间点不能超过视频时长" });
    }
    if (timestamps.has(keyframe.timestamp)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "关键帧时间点不能重复" });
    }
    timestamps.add(keyframe.timestamp);
  }
});

export const keyframeRequirementSchema = z.object({
  keyframeId: nonEmptyString,
  timestamp: z.number().min(0),
  role: keyframeRoleSchema,
  requiredImageDescription: nonEmptyString,
  purpose: nonEmptyString,
  transitionRelation: nonEmptyString,
  generationPrompt: nonEmptyString,
  negativePrompt: nonEmptyString,
  status: keyframeStatusSchema.default("PENDING")
});

export const keyframeRequirementsSchema = z.object({
  videoDuration: z.number().min(4).max(15),
  keyframes: z.array(keyframeRequirementSchema).min(1)
}).superRefine((payload, context) => {
  const ids = new Set<string>();
  const timestamps = new Set<number>();

  for (const keyframe of payload.keyframes) {
    if (keyframe.timestamp > payload.videoDuration) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "关键帧时间点不能超过视频时长" });
    }
    if (ids.has(keyframe.keyframeId) || timestamps.has(keyframe.timestamp)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "关键帧 ID 和时间点必须唯一" });
    }
    ids.add(keyframe.keyframeId);
    timestamps.add(keyframe.timestamp);
  }
});

export const keyframeReviewResultSchema = z.object({
  keyframeId: nonEmptyString,
  approved: z.boolean(),
  score: z.number().min(0).max(100),
  problems: z.array(nonEmptyString),
  improvementAdvice: nonEmptyString,
  revisedGenerationPrompt: nonEmptyString,
  revisedNegativePrompt: nonEmptyString
});

export const finalVideoPromptSchema = z.object({
  duration: z.number().min(4).max(15),
  keyframeTimeline: z.array(z.object({
    keyframeId: nonEmptyString,
    timestamp: z.number().min(0),
    description: nonEmptyString
  })).min(1),
  promptText: z.string().superRefine((value, context) => {
    const length = Array.from(value.replace(/\s+/g, "")).length;
    if (length < 300 || length > 500) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "最终视频提示词必须为 300-500 字" });
    }
  }),
  negativePrompt: nonEmptyString,
  bgm: nonEmptyString,
  soundEffects: z.array(nonEmptyString),
  usageNotes: nonEmptyString
});
