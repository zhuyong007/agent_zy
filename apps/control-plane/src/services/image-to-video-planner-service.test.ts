import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneStore } from "./store";
import { createImageToVideoPlannerService } from "./image-to-video-planner-service";

const tempDirs: string[] = [];
const analysis = {
  imageId: "ignored",
  suitableForVideo: true,
  unsuitableReason: null,
  roleSuggestion: "首帧",
  subjectDescription: "窗边人物",
  sceneDescription: "安静室内",
  composition: "中景侧面",
  lighting: "侧逆光",
  mood: "平静",
  style: "写实电影感",
  motionPotential: "适合轻微回首和推镜",
  risks: ["避免变脸"]
};
const plan = {
  videoDuration: 8,
  coreConcept: "人物回首",
  visualStyle: "写实电影感",
  cameraMovement: "缓慢推近",
  subjectMovement: "人物回首",
  sceneMovement: "窗帘摆动",
  rhythm: "缓慢",
  emotionalArc: "平静到释然",
  recommendedKeyframes: [
    { keyframeId: "start", timestamp: 0, role: "首帧", reason: "建立画面" },
    { keyframeId: "end", timestamp: 8, role: "尾帧", reason: "锁定落点" }
  ],
  bgmSuggestion: "钢琴",
  soundEffectSuggestion: "风声",
  reason: "动作可延展"
};
const keyframes = {
  videoDuration: 8,
  keyframes: [
    {
      keyframeId: "start",
      timestamp: 0,
      role: "首帧",
      requiredImageDescription: "原图",
      purpose: "建立画面",
      transitionRelation: "起点",
      generationPrompt: "保持原图",
      negativePrompt: "变脸",
      status: "PENDING"
    },
    {
      keyframeId: "end",
      timestamp: 8,
      role: "尾帧",
      requiredImageDescription: "人物轻微回首",
      purpose: "锁定动作落点",
      transitionRelation: "承接首帧",
      generationPrompt: "同一人物在同一窗边轻微回首，保持构图光影风格一致",
      negativePrompt: "变脸、场景漂移",
      status: "PENDING"
    }
  ]
};
const rejectedReview = {
  keyframeId: "end",
  approved: false,
  score: 62,
  problems: ["人物视角不一致"],
  improvementAdvice: "保持侧面角度",
  revisedGenerationPrompt: "同一人物保持侧面角度轻微回首",
  revisedNegativePrompt: "正脸、变脸"
};
const finalPrompt = {
  duration: 8,
  keyframeTimeline: [
    { keyframeId: "start", timestamp: 0, description: "首帧" },
    { keyframeId: "end", timestamp: 8, description: "尾帧" }
  ],
  promptText: "画".repeat(320),
  negativePrompt: "禁止变脸、场景漂移和镜头跳切",
  bgm: "钢琴",
  soundEffects: ["风声"],
  usageNotes: "按时间点上传关键帧"
};
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const webp = Buffer.from("RIFF0000WEBP");

function setup(outputs: unknown[]) {
  const dataDir = mkdtempSync(join(tmpdir(), "image-to-video-service-"));
  tempDirs.push(dataDir);
  const store = createControlPlaneStore(dataDir);
  const chat = vi.fn(async () => ({ text: JSON.stringify(outputs.shift()) }));
  const service = createImageToVideoPlannerService({
    dataDir,
    store,
    modelRuntime: { chat } as any
  });

  return { dataDir, store, chat, service };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("image-to-video planner service", () => {
  it("persists a project through analysis, planning and keyframe planning", async () => {
    const { service, store } = setup([analysis, plan, keyframes]);

    const analyzed = await service.analyze({
      fileName: "frame.png",
      mimeType: "image/png",
      buffer: png
    });
    const planned = await service.plan(analyzed.id);
    const framed = await service.planKeyframes(analyzed.id);

    expect(analyzed.stage).toBe("IMAGE_ANALYZED");
    expect(planned.stage).toBe("VIDEO_PLAN_GENERATED");
    expect(framed.stage).toBe("WAITING_FOR_KEYFRAMES");
    expect(framed.keyframes[0]).toMatchObject({ keyframeId: "start", status: "APPROVED" });
    expect(store.getState().imageToVideo?.projects[0]?.id).toBe(analyzed.id);
  });

  it("rejects a keyframe, allows user override, and generates the final prompt", async () => {
    const { service } = setup([analysis, plan, keyframes, rejectedReview, finalPrompt]);
    const project = await service.analyze({
      fileName: "frame.webp",
      mimeType: "image/webp",
      buffer: webp
    });
    await service.plan(project.id);
    await service.planKeyframes(project.id);

    const reviewed = await service.reviewKeyframe(project.id, "end", {
      fileName: "end.webp",
      mimeType: "image/webp",
      buffer: webp
    });
    expect(reviewed.keyframes.find((item) => item.keyframeId === "end")?.status).toBe("REJECTED");

    const overridden = service.overrideKeyframe(project.id, "end");
    expect(overridden.stage).toBe("MATERIALS_READY");

    const completed = await service.generateFinalPrompt(project.id);
    expect(completed.stage).toBe("FINAL_PROMPT_GENERATED");
  });

  it("clears downstream data when re-analyzing and deletes project assets", async () => {
    const { dataDir, service } = setup([analysis, plan, keyframes, analysis]);
    const project = await service.analyze({
      fileName: "frame.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg
    });
    await service.plan(project.id);
    await service.planKeyframes(project.id);

    const reset = await service.analyze({
      projectId: project.id,
      fileName: "replacement.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg
    });
    expect(reset.videoPlan).toBeNull();
    expect(reset.keyframes).toEqual([]);

    service.deleteProject(project.id);
    expect(existsSync(join(dataDir, "image-to-video", project.id))).toBe(false);
  });
});
