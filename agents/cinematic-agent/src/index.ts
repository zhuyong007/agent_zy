import { randomUUID } from "node:crypto";

import { defineAgent, getModelClient, normalizeModelOutput, parseModelJson } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  CinematicContinuity,
  CinematicProject,
  CinematicScenePlan,
  CinematicState,
  StoryboardShot
} from "@agent-zy/shared-types";

import { buildCinematicPrompt, CINEMATIC_SYSTEM_PROMPT } from "./prompts";
import type { CinematicGenerationInput } from "./types";

const HISTORY_LIMIT = 50;

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

function validateShot(value: unknown, index: number): StoryboardShot {
  const record = asRecord(value);

  if (!record) {
    throw new Error(`第 ${index + 1} 个分镜不是对象`);
  }

  const prompt = asRecord(record.prompt);
  const zhPrompt = asString(prompt?.zh);
  const enPrompt = asString(prompt?.en);
  const sceneId = asString(record.sceneId);
  const sceneAnchor = asString(record.sceneAnchor);
  const title = asString(record.title);
  const purpose = asString(record.purpose);
  const duration = asString(record.duration);
  const cameraMovement = asString(record.cameraMovement);
  const shotType = asString(record.shotType);
  const composition = asString(record.composition);
  const transition = asString(record.transition);
  const audioHint = asString(record.audioHint);
  const emotionalBeat = asString(record.emotionalBeat);
  const handoff = asString(record.handoff);

  if (
    !title ||
    !purpose ||
    !duration ||
    !cameraMovement ||
    !shotType ||
    !composition ||
    !transition ||
    !audioHint ||
    !emotionalBeat ||
    !zhPrompt ||
    !enPrompt
  ) {
    throw new Error(`第 ${index + 1} 个分镜缺少必要字段或中英双语提示词`);
  }

  return {
    id: asString(record.id) ?? `shot-${index + 1}`,
    ...(sceneId ? { sceneId } : {}),
    ...(sceneAnchor ? { sceneAnchor } : {}),
    title,
    purpose,
    duration,
    cameraMovement,
    shotType,
    composition,
    transition,
    audioHint,
    emotionalBeat,
    ...(handoff ? { handoff } : {}),
    prompt: {
      zh: zhPrompt,
      en: enPrompt
    }
  };
}

function validateContinuity(value: unknown): CinematicContinuity | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const continuity = {
    actionLine: asString(record.actionLine),
    spatialLine: asString(record.spatialLine),
    emotionalLine: asString(record.emotionalLine),
    visualLine: asString(record.visualLine),
    audioLine: asString(record.audioLine)
  };

  return continuity.actionLine &&
    continuity.spatialLine &&
    continuity.emotionalLine &&
    continuity.visualLine &&
    continuity.audioLine
    ? (continuity as CinematicContinuity)
    : undefined;
}

function validateScenePlan(value: unknown): CinematicScenePlan | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const scenes = Array.isArray(record.scenes)
    ? record.scenes
        .map((item, index) => {
          const scene = asRecord(item);
          const id = asString(scene?.id) ?? `scene-${index + 1}`;
          const name = asString(scene?.name) ?? id;
          const anchor = asString(scene?.anchor);
          const role = asString(scene?.role) ?? "";

          return anchor
            ? {
                id,
                name,
                anchor,
                role
              }
            : null;
        })
        .filter((item): item is CinematicScenePlan["scenes"][number] => Boolean(item))
        .slice(0, 3)
    : [];

  if (scenes.length === 0) {
    return undefined;
  }

  const sceneCount = Math.min(Math.max(asPositiveInteger(record.sceneCount) ?? scenes.length, 1), 3);
  const maxDurationSeconds = Math.min(asPositiveInteger(record.maxDurationSeconds) ?? 15, 15);
  const limitedSceneCount = Math.min(sceneCount, scenes.length);

  return {
    sceneCount: limitedSceneCount,
    maxDurationSeconds,
    scenes: scenes.slice(0, limitedSceneCount)
  };
}

function buildFallbackHandoff(shot: StoryboardShot, nextShot: StoryboardShot | undefined) {
  if (!nextShot) {
    return `最后一镜以「${shot.emotionalBeat}」收束，保留画面、声音和情绪余韵作为结尾留白。`;
  }

  return `从「${shot.title}」延续动作、空间方向、光线质感和声音尾音，自然接入下一镜「${nextShot.title}」，避免跳切和场景漂移。`;
}

function buildFallbackScenePlan(input: {
  concept: string;
  style: string;
  storyboard: StoryboardShot[];
}): CinematicScenePlan {
  const firstShot = input.storyboard[0];

  return {
    sceneCount: 1,
    maxDurationSeconds: 15,
    scenes: [
      {
        id: "scene-1",
        name: input.concept || "main-scene",
        anchor: firstShot?.sceneAnchor || firstShot?.composition || input.style || "同一主场景",
        role: "承载整条15秒视频的主场景，多个分镜只改变机位、动作、光线细节和情绪。"
      }
    ]
  };
}

function withSceneAnchors(storyboard: StoryboardShot[], scenePlan: CinematicScenePlan) {
  const sceneById = new Map(scenePlan.scenes.map((scene) => [scene.id, scene]));
  const fallbackScene = scenePlan.scenes[0];

  return storyboard.map((shot) => {
    const scene = (shot.sceneId ? sceneById.get(shot.sceneId) : null) ?? fallbackScene;

    return {
      ...shot,
      sceneId: scene.id,
      sceneAnchor: shot.sceneAnchor ?? scene.anchor
    };
  });
}

