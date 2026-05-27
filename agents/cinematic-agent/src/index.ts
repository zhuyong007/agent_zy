import { randomUUID } from "node:crypto";

import { defineAgent, getModelClient, normalizeModelOutput, parseModelJson } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type {
  CinematicContinuity,
  CinematicProject,
  CinematicReferenceAssets,
  CinematicReferencePrompt,
  CinematicReferenceViews,
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

function sanitizeFramePrompt(value: string, language: "zh" | "en") {
  const separators = language === "zh" ? /([，。；；])/ : /([,.；;])/;
  const forbiddenClausePattern =
    language === "zh"
      ? /(镜头|摄影机|运镜|推进|推近|拉远|后退|摇移|跟拍|转场|声音|音效|低频|环境音|嗡声|旁白)/
      : /(camera|pushes?|push in|pulls?|dolly|tracking|pan|tilt|transition|sound|audio|hum|voice|music)/i;
  const normalized =
    language === "zh"
      ? value
          .replace(/急剧收缩成/g, "呈")
          .replace(/迅速收缩成/g, "呈")
          .replace(/逐渐收缩成/g, "呈")
          .replace(/慢慢收缩成/g, "呈")
          .replace(/正在/g, "")
          .replace(/开始/g, "")
          .replace(/逐渐/g, "")
          .replace(/急剧/g, "")
          .replace(/迅速/g, "")
          .replace(/转头看向/g, "面向")
      : value
          .replace(/rapidly shrinks? into/gi, "appears as")
          .replace(/slowly pushes? in/gi, "")
          .replace(/\bis turning\b/gi, "faces")
          .replace(/\bturning\b/gi, "facing");
  const parts = normalized.split(separators);
  const kept: string[] = [];

  for (let index = 0; index < parts.length; index += 2) {
    const clause = parts[index]?.trim();
    const punctuation = parts[index + 1] ?? (language === "zh" ? "，" : ",");

    if (!clause || forbiddenClausePattern.test(clause)) {
      continue;
    }

    kept.push(`${clause}${punctuation}`);
  }

  return (kept.join("").trim() || normalized.trim()).replace(/\s+/g, " ");
}

function normalizeFieldName(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

function getField(record: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeFieldName));
  const entry = Object.entries(record).find(([key]) => normalizedKeys.has(normalizeFieldName(key)));

  return entry?.[1];
}

function getStringField(record: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  return asString(getField(record, ...keys));
}

function getPositiveIntegerField(record: Record<string, unknown> | null | undefined, ...keys: string[]): number | null {
  return asPositiveInteger(getField(record, ...keys));
}

function getArrayField(record: Record<string, unknown> | null | undefined, ...keys: string[]): unknown[] {
  const value = getField(record, ...keys);

  return Array.isArray(value) ? value : [];
}

function getProjectPayload(value: unknown): unknown {
  const normalized = normalizeModelOutput(value);
  const record = asRecord(normalized);

  if (!record) {
    return normalized;
  }

  if (getArrayField(record, "storyboard", "shots").length > 0) {
    return record;
  }

  for (const key of ["project", "cinematicProject", "cinematic_project", "data", "result", "output"]) {
    const candidate = normalizeModelOutput(getField(record, key));
    const candidateRecord = asRecord(candidate);

    if (candidateRecord && getArrayField(candidateRecord, "storyboard", "shots").length > 0) {
      return candidateRecord;
    }
  }

  const nestedProject = Object.values(record).find((candidate) => {
    const candidateRecord = asRecord(normalizeModelOutput(candidate));

    return Boolean(candidateRecord && getArrayField(candidateRecord, "storyboard", "shots").length > 0);
  });

  return nestedProject ?? record;
}

function validateShot(value: unknown, index: number): StoryboardShot {
  const record = asRecord(value);

  if (!record) {
    throw new Error(`第 ${index + 1} 个分镜不是对象`);
  }

  const prompt = asRecord(getField(record, "prompt"));
  const zhPrompt = getStringField(prompt, "zh") ?? getStringField(record, "zhPrompt", "promptZh", "prompt_zh");
  const enPrompt = getStringField(prompt, "en") ?? getStringField(record, "enPrompt", "promptEn", "prompt_en");
  const sceneId = getStringField(record, "sceneId", "scene_id");
  const sceneAnchor = getStringField(record, "sceneAnchor", "scene_anchor");
  const characterRefs = asStringArray(getField(record, "characterRefs", "character_refs"));
  const propRefs = asStringArray(getField(record, "propRefs", "prop_refs"));
  const sceneRef = getStringField(record, "sceneRef", "scene_ref");
  const title = getStringField(record, "title");
  const purpose = getStringField(record, "purpose");
  const duration = getStringField(record, "duration");
  const cameraMovement = getStringField(record, "cameraMovement", "camera_movement");
  const shotType = getStringField(record, "shotType", "shot_type");
  const composition = getStringField(record, "composition");
  const transition = getStringField(record, "transition");
  const audioHint = getStringField(record, "audioHint", "audio_hint");
  const emotionalBeat = getStringField(record, "emotionalBeat", "emotional_beat");
  const handoff = getStringField(record, "handoff");

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
    id: getStringField(record, "id") ?? `shot-${index + 1}`,
    ...(sceneId ? { sceneId } : {}),
    ...(sceneAnchor ? { sceneAnchor } : {}),
    ...(characterRefs.length ? { characterRefs } : {}),
    ...(propRefs.length ? { propRefs } : {}),
    ...(sceneRef ? { sceneRef } : {}),
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
      zh: sanitizeFramePrompt(zhPrompt, "zh"),
      en: sanitizeFramePrompt(enPrompt, "en")
    }
  };
}

