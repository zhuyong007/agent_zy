import { describe, expect, it } from "vitest";

import { buildCinematicPrompt } from "./prompts";

describe("cinematic prompts", () => {
  it("instructs individual storyboard prompts to describe the frame without camera movement", () => {
    const prompt = buildCinematicPrompt({
      concept: "雨夜街口的孤独感",
      style: "冷蓝霓虹",
      visualStyle: "动漫",
      pace: "缓慢",
      targetShotCount: 4,
      visualFocus: "便利店门口、红色雨伞、湿润柏油路",
      negativePrompt: "不要出现瞳孔变化、夸张怪物、文字水印"
    });

    expect(prompt).toContain("单个分镜 prompt.zh 和 prompt.en 只描述静态单帧画面本身");
    expect(prompt).toContain("不要写摄影机运动、运镜、推进、摇移、跟拍、转场、声音或情绪说明");
    expect(prompt).toContain("静态单帧");
    expect(prompt).toContain("禁止写“正在、开始、逐渐、急剧、收缩成、转头、走向、推近、拉远”等动态变化");
    expect(prompt).toContain("便利店门口、红色雨伞、湿润柏油路");
    expect(prompt).toContain("不要出现瞳孔变化、夸张怪物、文字水印");
    expect(prompt).toContain("画面风格类型：动漫");
    expect(prompt).toContain("每个分镜画面提示词都必须遵循这个画面风格类型");
    expect(prompt).not.toContain("必须包含场景、人物、光线、色彩、材质、摄影机运动");
  });
});
