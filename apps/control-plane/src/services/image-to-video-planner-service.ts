import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";

import {
  IMAGE_TO_VIDEO_SYSTEM_PROMPT,
  buildFinalPromptRequest,
  buildImageAnalysisRequest,
  buildJsonRepairRequest,
  buildKeyframePlanRequest,
  buildKeyframeReviewRequest,
  buildVideoPlanRequest,
  finalVideoPromptSchema,
  imageAnalysisResultSchema,
  keyframeRequirementsSchema,
  keyframeReviewResultSchema,
  parseModelResultWithRepair,
  videoPlanSchema
} from "@agent-zy/image-to-video-planner-agent";
import type {
  ImageToVideoAsset,
  ImageToVideoOperation,
  ImageToVideoProject,
  ImageToVideoState,
  KeyframeRequirement
} from "@agent-zy/shared-types";

import type { ModelRuntime } from "./model-runtime";
import type { ControlPlaneStore } from "./store";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VISION_IMAGE_DIMENSION = 2048;
const MAX_VISION_IMAGE_BYTES = Math.floor(4.75 * 1024 * 1024);
const IMAGE_EXTENSIONS: Record<ImageToVideoAsset["mimeType"], string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

export interface ImageToVideoUpload {
  projectId?: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

function isImageMimeType(value: string): value is ImageToVideoAsset["mimeType"] {
  return value in IMAGE_EXTENSIONS;
}

function nowIso() {
  return new Date().toISOString();
}

function matchesImageSignature(mimeType: ImageToVideoAsset["mimeType"], buffer: Buffer) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export function createImageToVideoPlannerService(options: {
  dataDir: string;
  store: ControlPlaneStore;
  modelRuntime: ModelRuntime;
}) {
  const rootDir = resolve(options.dataDir, "image-to-video");
  mkdirSync(rootDir, { recursive: true });

  function getState(): ImageToVideoState {
    return options.store.getState().imageToVideo ?? { projects: [], recentProjectIds: [] };
  }

  function saveProject(project: ImageToVideoProject) {
    const current = getState();
    const projects = [project, ...current.projects.filter((item) => item.id !== project.id)];
    const recentProjectIds = [project.id, ...current.recentProjectIds.filter((id) => id !== project.id)];
    options.store.setImageToVideoState({ projects, recentProjectIds });
    return project;
  }

  function getProject(projectId: string) {
    const project = getState().projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("图片转视频策划项目不存在");
    }
    return project;
  }

  function assertUpload(
    upload: ImageToVideoUpload
  ): asserts upload is ImageToVideoUpload & { mimeType: ImageToVideoAsset["mimeType"] } {
    if (!isImageMimeType(upload.mimeType)) {
      throw new Error("仅支持 JPEG、PNG 或 WebP 图片");
    }
    if (!upload.buffer.length || upload.buffer.length > MAX_IMAGE_BYTES) {
      throw new Error("图片不能为空且不能超过 15 MB");
    }
    if (!matchesImageSignature(upload.mimeType, upload.buffer)) {
      throw new Error("图片内容与声明格式不一致");
    }
  }

