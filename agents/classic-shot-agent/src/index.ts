import { randomUUID } from "node:crypto";

import { defineAgent, getModelClient, normalizeModelOutput, parseModelJson } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  ClassicShotContinuity,
  ClassicShotProject,
  ClassicShotSource,
  ClassicShotState,
  ClassicShotStoryboard,
  ClassicShotTargetPlatform
} from "@agent-zy/shared-types";

import { buildClassicShotPrompt, buildClassicShotVideoFramePrompt, CLASSIC_SHOT_SYSTEM_PROMPT } from "./prompts";
import type { ClassicShotGenerationInput, ClassicShotVideoFrameInput } from "./types";

const HISTORY_LIMIT = 50;
const TARGET_PLATFORMS = new Set<ClassicShotTargetPlatform>([
  "jianying",
  "jimeng",
  "kling",
  "runway",
  "seedance",
  "generic"
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((item): item is string => item !== null)
    : [];
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function validateSource(value: unknown): ClassicShotSource {
  const record = asRecord(value);
  const director = asString(record?.director);
  const film = asString(record?.film);
  const year = asPositiveInteger(record?.year);
  const shotName = asString(record?.shotName);
  const shotPosition = asString(record?.shotPosition);

  if (!director || !film || !year || !shotName || !shotPosition) {
    throw new Error("经典镜头复刻必须提供明确出处：导演、电影、上映年份和镜头位置");
  }

  return {
    director,
    film,
    year,
    shotName,
    shotPosition,
    ...(asString(record?.context) ? { context: asString(record?.context) as string } : {})
  };
}

function validateStoryboardShot(value: unknown, index: number): ClassicShotStoryboard {
  const record = asRecord(value);
  const title = asString(record?.title);
  const shotFunction = asString(record?.function);
  const prompt = asString(record?.prompt);
  const movementKeywords = asStringArray(record?.movementKeywords);
  const visualKeywords = asStringArray(record?.visualKeywords);

  if (!record || !title || !shotFunction || !prompt) {
    throw new Error(`第 ${index + 1} 个分镜缺少名称、功能或提示词`);
  }

  if (prompt.length < 300 || prompt.length > 500) {
    throw new Error(`第 ${index + 1} 个分镜提示词必须是 300-500 字`);
  }

  if (!prompt.includes("连续镜头感") && !prompt.includes("连续镜头")) {
    throw new Error(`第 ${index + 1} 个分镜提示词必须强调连续镜头感`);
  }

  if (movementKeywords.length === 0 || visualKeywords.length === 0) {
    throw new Error(`第 ${index + 1} 个分镜必须包含运镜关键词和画面关键词`);
  }

  const sourceFrame = asRecord(record.sourceFrame);
  const sourceFrameIndex = asPositiveInteger(sourceFrame?.index);
  const sourceFrameTimestamp =
    typeof sourceFrame?.timestampSeconds === "number" && Number.isFinite(sourceFrame.timestampSeconds)
      ? sourceFrame.timestampSeconds
      : null;

  return {
    id: asString(record.id) ?? `shot-${index + 1}`,
    title,
    function: shotFunction,
    prompt,
    movementKeywords,
    visualKeywords,
    ...(sourceFrameIndex && sourceFrameTimestamp !== null
      ? { sourceFrame: { index: sourceFrameIndex, timestampSeconds: sourceFrameTimestamp } }
      : {})
  };
}

function validateContinuity(value: unknown): ClassicShotContinuity {
  const record = asRecord(value);
  const continuity = {
    actionContinuity: asString(record?.actionContinuity),
    cameraContinuity: asString(record?.cameraContinuity),
    lightingContinuity: asString(record?.lightingContinuity),
    colorContinuity: asString(record?.colorContinuity),
    antiJumpGuidance: asString(record?.antiJumpGuidance)
  };

  if (
    !continuity.actionContinuity ||
    !continuity.cameraContinuity ||
    !continuity.lightingContinuity ||
    !continuity.colorContinuity ||
    !continuity.antiJumpGuidance
  ) {
    throw new Error("经典镜头复刻必须包含完整镜头衔接设计");
  }

  return continuity as ClassicShotContinuity;
}

function buildMarkdown(project: Omit<ClassicShotProject, "markdown">): string {
  const storyboard = project.storyboard
    .map(
      (shot, index) => `【分镜${index + 1}】
镜头功能

${shot.function}

AI视频生成提示词

${shot.prompt}

运镜关键词

${shot.movementKeywords.join(" / ")}

画面关键词

${shot.visualKeywords.join(" / ")}`
    )
    .join("\n\n");

  return `一、镜头出处

导演：${project.source.director}
电影：${project.source.film}
上映年份：${project.source.year}
经典镜头名称（可自拟）：${project.source.shotName}
镜头位置：${project.source.shotPosition}${project.source.context ? `\n镜头背景：${project.source.context}` : ""}

二、镜头核心价值（100字以内）

${project.coreValue}

三、镜头结构拆解

1. 摄影机运动

${project.analysis.cameraMovement}

2. 光影结构

${project.analysis.lighting}

3. 情绪曲线

${project.analysis.emotionCurve}

四、AI 视频生成分镜（核心）

分镜数量：${project.minimumStoryboardCount}

${storyboard}

${project.storyboardVideoPrompt ? `分镜串联提示词

${project.storyboardVideoPrompt}
` : ""}

五、镜头衔接设计（必须有）

人物动作如何衔接：${project.continuity.actionContinuity}
摄影机方向如何统一：${project.continuity.cameraContinuity}
光线如何连续：${project.continuity.lightingContinuity}
色调如何统一：${project.continuity.colorContinuity}
如何避免 AI 镜头跳变：${project.continuity.antiJumpGuidance}`;
}

function validateProject(value: unknown, input: ClassicShotGenerationInput, requestedAt: string): ClassicShotProject {
  const record = asRecord(normalizeModelOutput(value));

  if (!record) {
    throw new Error("经典镜头复刻输出不是 JSON 对象");
  }

  const source = validateSource(record.source);
  const title = asString(record.title);
  const coreValue = asString(record.coreValue);
  const analysisRecord = asRecord(record.analysis);
  const analysis = {
    cameraMovement: asString(analysisRecord?.cameraMovement),
    lighting: asString(analysisRecord?.lighting),
    emotionCurve: asString(analysisRecord?.emotionCurve)
  };
  const storyboard = Array.isArray(record.storyboard)
    ? record.storyboard.map(validateStoryboardShot)
    : [];
  const minimumStoryboardCount = asPositiveInteger(record.minimumStoryboardCount) ?? storyboard.length;
  const referenceType: ClassicShotProject["referenceType"] =
    record.referenceType === "uploaded-video" || input.action === "generateFromVideoFrames"
      ? "uploaded-video"
      : "classic-film";
  const videoReferenceRecord = asRecord(record.videoReference);
  const videoReference =
    referenceType === "uploaded-video"
      ? {
          fileName:
            asString(videoReferenceRecord?.fileName) ??
            input.videoReference?.fileName ??
            "uploaded-video",
          durationSeconds:
            typeof videoReferenceRecord?.durationSeconds === "number" && Number.isFinite(videoReferenceRecord.durationSeconds)
              ? videoReferenceRecord.durationSeconds
              : input.videoReference?.durationSeconds ?? 0,
          extractedFrameCount:
            asPositiveInteger(videoReferenceRecord?.extractedFrameCount) ??
            input.videoReference?.extractedFrameCount ??
            storyboard.length,
          revisionInstruction:
            asString(videoReferenceRecord?.revisionInstruction) ??
            input.revisionInstruction ??
            "保留镜头结构，改变画面风格和场景，避免生成一模一样的视频"
        }
      : undefined;
  const storyboardVideoPrompt = asString(record.storyboardVideoPrompt);

  if (!title || !coreValue || !analysis.cameraMovement || !analysis.lighting || !analysis.emotionCurve) {
    throw new Error("经典镜头复刻输出缺少标题、核心价值或镜头结构拆解");
  }

  if (coreValue.length > 100) {
    throw new Error("镜头核心价值必须控制在 100 字以内");
  }

  if (storyboard.length === 0) {
    throw new Error("经典镜头复刻至少需要 1 个 AI 视频生成分镜");
  }

  if (referenceType === "uploaded-video") {
    if (!videoReference) {
      throw new Error("上传视频复刻必须包含视频参考信息");
    }

    if (!storyboardVideoPrompt) {
      throw new Error("上传视频复刻必须包含分镜串联提示词");
    }

    if (input.frames && storyboard.length !== input.frames.length) {
      throw new Error("上传视频复刻的分镜数量必须与抽帧数量一致");
    }
  }

  const projectWithoutMarkdown = {
    id: asString(record.id) ?? `classic-shot-${randomUUID()}`,
    rawInput: asString(record.rawInput) ?? input.input,
    title,
    referenceType,
    source,
    ...(videoReference ? { videoReference } : {}),
    coreValue,
    analysis: analysis as ClassicShotProject["analysis"],
    minimumStoryboardCount,
    storyboard,
    continuity: validateContinuity(record.continuity),
    ...(storyboardVideoPrompt ? { storyboardVideoPrompt } : {}),
    targetPlatform: input.targetPlatform ?? "generic",
    createdAt: asString(record.createdAt) ?? requestedAt,
    updatedAt: requestedAt
  };

  return {
    ...projectWithoutMarkdown,
    markdown: asString(record.markdown) ?? buildMarkdown(projectWithoutMarkdown)
  };
}

function getClassicShotState(input: AgentExecutionRequest): ClassicShotState {
  return input.state.classicShots ?? {
    projects: [],
    recentProjectIds: [],
    lastGeneratedAt: null,
    status: "idle",
    lastError: null
  };
}

function upsertProject(state: ClassicShotState, project: ClassicShotProject, generatedAt: string): ClassicShotState {
  const projects = [project, ...state.projects.filter((item) => item.id !== project.id)].slice(0, HISTORY_LIMIT);
  const projectIds = new Set(projects.map((item) => item.id));
  const recentProjectIds = [project.id, ...state.recentProjectIds.filter((id) => id !== project.id)]
    .filter((id) => projectIds.has(id))
    .slice(0, 12);

  return {
    projects,
    recentProjectIds,
    lastGeneratedAt: generatedAt,
    status: "idle",
    lastError: null
  };
}

function resolveInput(input: AgentExecutionRequest): ClassicShotGenerationInput {
  const meta = input.meta ?? {};
  const action = meta.action === "generateFromVideoFrames" ? "generateFromVideoFrames" : "generate";
  const rawInput = asString(meta.input) ?? asString(meta.message) ?? asString(input.message) ?? "随机生成一个经典镜头";
  const platform = asString(meta.targetPlatform);
  const videoReferenceRecord = asRecord(meta.videoReference);
  const frames = Array.isArray(meta.frames)
    ? meta.frames.map((frame): ClassicShotVideoFrameInput | null => {
        const record = asRecord(frame);
        const index = asPositiveInteger(record?.index);
        const timestampSeconds =
          typeof record?.timestampSeconds === "number" && Number.isFinite(record.timestampSeconds)
            ? record.timestampSeconds
            : null;
        const dataUrl = asString(record?.dataUrl);

        return index && timestampSeconds !== null && dataUrl
          ? { index, timestampSeconds, dataUrl }
          : null;
      }).filter((frame): frame is ClassicShotVideoFrameInput => frame !== null)
    : undefined;

  return {
    action,
    input: rawInput,
    targetPlatform: platform && TARGET_PLATFORMS.has(platform as ClassicShotTargetPlatform)
      ? (platform as ClassicShotTargetPlatform)
      : "generic",
    revisionInstruction: asString(meta.revisionInstruction) ?? undefined,
    videoReference: videoReferenceRecord
      ? {
          fileName: asString(videoReferenceRecord.fileName) ?? "uploaded-video",
          durationSeconds:
            typeof videoReferenceRecord.durationSeconds === "number" && Number.isFinite(videoReferenceRecord.durationSeconds)
              ? videoReferenceRecord.durationSeconds
              : 0,
          extractedFrameCount: asPositiveInteger(videoReferenceRecord.extractedFrameCount) ?? frames?.length ?? 0
        }
      : undefined,
    frames
  };
}

async function generateProject(input: ClassicShotGenerationInput, requestedAt: string): Promise<ClassicShotProject> {
  const fixture = process.env.CLASSIC_SHOT_PROJECT_FIXTURE_JSON;

  if (fixture) {
    return validateProject(parseModelJson(fixture), input, requestedAt);
  }

  if (input.action === "generateFromVideoFrames") {
    if (!input.frames || input.frames.length === 0) {
      throw new Error("上传视频复刻至少需要 1 帧画面");
    }

    const result = await getModelClient().chat({
      agentId: "classic-shot-agent",
      purpose: "vision",
      temperature: 0.55,
      maxTokens: 9000,
      responseFormat: "json",
      messages: [
        { role: "system", content: CLASSIC_SHOT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildClassicShotVideoFramePrompt(input) },
            ...input.frames.map((frame) => ({
              type: "image_url" as const,
              image_url: { url: frame.dataUrl }
            }))
          ]
        }
      ]
    });

    if (!result.text) {
      throw new Error("模型返回内容为空");
    }

    return validateProject(result.text, input, requestedAt);
  }

  const result = await getModelClient().generateText({
    agentId: "classic-shot-agent",
    purpose: "vision",
    systemPrompt: CLASSIC_SHOT_SYSTEM_PROMPT,
    prompt: buildClassicShotPrompt(input),
    temperature: 0.65,
    maxTokens: 7000
  });

  if (!result.text) {
    throw new Error("模型返回内容为空");
  }

  return validateProject(result.text, input, requestedAt);
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const generationInput = resolveInput(input);

    try {
      const project = await generateProject(generationInput, input.requestedAt);
      const nextState = upsertProject(getClassicShotState(input), project, input.requestedAt);

      return {
        status: "completed",
        summary: `生成经典镜头复刻：${project.source.director}《${project.source.film}》${project.source.shotName}`,
        assistantMessage: project.markdown,
        domainUpdates: {
          classicShots: nextState
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "经典镜头复刻生成失败";

      return {
        status: "failed",
        summary: message,
        assistantMessage: `经典镜头复刻生成失败：${message}`
      };
    }
  }
});

export default agent;
