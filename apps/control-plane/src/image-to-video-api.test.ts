import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";

function multipartImage(boundary: string, fields: Record<string, string> = {}) {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n`, "binary"));
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "binary"));
  return Buffer.concat(chunks);
}

const outputs = [
  {
    imageId: "ignored",
    suitableForVideo: true,
    unsuitableReason: null,
    roleSuggestion: "首帧",
    subjectDescription: "窗边人物",
    sceneDescription: "室内",
    composition: "中景",
    lighting: "侧逆光",
    mood: "平静",
    style: "写实",
    motionPotential: "适合回首",
    risks: []
  },
  {
    videoDuration: 8,
    coreConcept: "人物回首",
    visualStyle: "写实",
    cameraMovement: "推近",
    subjectMovement: "回首",
    sceneMovement: "窗帘摆动",
    rhythm: "缓慢",
    emotionalArc: "平静到释然",
    recommendedKeyframes: [
      { keyframeId: "start", timestamp: 0, role: "首帧", reason: "建立" },
      { keyframeId: "end", timestamp: 8, role: "尾帧", reason: "收束" }
    ],
    bgmSuggestion: "钢琴",
    soundEffectSuggestion: "风声",
    reason: "可延展"
  },
  {
    videoDuration: 8,
    keyframes: [
      {
        keyframeId: "start",
        timestamp: 0,
        role: "首帧",
        requiredImageDescription: "原图",
        purpose: "建立",
        transitionRelation: "起点",
        generationPrompt: "保持原图",
        negativePrompt: "变脸",
        status: "PENDING"
      },
      {
        keyframeId: "end",
        timestamp: 8,
        role: "尾帧",
        requiredImageDescription: "人物回首",
        purpose: "收束",
        transitionRelation: "承接",
        generationPrompt: "同一人物回首",
        negativePrompt: "变脸",
        status: "PENDING"
      }
    ]
  },
  {
    keyframeId: "end",
    approved: false,
    score: 60,
    problems: ["视角错误"],
    improvementAdvice: "保持视角",
    revisedGenerationPrompt: "保持视角回首",
    revisedNegativePrompt: "视角漂移"
  },
  {
    duration: 8,
    keyframeTimeline: [
      { keyframeId: "start", timestamp: 0, description: "首帧" },
      { keyframeId: "end", timestamp: 8, description: "尾帧" }
    ],
    promptText: "画".repeat(320),
    negativePrompt: "禁止变脸",
    bgm: "钢琴",
    soundEffects: ["风声"],
    usageNotes: "按顺序上传"
  }
];

afterEach(() => vi.restoreAllMocks());

describe("image-to-video API", () => {
  it("runs the complete persisted planner workflow", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "image-to-video-api-"));
    const queue = [...outputs];
    const app = createControlPlaneApp({
      dataDir,
      startSchedulers: false,
      modelRuntime: { chat: vi.fn(async () => ({ text: JSON.stringify(queue.shift()) })) } as any
    });
    await app.ready();

    try {
      const boundary = "----image-boundary";
      const analyzed = await app.inject({
        method: "POST",
        url: "/api/image-to-video/analyze",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipartImage(boundary)
      });
      expect(analyzed.statusCode).toBe(200);
      const projectId = analyzed.json().id;

      expect((await app.inject({ method: "POST", url: "/api/image-to-video/plan", payload: { projectId } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: "/api/image-to-video/keyframes", payload: { projectId } })).json().stage).toBe("WAITING_FOR_KEYFRAMES");

      const reviewed = await app.inject({
        method: "POST",
        url: "/api/image-to-video/review-keyframe",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipartImage(boundary, { projectId, keyframeId: "end" })
      });
      expect(reviewed.json().keyframes[1].status).toBe("REJECTED");

      expect((await app.inject({ method: "POST", url: "/api/image-to-video/keyframes/end/override", payload: { projectId } })).json().stage).toBe("MATERIALS_READY");
      expect((await app.inject({ method: "POST", url: "/api/image-to-video/final-prompt", payload: { projectId } })).json().stage).toBe("FINAL_PROMPT_GENERATED");
      expect((await app.inject({ method: "GET", url: "/api/image-to-video/projects" })).json().projects).toHaveLength(1);

      const project = (await app.inject({ method: "GET", url: `/api/image-to-video/projects/${projectId}` })).json();
      const assetResponse = await app.inject({ method: "GET", url: project.assets[0].url });
      expect(assetResponse.statusCode).toBe(200);

      expect((await app.inject({ method: "DELETE", url: `/api/image-to-video/projects/${projectId}` })).statusCode).toBe(200);
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