  function writeAsset(projectId: string, upload: ImageToVideoUpload): ImageToVideoAsset {
    assertUpload(upload);
    const id = randomUUID();
    const fileName = `${id}${IMAGE_EXTENSIONS[upload.mimeType]}`;
    const projectDir = join(rootDir, projectId);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, fileName), upload.buffer);

    return {
      id,
      projectId,
      fileName,
      mimeType: upload.mimeType,
      size: upload.buffer.length,
      url: `/api/image-to-video/assets/${projectId}/${id}`,
      createdAt: nowIso()
    };
  }

  function assetPath(asset: ImageToVideoAsset) {
    const target = resolve(rootDir, asset.projectId, asset.fileName);
    if (!target.startsWith(resolve(rootDir, asset.projectId) + "/")) {
      throw new Error("非法图片资源路径");
    }
    return target;
  }

  async function prepareVisionImage(asset: ImageToVideoAsset) {
    const original = readFileSync(assetPath(asset));
    try {
      for (const dimension of [MAX_VISION_IMAGE_DIMENSION, 1792, 1536, 1280, 1024]) {
        for (const quality of [85, 70, 55, 40]) {
          const buffer = await sharp(original)
            .rotate()
            .flatten({ background: "#ffffff" })
            .resize({
              width: dimension,
              height: dimension,
              fit: "inside",
              withoutEnlargement: true
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          if (buffer.length <= MAX_VISION_IMAGE_BYTES) {
            return { buffer, mimeType: "image/jpeg" as const };
          }
        }
      }
      throw new Error("图片无法压缩到模型支持的 5 MB 以内");
    } catch {
      if (original.length <= MAX_VISION_IMAGE_BYTES) {
        return { buffer: original, mimeType: asset.mimeType };
      }
      throw new Error("图片无法压缩到模型支持的 5 MB 以内");
    }
  }

  async function callModel<T>(
    prompt: string,
    schema: Parameters<typeof parseModelResultWithRepair<T>>[1],
    imageAsset?: ImageToVideoAsset
  ) {
    const visionImage = imageAsset ? await prepareVisionImage(imageAsset) : null;
    const content = imageAsset
      ? [
          { type: "text" as const, text: prompt },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:${visionImage!.mimeType};base64,${visionImage!.buffer.toString("base64")}`
            }
          }
        ]
      : prompt;
    const response = await options.modelRuntime.chat({
      kind: "chat",
      agentId: "image-to-video-planner-agent",
      purpose: "vision",
      responseFormat: "json",
      maxTokens: 5000,
      messages: [
        { role: "system", content: IMAGE_TO_VIDEO_SYSTEM_PROMPT },
        { role: "user", content }
      ]
    });

    return parseModelResultWithRepair(response.text, schema, async (issue) => {
      const repaired = await options.modelRuntime.chat({
        kind: "chat",
        agentId: "image-to-video-planner-agent",
        purpose: "vision",
        responseFormat: "json",
        maxTokens: 5000,
        messages: [
          { role: "system", content: IMAGE_TO_VIDEO_SYSTEM_PROMPT },
          { role: "user", content: buildJsonRepairRequest(response.text, issue, prompt) }
        ]
      });
      return repaired.text;
    });
  }

  async function runOperation(
    projectId: string,
    operation: ImageToVideoOperation,
    execute: (project: ImageToVideoProject) => Promise<ImageToVideoProject>
  ) {
    const project = getProject(projectId);
    saveProject({ ...project, activeOperation: operation, lastError: null, updatedAt: nowIso() });
    try {
      return saveProject(await execute(getProject(projectId)));
    } catch (error) {
      saveProject({
        ...getProject(projectId),
        activeOperation: null,
        lastError: error instanceof Error ? error.message : "模型处理失败",
        updatedAt: nowIso()
      });
      throw error;
    }
  }

  async function analyze(upload: ImageToVideoUpload) {
    const projectId = upload.projectId ?? randomUUID();
    const existing = upload.projectId ? getProject(upload.projectId) : null;
    const asset = writeAsset(projectId, upload);
    const createdAt = existing?.createdAt ?? nowIso();
    const base: ImageToVideoProject = {
      id: projectId,
      title: existing?.title ?? (upload.fileName.replace(extname(upload.fileName), "") || "图片转视频策划"),
      stage: "FIRST_IMAGE_UPLOADED",
      activeOperation: "analyzing",
      lastError: null,
      originalImageAssetId: asset.id,
      assets: [...(existing?.assets ?? []), asset],
      imageAnalysis: null,
      videoPlan: null,
      keyframes: [],
      finalPrompt: null,
      createdAt,
      updatedAt: nowIso()
    };
    saveProject(base);

    return runOperation(projectId, "analyzing", async (project) => {
      const result = await callModel(buildImageAnalysisRequest(asset.id), imageAnalysisResultSchema, asset);
      return {
        ...project,
        stage: "IMAGE_ANALYZED",
        activeOperation: null,
        imageAnalysis: { ...result, imageId: asset.id },
        videoPlan: null,
        keyframes: [],
        finalPrompt: null,
        updatedAt: nowIso()
      };
    });
  }

  async function plan(projectId: string) {
    return runOperation(projectId, "planning", async (project) => {
      if (!project.imageAnalysis) {
        throw new Error("请先完成图片分析");
      }
      const videoPlan = await callModel(buildVideoPlanRequest(project.imageAnalysis), videoPlanSchema);
      return {
        ...project,
        stage: "VIDEO_PLAN_GENERATED",
        activeOperation: null,
        videoPlan,
        keyframes: [],
        finalPrompt: null,
        updatedAt: nowIso()
      };
    });
  }

  async function planKeyframes(projectId: string) {
    return runOperation(projectId, "planning-keyframes", async (project) => {
      if (!project.imageAnalysis || !project.videoPlan) {
        throw new Error("请先完成图片分析和视频方案");
      }
      const payload = await callModel(
        buildKeyframePlanRequest(project.imageAnalysis, project.videoPlan),
        keyframeRequirementsSchema
      );
      const keyframes = payload.keyframes.map((keyframe): KeyframeRequirement => {
        const canUseOriginal =
          project.imageAnalysis?.roleSuggestion !== "风格参考" &&
          project.imageAnalysis?.roleSuggestion === keyframe.role;
        return canUseOriginal
          ? { ...keyframe, status: "APPROVED", imageAssetId: project.originalImageAssetId ?? undefined }
          : { ...keyframe, status: keyframe.status ?? "PENDING" };
      });
      const materialsReady = keyframes.every((keyframe) => ["APPROVED", "APPROVED_BY_USER"].includes(keyframe.status));
      return {
        ...project,
        stage: materialsReady ? "MATERIALS_READY" : "WAITING_FOR_KEYFRAMES",
        activeOperation: null,
        keyframes,
        finalPrompt: null,
        updatedAt: nowIso()
      };
    });
  }

  async function reviewKeyframe(projectId: string, keyframeId: string, upload: ImageToVideoUpload) {
    const project = getProject(projectId);
    const requirement = project.keyframes.find((item) => item.keyframeId === keyframeId);
    if (!project.imageAnalysis || !project.videoPlan || !requirement) {
      throw new Error("待审核关键帧不存在或项目尚未完成规划");
    }
    const asset = writeAsset(projectId, upload);
    saveProject({
      ...project,
      assets: [...project.assets, asset],
      keyframes: project.keyframes.map((item) =>
        item.keyframeId === keyframeId ? { ...item, imageAssetId: asset.id, status: "UPLOADED" } : item
      ),
      updatedAt: nowIso()
    });

    return runOperation(projectId, "reviewing", async (current) => {
      const currentRequirement = current.keyframes.find((item) => item.keyframeId === keyframeId)!;
      const result = await callModel(
        buildKeyframeReviewRequest(current.imageAnalysis!, current.videoPlan!, currentRequirement),
        keyframeReviewResultSchema,
        asset
      );
      const reviewedAt = nowIso();
      const reviewResult = { ...result, keyframeId, reviewedAt };
      const nextKeyframes = current.keyframes.map((item) =>
        item.keyframeId === keyframeId
          ? {
              ...item,
              status: result.approved ? "APPROVED" as const : "REJECTED" as const,
              reviewResult,
              reviewHistory: [...(item.reviewHistory ?? []), reviewResult]
            }
          : item
      );
      const materialsReady = nextKeyframes.every((item) => ["APPROVED", "APPROVED_BY_USER"].includes(item.status));
      return {
        ...current,
        stage: materialsReady ? "MATERIALS_READY" : "WAITING_FOR_KEYFRAMES",
        activeOperation: null,
        keyframes: nextKeyframes,
        finalPrompt: null,
        updatedAt: reviewedAt
      };
    });
  }

  function overrideKeyframe(projectId: string, keyframeId: string) {
    const project = getProject(projectId);
    const keyframe = project.keyframes.find((item) => item.keyframeId === keyframeId);
    if (!keyframe?.imageAssetId) {
      throw new Error("关键帧尚未上传图片，不能人工通过");
    }
    const keyframes = project.keyframes.map((item) =>
      item.keyframeId === keyframeId ? { ...item, status: "APPROVED_BY_USER" as const } : item
    );
    const materialsReady = keyframes.every((item) => ["APPROVED", "APPROVED_BY_USER"].includes(item.status));
    return saveProject({
      ...project,
      stage: materialsReady ? "MATERIALS_READY" : "WAITING_FOR_KEYFRAMES",
      keyframes,
      finalPrompt: null,
      updatedAt: nowIso()
    });
  }

  async function generateFinalPrompt(projectId: string) {
    return runOperation(projectId, "finalizing", async (project) => {
      if (
        !project.imageAnalysis ||
        !project.videoPlan ||
        !project.keyframes.length ||
        project.keyframes.some((item) => !["APPROVED", "APPROVED_BY_USER"].includes(item.status))
      ) {
        throw new Error("仍有关键帧未完成审核，不能生成最终提示词");
      }
      const finalPrompt = await callModel(
        buildFinalPromptRequest(project.imageAnalysis, project.videoPlan, project.keyframes),
        finalVideoPromptSchema
      );
      return {
        ...project,
        stage: "FINAL_PROMPT_GENERATED",
        activeOperation: null,
        finalPrompt,
        updatedAt: nowIso()
      };
    });
  }

  function deleteProject(projectId: string) {
    const current = getState();
    if (!current.projects.some((item) => item.id === projectId)) {
      throw new Error("图片转视频策划项目不存在");
    }
    rmSync(join(rootDir, projectId), { recursive: true, force: true });
    const next: ImageToVideoState = {
      projects: current.projects.filter((item) => item.id !== projectId),
      recentProjectIds: current.recentProjectIds.filter((id) => id !== projectId)
    };
    options.store.setImageToVideoState(next);
    return next;
  }

  function readAsset(projectId: string, assetId: string) {
    const project = getProject(projectId);
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset || !existsSync(assetPath(asset))) {
      throw new Error("图片资源不存在");
    }
    return { asset, buffer: readFileSync(assetPath(asset)) };
  }

  return {
    listProjects: getState,
    getProject,
    analyze,
    plan,
    planKeyframes,
    reviewKeyframe,
    overrideKeyframe,
    generateFinalPrompt,
    deleteProject,
    readAsset
  };
}

export type ImageToVideoPlannerService = ReturnType<typeof createImageToVideoPlannerService>;