function withContinuityHandoffs(storyboard: StoryboardShot[]) {
  return storyboard.map((shot, index) => ({
    ...shot,
    handoff: shot.handoff ?? buildFallbackHandoff(shot, storyboard[index + 1])
  }));
}

function buildFallbackContinuity(input: {
  concept: string;
  mood: string;
  style: string;
  pace: string;
  storyboard: StoryboardShot[];
}): CinematicContinuity {
  const firstShot = input.storyboard[0];
  const lastShot = input.storyboard.at(-1) ?? firstShot;

  return {
    actionLine: `围绕「${input.concept}」，让主体从「${firstShot?.purpose ?? input.mood}」逐步推进到「${lastShot?.purpose ?? input.mood}」，所有分镜按同一场戏的动作链连接。`,
    spatialLine: "延续每个分镜中的场景方位、主体位置、前景/中景/背景关系和光线方向，保持空间像同一地点或同一路径内连续发生。",
    emotionalLine: `情绪从「${firstShot?.emotionalBeat ?? input.mood}」递进到「${lastShot?.emotionalBeat ?? input.mood}」，每一镜都是上一镜的因果延伸。`,
    visualLine: `统一「${input.style}」的色彩、材质、天气、景深和镜头质感，让画面风格贯穿全片。`,
    audioLine: `用环境声、动作声或音乐尾音按「${input.pace}」连接镜头，声音不断裂，只随情绪轻微变化。`
  };
}

function validateProject(value: unknown, input: CinematicGenerationInput, requestedAt: string): CinematicProject {
  const record = asRecord(normalizeModelOutput(value));

  if (!record) {
    throw new Error("电影镜头设计输出不是 JSON 对象");
  }

  const title = asString(record.title);
  const concept = asString(record.concept) ?? input.concept;
  const mood = asString(record.mood);
  const script = asString(record.script);
  const rawStoryboard = Array.isArray(record.storyboard)
    ? record.storyboard.map(validateShot)
    : [];
  const style = asString(record.style) ?? input.style ?? "电影感镜头设计";
  const pace = asString(record.pace) ?? input.pace ?? "情绪递进";
  const targetShotCount = asPositiveInteger(record.targetShotCount) ?? input.targetShotCount ?? rawStoryboard.length;

  if (!title || !concept || !mood || !script) {
    throw new Error("电影镜头设计输出缺少 title、concept、mood 或 script");
  }

  if (rawStoryboard.length < 4) {
    throw new Error("电影分镜至少需要 4 个镜头，才能形成完整情绪递进");
  }

  const scenePlan =
    validateScenePlan(record.scenePlan) ??
    buildFallbackScenePlan({
      concept,
      style,
      storyboard: rawStoryboard
    });
  const storyboard = withContinuityHandoffs(withSceneAnchors(rawStoryboard, scenePlan));
  const continuity =
    validateContinuity(record.continuity) ??
    buildFallbackContinuity({
      concept,
      mood,
      style,
      pace,
      storyboard
    });

  return {
    id: asString(record.id) ?? `cinematic-${randomUUID()}`,
    title,
    concept,
    mood,
    script,
    storyboard,
    scenePlan,
    continuity,
    createdAt: asString(record.createdAt) ?? requestedAt,
    updatedAt: requestedAt,
    tags: asStringArray(record.tags).slice(0, 12),
    style,
    pace,
    targetShotCount
  };
}

function getCinematicState(input: AgentExecutionRequest): CinematicState {
  return input.state.cinematic ?? {
    projects: [],
    recentProjectIds: [],
    lastGeneratedAt: null,
    status: "idle",
    lastError: null
  };
}

function upsertProject(state: CinematicState, project: CinematicProject, generatedAt: string): CinematicState {
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

function resolveInput(input: AgentExecutionRequest): CinematicGenerationInput {
  const meta = input.meta ?? {};
  const concept =
    asString(meta.concept) ??
    asString(meta.message) ??
    asString(input.message) ??
    "孤独感的城市夜晚";
  const targetShotCount = asPositiveInteger(meta.targetShotCount);

  return {
    concept,
    style: asString(meta.style) ?? undefined,
    pace: asString(meta.pace) ?? undefined,
    targetShotCount: targetShotCount ?? undefined
  };
}

async function generateProject(input: CinematicGenerationInput, requestedAt: string): Promise<CinematicProject> {
  const fixture = process.env.CINEMATIC_PROJECT_FIXTURE_JSON;

  if (fixture) {
    return validateProject(parseModelJson(fixture), input, requestedAt);
  }

  const result = await getModelClient().generateText({
    agentId: "cinematic-agent",
    purpose: "vision",
    systemPrompt: CINEMATIC_SYSTEM_PROMPT,
    prompt: buildCinematicPrompt(input),
    temperature: 0.8,
    maxTokens: 6000,
    timeoutMs: 600_000,
    responseFormat: "json"
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
      const nextState = upsertProject(getCinematicState(input), project, input.requestedAt);

      return {
        status: "completed",
        summary: `生成电影镜头设计：${project.title}`,
        assistantMessage: `已生成《${project.title}》的电影分镜：${project.storyboard.length} 个镜头，核心情绪是「${project.mood}」。`,
        domainUpdates: {
          cinematic: nextState
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "电影镜头设计生成失败";

      return {
        status: "failed",
        summary: message,
        assistantMessage: `电影镜头设计生成失败：${message}`
      };
    }
  }
});

export default agent;
