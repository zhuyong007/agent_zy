import { describe, expect, it, vi } from "vitest";

import {
  finalVideoPromptSchema,
  keyframeReviewResultSchema,
  keyframeRequirementsSchema,
  parseModelResultWithRepair,
  videoPlanSchema
} from "./index";

const validPlan = {
  videoDuration: 8,
  coreConcept: "人物从静止凝望转为轻微回首",
  visualStyle: "写实电影质感",
  cameraMovement: "缓慢推近",
  subjectMovement: "人物轻微回首",
  sceneMovement: "窗帘轻微摆动",
  rhythm: "前缓后稳",
  emotionalArc: "平静到释然",
  recommendedKeyframes: [
    { keyframeId: "start", timestamp: 0, role: "首帧", reason: "建立人物与环境" },
    { keyframeId: "end", timestamp: 8, role: "尾帧", reason: "锁定动作落点" }
  ],
  bgmSuggestion: "低速钢琴",
  soundEffectSuggestion: "轻微风声",
  reason: "画面主体明确且有动作延展空间"
};

describe("image-to-video planner schemas", () => {
  it("accepts a 4-15 second video plan and rejects out-of-range duration", () => {
    expect(videoPlanSchema.parse(validPlan).videoDuration).toBe(8);
    expect(() => videoPlanSchema.parse({ ...validPlan, videoDuration: 16 })).toThrow();
  });

  it("rejects duplicate or out-of-range keyframe timestamps", () => {
    expect(() =>
      keyframeRequirementsSchema.parse({
        videoDuration: 8,
        keyframes: [
          {
            keyframeId: "a",
            timestamp: 3,
            role: "中间帧",
            requiredImageDescription: "画面 A",
            purpose: "承接动作",
            transitionRelation: "从首帧延续",
            generationPrompt: "主体、场景、动作、构图、光影和风格保持一致",
            negativePrompt: "变脸、变形",
            status: "PENDING"
          },
          {
            keyframeId: "b",
            timestamp: 3,
            role: "尾帧",
            requiredImageDescription: "画面 B",
            purpose: "动作落点",
            transitionRelation: "承接中间帧",
            generationPrompt: "主体、场景、动作、构图、光影和风格保持一致",
            negativePrompt: "变脸、变形",
            status: "PENDING"
          }
        ]
      })
    ).toThrow();
  });

  it("limits review scores to 0-100", () => {
    expect(() =>
      keyframeReviewResultSchema.parse({
        keyframeId: "end",
        approved: false,
        score: 101,
        problems: ["视角不一致"],
        improvementAdvice: "调整视角",
        revisedGenerationPrompt: "保持视角一致",
        revisedNegativePrompt: "视角漂移"
      })
    ).toThrow();
  });

  it("requires final prompt text to contain 300-500 non-whitespace characters", () => {
    const promptText = "画".repeat(320);
    expect(
      finalVideoPromptSchema.parse({
        duration: 8,
        keyframeTimeline: [{ keyframeId: "start", timestamp: 0, description: "首帧" }],
        promptText,
        negativePrompt: "禁止变脸和跳切",
        bgm: "低速钢琴",
        soundEffects: ["风声"],
        usageNotes: "按时间点上传关键帧"
      }).promptText
    ).toBe(promptText);
    expect(() =>
      finalVideoPromptSchema.parse({
        duration: 8,
        keyframeTimeline: [],
        promptText: "太短",
        negativePrompt: "禁止变脸",
        bgm: "低速钢琴",
        soundEffects: [],
        usageNotes: "按时间点上传"
      })
    ).toThrow();
  });

  it("repairs invalid model JSON once", async () => {
    const repair = vi.fn().mockResolvedValue(JSON.stringify(validPlan));

    const result = await parseModelResultWithRepair("{bad json", videoPlanSchema, repair);

    expect(result).toEqual(validPlan);
    expect(repair).toHaveBeenCalledOnce();
  });
});
