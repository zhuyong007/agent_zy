import { randomUUID } from "node:crypto";

import { defineAgent, getModelClient } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type { CinematicContinuity, CinematicProject, CinematicState, StoryboardShot } from "@agent-zy/shared-types";

import { buildCinematicPrompt, CINEMATIC_SYSTEM_PROMPT } from "./prompts";
import type { CinematicGenerationInput } from "./types";

const HISTORY_LIMIT = 50;

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    const objectMatch = value.match(/\{[\s\S]*\}/);

    if (!objectMatch) {
      return null;
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

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

function extractTextContent(value: unknown): string | null {
  const direct = asString(value);

  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => {
        const record = asRecord(item);
        return asString(record?.text) ?? asString(record?.content);
      })
      .filter((item): item is string => Boolean(item))
      .join("\n");

    return joined || null;
  }

  const record = asRecord(value);

  return asString(record?.text) ?? asString(record?.content);
}

function normalizeModelPayload(value: unknown): unknown {
  if (asRecord(value)?.storyboard) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed ? normalizeModelPayload(parsed) : value;
  }

  if (Array.isArray(value)) {
    const projectCandidate = value.find((item) => Boolean(asRecord(item)?.storyboard));

    if (projectCandidate) {
      return projectCandidate;
    }

    const text = extractTextContent(value);
    const parsed = text ? parseJson(text) : null;

    return parsed ?? value;
  }

  const text = extractTextContent(value);
  const parsed = text ? parseJson(text) : null;

  return parsed ?? value;
}

function validateShot(value: unknown, index: number): StoryboardShot {
  const record = asRecord(value);

  if (!record) {
    throw new Error(`第 ${index + 1} 个分镜不是对象`);
  }

  const prompt = asRecord(record.prompt);
  const zhPrompt = asString(prompt?.zh);
  const enPrompt = asString(prompt?.en);
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
    !handoff ||
    !zhPrompt ||
    !enPrompt
  ) {
    throw new Error(`第 ${index + 1} 个分镜缺少必要字段或中英双语提示词`);
  }

  return {
    id: asString(record.id) ?? `shot-${index + 1}`,
    title,
    purpose,
    duration,
    cameraMovement,
    shotType,
    composition,
    transition,
    audioHint,
    emotionalBeat,
    handoff,
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

function validateProject(value: unknown, input: CinematicGenerationInput, requestedAt: string): CinematicProject {
  const record = asRecord(normalizeModelPayload(value));

  if (!record) {
    throw new Error("电影镜头设计输出不是 JSON 对象");
  }

  const title = asString(record.title);
  const concept = asString(record.concept) ?? input.concept;
  const mood = asString(record.mood);
  const script = asString(record.script);
  const storyboard = Array.isArray(record.storyboard)
    ? record.storyboard.map(validateShot)
    : [];
  const continuity = validateContinuity(record.continuity);
  const style = asString(record.style) ?? input.style ?? "电影感镜头设计";
  const pace = asString(record.pace) ?? input.pace ?? "情绪递进";
  const targetShotCount = asPositiveInteger(record.targetShotCount) ?? input.targetShotCount ?? storyboard.length;

  if (!title || !concept || !mood || !script) {
    throw new Error("电影镜头设计输出缺少 title、concept、mood 或 script");
  }

  if (storyboard.length < 4) {
    throw new Error("电影分镜至少需要 4 个镜头，才能形成完整情绪递进");
  }

  if (!continuity) {
    throw new Error("cinematic project is missing continuity design");
  }

  return {
    id: asString(record.id) ?? `cinematic-${randomUUID()}`,
    title,
    concept,
    mood,
    script,
    storyboard,
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
    return validateProject(parseJson(fixture), input, requestedAt);
  }

  const result = await getModelClient().generateText({
    agentId: "cinematic-agent",
    purpose: "vision",
    systemPrompt: CINEMATIC_SYSTEM_PROMPT,
    prompt: buildCinematicPrompt(input),
    temperature: 0.8,
    maxTokens: 6000
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