function validateReferencePrompt(value: unknown): CinematicReferencePrompt | null {
  const record = asRecord(value);
  const zh = getStringField(record, "zh");
  const en = getStringField(record, "en");

  return zh && en ? { zh, en } : null;
}

function validateReferenceViews(value: unknown): CinematicReferenceViews | null {
  const record = asRecord(value);
  const front = validateReferencePrompt(getField(record, "front"));
  const side = validateReferencePrompt(getField(record, "side"));
  const back = validateReferencePrompt(getField(record, "back"));

  return front && side && back ? { front, side, back } : null;
}

function validateThreeViewReference(value: unknown, index: number, fallbackPrefix: string) {
  const record = asRecord(value);
  const views = validateReferenceViews(getField(record, "views"));
  const name = getStringField(record, "name");
  const description = getStringField(record, "description");

  if (!record || !views || !name || !description) {
    return null;
  }

  return {
    id: getStringField(record, "id") ?? `${fallbackPrefix}-${index + 1}`,
    name,
    description,
    views
  };
}

function validateSceneReference(value: unknown, index: number): CinematicReferenceAssets["scenes"][number] | null {
  const record = asRecord(value);
  const prompt = validateReferencePrompt(getField(record, "prompt"));
  const name = getStringField(record, "name");
  const description = getStringField(record, "description");

  if (!record || !prompt || !name || !description) {
    return null;
  }

  return {
    id: getStringField(record, "id") ?? `scene-ref-${index + 1}`,
    name,
    description,
    prompt
  };
}

function validateReferenceAssets(value: unknown): CinematicReferenceAssets | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const characters = getArrayField(record, "characters")
    .map((item, index) => validateThreeViewReference(item, index, "character"))
    .filter((item): item is CinematicReferenceAssets["characters"][number] => Boolean(item));
  const props = getArrayField(record, "props")
    .map((item, index) => validateThreeViewReference(item, index, "prop"))
    .filter((item): item is CinematicReferenceAssets["props"][number] => Boolean(item));
  const scenes = getArrayField(record, "scenes")
    .map(validateSceneReference)
    .filter((item): item is CinematicReferenceAssets["scenes"][number] => Boolean(item));

  return characters.length || props.length || scenes.length
    ? { characters, props, scenes }
    : undefined;
}

function validateContinuity(value: unknown): CinematicContinuity | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const continuity = {
    actionLine: getStringField(record, "actionLine", "action_line"),
    spatialLine: getStringField(record, "spatialLine", "spatial_line"),
    emotionalLine: getStringField(record, "emotionalLine", "emotional_line"),
    visualLine: getStringField(record, "visualLine", "visual_line"),
    audioLine: getStringField(record, "audioLine", "audio_line")
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

  const rawScenes = getArrayField(record, "scenes");
  const scenes = rawScenes.length
    ? rawScenes
        .map((item, index) => {
          const scene = asRecord(item);
          const id = getStringField(scene, "id") ?? `scene-${index + 1}`;
          const name = getStringField(scene, "name") ?? id;
          const anchor = getStringField(scene, "anchor");
          const role = getStringField(scene, "role") ?? "";

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

  const sceneCount = Math.min(Math.max(getPositiveIntegerField(record, "sceneCount", "scene_count") ?? scenes.length, 1), 3);
  const maxDurationSeconds = Math.min(getPositiveIntegerField(record, "maxDurationSeconds", "max_duration_seconds") ?? 15, 15);
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
  const record = asRecord(getProjectPayload(value));

  if (!record) {
    throw new Error("电影镜头设计输出不是 JSON 对象");
  }

  const title = getStringField(record, "title");
  const concept = getStringField(record, "concept") ?? input.concept;
  const mood = getStringField(record, "mood");
  const script = getStringField(record, "script");
  const rawStoryboard = getArrayField(record, "storyboard", "shots").length
    ? getArrayField(record, "storyboard", "shots").map(validateShot)
    : [];
  const style = getStringField(record, "style") ?? input.style ?? "电影感镜头设计";
  const pace = getStringField(record, "pace") ?? input.pace ?? "情绪递进";
  const targetShotCount = getPositiveIntegerField(record, "targetShotCount", "target_shot_count") ?? input.targetShotCount ?? rawStoryboard.length;
  const referenceAssets = validateReferenceAssets(getField(record, "referenceAssets", "reference_assets"));

  if (!title || !concept || !mood || !script) {
    throw new Error("电影镜头设计输出缺少 title、concept、mood 或 script");
  }

  if (rawStoryboard.length < 4) {
    throw new Error("电影分镜至少需要 4 个镜头，才能形成完整情绪递进");
  }

  const scenePlan =
    validateScenePlan(getField(record, "scenePlan", "scene_plan")) ??
    buildFallbackScenePlan({
      concept,
      style,
      storyboard: rawStoryboard
    });
  const storyboard = withContinuityHandoffs(withSceneAnchors(rawStoryboard, scenePlan));
  const continuity =
    validateContinuity(getField(record, "continuity")) ??
    buildFallbackContinuity({
      concept,
      mood,
      style,
      pace,
      storyboard
    });

  return {
    id: getStringField(record, "id") ?? `cinematic-${randomUUID()}`,
    title,
    concept,
    mood,
    script,
    storyboard,
    ...(referenceAssets ? { referenceAssets } : {}),
    scenePlan,
    continuity,
    createdAt: getStringField(record, "createdAt", "created_at") ?? requestedAt,
    updatedAt: requestedAt,
    tags: asStringArray(getField(record, "tags")).slice(0, 12),
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
    visualStyle: asString(meta.visualStyle) ?? undefined,
    pace: asString(meta.pace) ?? undefined,
    visualFocus: asString(meta.visualFocus) ?? undefined,
    negativePrompt: asString(meta.negativePrompt) ?? undefined,
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
