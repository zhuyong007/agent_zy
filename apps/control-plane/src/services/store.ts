import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { SUB_AGENT_HOME_MODULE_DEFINITIONS } from "@agent-zy/agent-registry/sub-agents";
import type {
  AppState,
  BrowserAutomationState,
  ChatMessage,
  ClassicShotDashboardSummary,
  ClassicShotProject,
  ClassicShotState,
  CinematicDashboardSummary,
  CinematicProject,
  CinematicState,
  DashboardData,
  HomeModuleId,
  HomeModulePreference,
  HomeModuleSize,
  LedgerDashboardSummary,
  LedgerEntry,
  LedgerFactRecord,
  LedgerReportRecord,
  LedgerSemanticRecord,
  HistoryPushState,
  HistoryXhsState,
  LifeStageRecord,
  ModelProfile,
  ModelProviderId,
  ModelPurpose,
  ModelSettingsState,
  NotificationRecord,
  NewsState,
  PromptTemplateRecord,
  PromptTemplateState,
  PromptTemplateVariable,
  SummaryDashboard,
  SummaryEntry,
  SummaryState,
  TopicDimensionBucket,
  TopicDimensionDefinition,
  TopicIdea,
  TopicState,
  ScheduleItem,
  TaskRecord
} from "@agent-zy/shared-types";
import type { AgentExecutionResult, AgentManifest } from "@agent-zy/agent-sdk";
import { groupTasksByStatus } from "@agent-zy/task-core";

import { createLedgerRepository } from "./ledger-repository";
import { getModelProvider } from "./model-providers";

function isEnoentError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function todayLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function seedScheduleItems(): ScheduleItem[] {
  const today = todayLocalDate();

  return [
    {
      id: "schedule_1",
      title: "梳理今天的重点任务",
      date: today,
      suggestedWindow: "09:00-10:00",
      urgency: "high",
      status: "pending"
    },
    {
      id: "schedule_2",
      title: "完成一个推进型任务",
      date: today,
      suggestedWindow: "14:00-16:00",
      urgency: "medium",
      status: "pending"
    },
    {
      id: "schedule_3",
      title: "晚间复盘并确认待办完成情况",
      date: today,
      suggestedWindow: "21:30-22:00",
      urgency: "medium",
      status: "pending"
    }
  ];
}

const CORE_HOME_MODULE_DEFINITIONS = [
  {
    id: "chat",
    defaultSize: "max",
    defaultVisible: true
  }
] as const satisfies ReadonlyArray<{
  id: HomeModuleId;
  defaultSize: HomeModuleSize;
  defaultVisible: boolean;
}>;

const HOME_MODULE_DEFINITIONS = [
  ...SUB_AGENT_HOME_MODULE_DEFINITIONS.slice(0, 1),
  ...CORE_HOME_MODULE_DEFINITIONS,
  ...SUB_AGENT_HOME_MODULE_DEFINITIONS.slice(1)
] as const;

const HOME_MODULE_NAVIGATION_ROUTES = new Set<HomeModuleId>([
  "news",
  "topics",
  "ledger",
  "todo",
  "history",
  "cinematic",
  "classicShots",
  "summary"
]);

function canShowHomeModuleInNavigation(id: HomeModuleId) {
  return HOME_MODULE_NAVIGATION_ROUTES.has(id);
}

function getDefaultHomeLayout(): HomeModulePreference[] {
  return HOME_MODULE_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    visible: definition.defaultVisible,
    showInNavigation: canShowHomeModuleInNavigation(definition.id) && definition.defaultVisible,
    size: definition.defaultSize,
    collapsed: false,
    order: index
  }));
}

function normalizeOrder(layout: HomeModulePreference[]) {
  return [...layout]
    .sort((first, second) => first.order - second.order)
    .map((item, index) => ({
      ...item,
      order: index
    }));
}

function normalizeHomeLayout(layout: HomeModulePreference[] | undefined): HomeModulePreference[] {
  if (!layout || layout.length === 0) {
    return getDefaultHomeLayout();
  }

  const defaults = getDefaultHomeLayout();
  const storedById = new Map((layout ?? []).map((item) => [item.id, item]));
  const fallbackOrderOffset =
    (layout ?? []).reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1;

  return normalizeOrder(
    defaults.map((definition, index) => {
      const stored = storedById.get(definition.id);

      if (!stored) {
        return {
          ...definition,
          visible: false,
          showInNavigation: false,
          order: fallbackOrderOffset + index
        };
      }

      return {
        id: definition.id,
        visible: stored.visible,
        showInNavigation: canShowHomeModuleInNavigation(definition.id) && stored.showInNavigation,
        size: stored.size,
        collapsed: stored.collapsed,
        order: stored.order,
        ...(Object.prototype.hasOwnProperty.call(stored, "customName")
          ? { customName: stored.customName }
          : {})
      };
    })
  );
}

function createInitialState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: getDefaultHomeLayout(),
    ledger: {
      entries: [],
      modules: [],
      dashboard: createEmptyLedgerDashboardSummary()
    },
    schedule: {
      items: seedScheduleItems(),
      pendingReview: null
    },
    news: {
      feed: {
        count: 0,
        hasNext: false,
        nextCursor: null,
        items: []
      },
      daily: null,
      dailyArchive: [],
      lastFetchedAt: null,
      lastUpdatedAt: null,
      lastError: null,
      status: "idle"
    },
    topics: {
      dimensions: [],
      current: [],
      currentByDimension: [],
      history: [],
      lastGeneratedAt: null,
      status: "idle",
      strategy: "manual-curation",
      lastError: null
    },
    cinematic: createEmptyCinematicState(),
    classicShots: createEmptyClassicShotState(),
    browserAutomation: createEmptyBrowserAutomationState(),
    promptTemplates: createEmptyPromptTemplateState(),
    summary: createEmptySummaryState(),
    historyXhs: createEmptyHistoryXhsState(),
    historyPush: {
      lastTriggeredDate: null
    },
    nightlyReview: {
      lastTriggeredDate: null
    },
    modelSettings: createInitialModelSettingsState()
  };
}

function nowIso() {
  return new Date().toISOString();
}

function createEnvModelScopeProfile(createdAt = nowIso()): ModelProfile {
  return {
    id: "modelscope-default",
    displayName: "ModelScope 默认模型",
    provider: "modelscope",
    modelName: process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B",
    baseUrl: process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1",
    apiKeyRef: "env:MODELSCOPE_API_KEY",
    capabilities: ["chat", "text", "vision"],
    temperature: 0.7,
    maxTokens: 2000,
    enabled: true,
    isDefault: true,
    purpose: ["general", "summary", "vision"],
    createdAt,
    updatedAt: createdAt
  };
}

function createInitialModelSettingsState(): ModelSettingsState {
  const createdAt = nowIso();

  if (process.env.MODELSCOPE_API_KEY) {
    const profile: ModelProfile = {
      id: "modelscope-default",
      displayName: "ModelScope 默认模型",
      provider: "modelscope",
      modelName: process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B",
      baseUrl: process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1",
      apiKeyRef: "env:MODELSCOPE_API_KEY",
      capabilities: ["chat", "text", "vision"],
      temperature: 0.7,
      maxTokens: 2000,
      enabled: true,
      isDefault: true,
      purpose: ["general", "summary", "vision"],
      createdAt,
      updatedAt: createdAt
    };

    return {
      profiles: [profile],
      defaultProfileId: profile.id,
      purposeDefaults: {
        general: profile.id,
        summary: profile.id,
        vision: profile.id
      },
      agentDefaults: {},
      lastUpdatedAt: createdAt
    };
  }

  return {
    profiles: [
      {
        id: "modelscope-example",
        displayName: "ModelScope 示例配置",
        provider: "modelscope",
        modelName: process.env.MODELSCOPE_MODEL ?? "Qwen/Qwen3-235B-A22B",
        baseUrl: process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1",
        apiKeyRef: null,
        capabilities: ["chat", "text", "vision"],
        temperature: 0.7,
        maxTokens: 2000,
        enabled: false,
        isDefault: false,
        purpose: ["general", "vision"],
        createdAt,
        updatedAt: createdAt
      }
    ],
    defaultProfileId: null,
    purposeDefaults: {},
    agentDefaults: {},
    lastUpdatedAt: createdAt
  };
}

function createEmptySummaryState(): SummaryState {
  return {
    entries: [],
    drafts: [],
    lastUpdatedAt: null,
    settings: {
      defaultSummaryType: "daily"
    }
  };
}

const XHS_ANALYTICS_URL = "https://creator.xiaohongshu.com/statistics/data-analysis";

function createEmptyHistoryXhsState(): HistoryXhsState {
  return {
    posts: [],
    overview: {
      postCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalCollects: 0,
      totalComments: 0,
      totalShares: 0,
      engagementRate: null
    },
    lastSyncedAt: null,
    status: "idle",
    lastError: null,
    sourceUrl: XHS_ANALYTICS_URL
  };
}

function createEmptyCinematicState(): CinematicState {
  return {
    projects: [],
    recentProjectIds: [],
    lastGeneratedAt: null,
    status: "idle",
    lastError: null
  };
}

function createEmptyClassicShotState(): ClassicShotState {
  return {
    projects: [],
    recentProjectIds: [],
    lastGeneratedAt: null,
    status: "idle",
    lastError: null
  };
}

function createEmptyBrowserAutomationState(): BrowserAutomationState {
  return {
    workflows: [],
    runs: [],
    triggerRules: [],
    lastUpdatedAt: null
  };
}

function createEmptyPromptTemplateState(): PromptTemplateState {
  return {
    items: [],
    lastUpdatedAt: null
  };
}

function normalizeBrowserAutomationState(
  browserAutomation: Partial<BrowserAutomationState> | undefined
): BrowserAutomationState {
  return {
    workflows: Array.isArray(browserAutomation?.workflows) ? browserAutomation.workflows : [],
    runs: Array.isArray(browserAutomation?.runs) ? browserAutomation.runs.slice(0, 50) : [],
    triggerRules: Array.isArray(browserAutomation?.triggerRules) ? browserAutomation.triggerRules : [],
    lastUpdatedAt: typeof browserAutomation?.lastUpdatedAt === "string" ? browserAutomation.lastUpdatedAt : null
  };
}

function normalizePromptTemplateVariable(variable: Partial<PromptTemplateVariable>, index: number): PromptTemplateVariable {
  const key = typeof variable.key === "string" && variable.key.trim()
    ? variable.key.trim()
    : `variable_${index + 1}`;
  const label = typeof variable.label === "string" && variable.label.trim()
    ? variable.label.trim()
    : key;

  return {
    id: typeof variable.id === "string" && variable.id.trim() ? variable.id.trim() : `prompt-variable-${index + 1}`,
    key,
    label,
    description: typeof variable.description === "string" ? variable.description : "",
    defaultValue: typeof variable.defaultValue === "string" ? variable.defaultValue : "",
    required: typeof variable.required === "boolean" ? variable.required : true
  };
}

function normalizePromptTemplateRecord(template: Partial<PromptTemplateRecord>, index: number): PromptTemplateRecord {
  const now = nowIso();
  const createdAt = typeof template.createdAt === "string" ? template.createdAt : now;
  const updatedAt = typeof template.updatedAt === "string" ? template.updatedAt : createdAt;
  const originalPrompt = typeof template.originalPrompt === "string" ? template.originalPrompt : "";
  const templatePrompt = typeof template.templatePrompt === "string" && template.templatePrompt.trim()
    ? template.templatePrompt
    : originalPrompt;
  const analysisStatus =
    template.analysisStatus === "completed" || template.analysisStatus === "failed" || template.analysisStatus === "pending"
      ? template.analysisStatus
      : "completed";

  return {
    id: typeof template.id === "string" && template.id.trim() ? template.id : `prompt-template-${index + 1}`,
    title: typeof template.title === "string" && template.title.trim() ? template.title : "未命名提示词模版",
    originalPrompt,
    templatePrompt,
    variables: Array.isArray(template.variables)
      ? template.variables.map(normalizePromptTemplateVariable)
      : [],
    analysisStatus,
    analysisError: typeof template.analysisError === "string" ? template.analysisError : null,
    createdAt,
    updatedAt,
    lastUsedAt: typeof template.lastUsedAt === "string" ? template.lastUsedAt : null
  };
}

function normalizePromptTemplateState(
  promptTemplates: Partial<PromptTemplateState> | undefined
): PromptTemplateState {
  return {
    items: Array.isArray(promptTemplates?.items)
      ? promptTemplates.items
          .map(normalizePromptTemplateRecord)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      : [],
    lastUpdatedAt: typeof promptTemplates?.lastUpdatedAt === "string" ? promptTemplates.lastUpdatedAt : null
  };
}

function createEmptyLedgerDashboardSummary(): LedgerDashboardSummary {
  return {
    todayIncomeCents: 0,
    todayExpenseCents: 0,
    rolling7dNetCents: 0,
    recentFacts: [],
    coachTip: null,
    pendingReviewCount: 0
  };
}

function normalizeStoryboardShot(shot: CinematicProject["storyboard"][number], index: number) {
  const handoff = typeof shot.handoff === "string" && shot.handoff.trim() ? shot.handoff : undefined;
  const sceneId = typeof shot.sceneId === "string" && shot.sceneId.trim() ? shot.sceneId : undefined;
  const sceneAnchor = typeof shot.sceneAnchor === "string" && shot.sceneAnchor.trim() ? shot.sceneAnchor : undefined;
  const characterRefs = Array.isArray(shot.characterRefs)
    ? shot.characterRefs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const propRefs = Array.isArray(shot.propRefs)
    ? shot.propRefs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const sceneRef = typeof shot.sceneRef === "string" && shot.sceneRef.trim() ? shot.sceneRef : undefined;

  return {
    id: typeof shot.id === "string" && shot.id ? shot.id : `shot-${index + 1}`,
    ...(sceneId ? { sceneId } : {}),
    ...(sceneAnchor ? { sceneAnchor } : {}),
    ...(characterRefs.length ? { characterRefs } : {}),
    ...(propRefs.length ? { propRefs } : {}),
    ...(sceneRef ? { sceneRef } : {}),
    title: typeof shot.title === "string" ? shot.title : `镜头 ${index + 1}`,
    purpose: typeof shot.purpose === "string" ? shot.purpose : "",
    duration: typeof shot.duration === "string" ? shot.duration : "",
    cameraMovement: typeof shot.cameraMovement === "string" ? shot.cameraMovement : "",
    shotType: typeof shot.shotType === "string" ? shot.shotType : "",
    composition: typeof shot.composition === "string" ? shot.composition : "",
    transition: typeof shot.transition === "string" ? shot.transition : "",
    audioHint: typeof shot.audioHint === "string" ? shot.audioHint : "",
    emotionalBeat: typeof shot.emotionalBeat === "string" ? shot.emotionalBeat : "",
    ...(handoff ? { handoff } : {}),
    prompt: {
      zh: typeof shot.prompt?.zh === "string" ? shot.prompt.zh : "",
      en: typeof shot.prompt?.en === "string" ? shot.prompt.en : ""
    }
  };
}

function normalizeReferencePrompt(prompt: unknown) {
  const record = prompt && typeof prompt === "object" && !Array.isArray(prompt)
    ? (prompt as { zh?: unknown; en?: unknown })
    : null;
  const zh = typeof record?.zh === "string" ? record.zh : "";
  const en = typeof record?.en === "string" ? record.en : "";

  return zh.trim() || en.trim() ? { zh, en } : null;
}

function normalizeReferenceViews(views: unknown) {
  const record = views && typeof views === "object" && !Array.isArray(views)
    ? (views as { front?: unknown; side?: unknown; back?: unknown })
    : null;
  const front = normalizeReferencePrompt(record?.front);
  const side = normalizeReferencePrompt(record?.side);
  const back = normalizeReferencePrompt(record?.back);

  return front && side && back ? { front, side, back } : null;
}

function normalizeCinematicReferenceAssets(
  referenceAssets: Partial<CinematicProject["referenceAssets"]> | undefined
): CinematicProject["referenceAssets"] | undefined {
  if (!referenceAssets) {
    return undefined;
  }

  const characters = Array.isArray(referenceAssets.characters)
    ? referenceAssets.characters
        .map((asset, index) => {
          const views = normalizeReferenceViews(asset.views);
          const name = typeof asset.name === "string" && asset.name.trim() ? asset.name : `人物 ${index + 1}`;
          const description = typeof asset.description === "string" ? asset.description : "";

          return views
            ? {
                id: typeof asset.id === "string" && asset.id.trim() ? asset.id : `character-${index + 1}`,
                name,
                description,
                views
              }
            : null;
        })
        .filter((asset): asset is NonNullable<CinematicProject["referenceAssets"]>["characters"][number] => Boolean(asset))
    : [];
  const props = Array.isArray(referenceAssets.props)
    ? referenceAssets.props
        .map((asset, index) => {
          const views = normalizeReferenceViews(asset.views);
          const name = typeof asset.name === "string" && asset.name.trim() ? asset.name : `物品 ${index + 1}`;
          const description = typeof asset.description === "string" ? asset.description : "";

          return views
            ? {
                id: typeof asset.id === "string" && asset.id.trim() ? asset.id : `prop-${index + 1}`,
                name,
                description,
                views
              }
            : null;
        })
        .filter((asset): asset is NonNullable<CinematicProject["referenceAssets"]>["props"][number] => Boolean(asset))
    : [];
  const scenes = Array.isArray(referenceAssets.scenes)
    ? referenceAssets.scenes
        .map((asset, index) => {
          const prompt = normalizeReferencePrompt(asset.prompt);
          const name = typeof asset.name === "string" && asset.name.trim() ? asset.name : `场景 ${index + 1}`;
          const description = typeof asset.description === "string" ? asset.description : "";

          return prompt
            ? {
                id: typeof asset.id === "string" && asset.id.trim() ? asset.id : `scene-ref-${index + 1}`,
                name,
                description,
                prompt
              }
            : null;
        })
        .filter((asset): asset is NonNullable<CinematicProject["referenceAssets"]>["scenes"][number] => Boolean(asset))
    : [];

  return characters.length || props.length || scenes.length ? { characters, props, scenes } : undefined;
}

function compactCinematicText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function cinematicStoryboardMentionsCharacter(storyboard: CinematicProject["storyboard"]) {
  const text = storyboard
    .flatMap((shot) => [
      shot.title,
      shot.purpose,
      shot.shotType,
      shot.composition,
      shot.emotionalBeat,
      shot.prompt.zh,
      shot.prompt.en
    ])
    .join(" ");

  return /(人物|主角|角色|女孩|女人|男人|少年|少女|老人|少女|subject|character|person|figure|woman|man|girl|boy)/i.test(text);
}

function buildFallbackCinematicScenePlan(project: Partial<CinematicProject>, storyboard: CinematicProject["storyboard"]) {
  const firstShot = storyboard[0];
  const anchor = firstShot?.sceneAnchor || firstShot?.composition || project.concept || project.style || "";

  return anchor
    ? {
        sceneCount: 1,
        maxDurationSeconds: 15,
        scenes: [
          {
            id: "scene-1",
            name: typeof project.concept === "string" && project.concept.trim() ? project.concept : "main-scene",
            anchor,
            role: "Main continuous scene for the cinematic storyboard."
          }
        ]
      }
    : undefined;
}

function buildFallbackCinematicReferenceAssets(input: {
  project: Partial<CinematicProject>;
  storyboard: CinematicProject["storyboard"];
  scenePlan: CinematicProject["scenePlan"] | undefined;
  referenceAssets: CinematicProject["referenceAssets"] | undefined;
}) {
  const characters = [...(input.referenceAssets?.characters ?? [])];
  const props = input.referenceAssets?.props ?? [];
  const scenes = [...(input.referenceAssets?.scenes ?? [])];
  const concept = typeof input.project.concept === "string" && input.project.concept.trim() ? input.project.concept : "cinematic subject";
  const mood = typeof input.project.mood === "string" && input.project.mood.trim() ? input.project.mood : "cinematic mood";
  const style = typeof input.project.style === "string" && input.project.style.trim() ? input.project.style : "cinematic style";
  const firstShot = input.storyboard[0];
  const visualSeed = compactCinematicText([
    concept,
    firstShot?.purpose,
    firstShot?.composition,
    firstShot?.prompt.zh
  ].filter(Boolean).join("，"));
  const englishSeed = compactCinematicText([
    concept,
    firstShot?.purpose,
    firstShot?.composition,
    firstShot?.prompt.en
  ].filter(Boolean).join(", "));

  if (characters.length === 0 && cinematicStoryboardMentionsCharacter(input.storyboard)) {
    characters.push({
      id: "character-1",
      name: `${concept}主角`,
      description: `Standalone character reference for ${concept}, mood: ${mood}, style: ${style}.`,
      views: {
        front: {
          zh: `人物参考图提示词（正面三视图）：纯色或极简背景，完整正面站姿，固定同一人物的脸型、发型、服装、比例、材质、色彩和识别特征；参考分镜视觉线索：${visualSeed}。`,
          en: `Character reference prompt, front view sheet: plain or minimal background, full front standing pose, fixed face shape, hairstyle, costume, proportions, materials, colors, and identifying features; visual cues: ${englishSeed}.`
        },
        side: {
          zh: `人物参考图提示词（侧面三视图）：纯色或极简背景，完整侧面站姿，保持与正面完全一致的人物脸型、发型、服装比例、材质、色彩和识别特征；风格保持${style}。`,
          en: `Character reference prompt, side view sheet: plain or minimal background, full side standing pose, preserving the same face shape, hairstyle, costume proportions, materials, colors, and identifying features; keep the ${style} style.`
        },
        back: {
          zh: "人物参考图提示词（背面三视图）：纯色或极简背景，完整背面站姿，明确服装背部结构、发型后轮廓、身形比例、材质和色彩；与正面、侧面设定完全一致。",
          en: "Character reference prompt, back view sheet: plain or minimal background, full back standing pose, clear costume back structure, rear hairstyle silhouette, body proportions, materials, and colors; fully consistent with the front and side views."
        }
      }
    });
  }

  if (scenes.length === 0 && input.scenePlan?.scenes.length) {
    scenes.push(
      ...input.scenePlan.scenes.map((scene, index) => ({
        id: `scene-ref-${index + 1}`,
        name: scene.name || `场景 ${index + 1}`,
        description: scene.anchor,
        prompt: {
          zh: `场景参考图提示词：只生成一张场景基准图，不需要三视图；固定地点、空间布局、关键道具位置、人物活动区域、光线方向、色彩、天气、材质和环境质感。场景锚点：${scene.anchor}。整体风格：${style}。`,
          en: `Scene reference image prompt: generate one baseline scene image only, no three-view sheet; lock the location, spatial layout, key prop positions, character activity area, light direction, colors, weather, materials, and atmosphere. Scene anchor: ${scene.anchor}. Overall style: ${style}.`
        }
      }))
    );
  }

  return characters.length || props.length || scenes.length ? { characters, props, scenes } : undefined;
}

function applyCinematicReferenceRefs(
  storyboard: CinematicProject["storyboard"],
  referenceAssets: CinematicProject["referenceAssets"] | undefined
) {
  if (!referenceAssets) {
    return storyboard;
  }

  const firstCharacterId = referenceAssets.characters[0]?.id;
  const firstSceneId = referenceAssets.scenes[0]?.id;

  return storyboard.map((shot) => ({
    ...shot,
    ...(firstCharacterId && !shot.characterRefs?.length ? { characterRefs: [firstCharacterId] } : {}),
    ...(firstSceneId && !shot.sceneRef ? { sceneRef: firstSceneId } : {})
  }));
}

function normalizeCinematicContinuity(
  continuity: Partial<CinematicProject["continuity"]> | undefined
): CinematicProject["continuity"] | undefined {
  if (!continuity) {
    return undefined;
  }

  const next = {
    actionLine: typeof continuity.actionLine === "string" ? continuity.actionLine : "",
    spatialLine: typeof continuity.spatialLine === "string" ? continuity.spatialLine : "",
    emotionalLine: typeof continuity.emotionalLine === "string" ? continuity.emotionalLine : "",
    visualLine: typeof continuity.visualLine === "string" ? continuity.visualLine : "",
    audioLine: typeof continuity.audioLine === "string" ? continuity.audioLine : ""
  };

  return Object.values(next).some((value) => value.trim().length > 0) ? next : undefined;
}

function normalizeCinematicScenePlan(
  scenePlan: CinematicProject["scenePlan"] | undefined
): CinematicProject["scenePlan"] | undefined {
  if (!scenePlan) {
    return undefined;
  }

  const scenes = Array.isArray(scenePlan.scenes)
    ? scenePlan.scenes
        .map((scene, index) => {
          const id = typeof scene.id === "string" && scene.id.trim() ? scene.id : `scene-${index + 1}`;
          const name = typeof scene.name === "string" && scene.name.trim() ? scene.name : id;
          const anchor = typeof scene.anchor === "string" && scene.anchor.trim() ? scene.anchor : "";
          const role = typeof scene.role === "string" ? scene.role : "";

          return anchor
            ? {
                id,
                name,
                anchor,
                role
              }
            : null;
        })
        .filter((scene): scene is NonNullable<CinematicProject["scenePlan"]>["scenes"][number] => Boolean(scene))
        .slice(0, 3)
    : [];

  if (scenes.length === 0) {
    return undefined;
  }

  const sceneCount =
    typeof scenePlan.sceneCount === "number" && Number.isInteger(scenePlan.sceneCount)
      ? scenePlan.sceneCount
      : scenes.length;
  const maxDurationSeconds =
    typeof scenePlan.maxDurationSeconds === "number" && Number.isInteger(scenePlan.maxDurationSeconds)
      ? scenePlan.maxDurationSeconds
      : 15;
  const limitedSceneCount = Math.min(Math.max(sceneCount, 1), 3, scenes.length);

  return {
    sceneCount: limitedSceneCount,
    maxDurationSeconds: Math.min(Math.max(maxDurationSeconds, 1), 15),
    scenes: scenes.slice(0, limitedSceneCount)
  };
}

function normalizeCinematicProject(project: Partial<CinematicProject>, index: number): CinematicProject {
  const now = nowIso();
  const storyboard = Array.isArray(project.storyboard)
    ? project.storyboard.map(normalizeStoryboardShot)
    : [];
  const scenePlan = normalizeCinematicScenePlan(project.scenePlan) ?? buildFallbackCinematicScenePlan(project, storyboard);
  const continuity = normalizeCinematicContinuity(project.continuity);
  const referenceAssets = buildFallbackCinematicReferenceAssets({
    project,
    storyboard,
    scenePlan,
    referenceAssets: normalizeCinematicReferenceAssets(project.referenceAssets)
  });
  const storyboardWithRefs = applyCinematicReferenceRefs(storyboard, referenceAssets);

  return {
    id: typeof project.id === "string" && project.id ? project.id : `cinematic-${index}`,
    title: typeof project.title === "string" && project.title ? project.title : "未命名电影分镜",
    concept: typeof project.concept === "string" ? project.concept : "",
    mood: typeof project.mood === "string" ? project.mood : "",
    script: typeof project.script === "string" ? project.script : "",
    storyboard: storyboardWithRefs,
    ...(referenceAssets ? { referenceAssets } : {}),
    ...(scenePlan ? { scenePlan } : {}),
    ...(continuity ? { continuity } : {}),
    createdAt: typeof project.createdAt === "string" ? project.createdAt : now,
    updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : now,
    tags: Array.isArray(project.tags)
      ? project.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    style: typeof project.style === "string" ? project.style : "",
    pace: typeof project.pace === "string" ? project.pace : "",
    targetShotCount:
      typeof project.targetShotCount === "number" && Number.isInteger(project.targetShotCount) && project.targetShotCount > 0
        ? project.targetShotCount
        : storyboard.length
  };
}

function normalizeCinematicState(cinematic: Partial<CinematicState> | undefined): CinematicState {
  const projects = (cinematic?.projects ?? [])
    .map(normalizeCinematicProject)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const projectIds = new Set(projects.map((project) => project.id));
  const recentProjectIds = [
    ...(cinematic?.recentProjectIds ?? []),
    ...projects.map((project) => project.id)
  ]
    .filter((id, index, ids): id is string => typeof id === "string" && projectIds.has(id) && ids.indexOf(id) === index)
    .slice(0, 12);

  return {
    projects,
    recentProjectIds,
    lastGeneratedAt: cinematic?.lastGeneratedAt ?? projects[0]?.updatedAt ?? null,
    status: cinematic?.status === "generating" ? "generating" : "idle",
    lastError: cinematic?.lastError ?? null
  };
}

function buildCinematicDashboard(cinematic: CinematicState): CinematicDashboardSummary {
  const projectById = new Map(cinematic.projects.map((project) => [project.id, project]));
  const recentProjects = cinematic.recentProjectIds
    .map((id) => projectById.get(id))
    .filter((project): project is CinematicProject => Boolean(project))
    .slice(0, 4);
  const latestProject = recentProjects[0] ?? cinematic.projects[0] ?? null;

  return {
    projectCount: cinematic.projects.length,
    recentProjects,
    latestProject,
    lastGeneratedAt: cinematic.lastGeneratedAt,
    totalShotCount: cinematic.projects.reduce((count, project) => count + project.storyboard.length, 0),
    todayInspiration: latestProject
      ? `${latestProject.mood} · ${latestProject.style || latestProject.title}`
      : "把一个情绪变成镜头：先找光，再找沉默。"
  };
}

function normalizeClassicShotStoryboard(
  shot: ClassicShotProject["storyboard"][number],
  index: number
): ClassicShotProject["storyboard"][number] {
  return {
    id: typeof shot.id === "string" && shot.id ? shot.id : `shot-${index + 1}`,
    title: typeof shot.title === "string" ? shot.title : `分镜 ${index + 1}`,
    function: typeof shot.function === "string" ? shot.function : "",
    prompt: typeof shot.prompt === "string" ? shot.prompt : "",
    movementKeywords: Array.isArray(shot.movementKeywords)
      ? shot.movementKeywords.filter((item): item is string => typeof item === "string")
      : [],
    visualKeywords: Array.isArray(shot.visualKeywords)
      ? shot.visualKeywords.filter((item): item is string => typeof item === "string")
      : [],
    ...(typeof shot.sourceFrame?.index === "number" && typeof shot.sourceFrame?.timestampSeconds === "number"
      ? {
          sourceFrame: {
            index: shot.sourceFrame.index,
            timestampSeconds: shot.sourceFrame.timestampSeconds
          }
        }
      : {})
  };
}

function normalizeClassicShotProject(project: Partial<ClassicShotProject>, index: number): ClassicShotProject {
  const now = nowIso();
  const storyboard = Array.isArray(project.storyboard)
    ? project.storyboard.map(normalizeClassicShotStoryboard)
    : [];

  return {
    id: typeof project.id === "string" && project.id ? project.id : `classic-shot-${index}`,
    rawInput: typeof project.rawInput === "string" ? project.rawInput : "",
    title: typeof project.title === "string" && project.title ? project.title : "未命名经典镜头复刻",
    referenceType: project.referenceType === "uploaded-video" ? "uploaded-video" : "classic-film",
    source: {
      director: typeof project.source?.director === "string" ? project.source.director : "",
      film: typeof project.source?.film === "string" ? project.source.film : "",
      year: typeof project.source?.year === "number" ? project.source.year : 0,
      shotName: typeof project.source?.shotName === "string" ? project.source.shotName : "",
      shotPosition: typeof project.source?.shotPosition === "string" ? project.source.shotPosition : "",
      ...(typeof project.source?.context === "string" ? { context: project.source.context } : {})
    },
    ...(project.videoReference
      ? {
          videoReference: {
            fileName: typeof project.videoReference.fileName === "string" ? project.videoReference.fileName : "",
            durationSeconds:
              typeof project.videoReference.durationSeconds === "number" ? project.videoReference.durationSeconds : 0,
            extractedFrameCount:
              typeof project.videoReference.extractedFrameCount === "number" ? project.videoReference.extractedFrameCount : 0,
            revisionInstruction:
              typeof project.videoReference.revisionInstruction === "string" ? project.videoReference.revisionInstruction : ""
          }
        }
      : {}),
    coreValue: typeof project.coreValue === "string" ? project.coreValue : "",
    analysis: {
      cameraMovement: typeof project.analysis?.cameraMovement === "string" ? project.analysis.cameraMovement : "",
      lighting: typeof project.analysis?.lighting === "string" ? project.analysis.lighting : "",
      emotionCurve: typeof project.analysis?.emotionCurve === "string" ? project.analysis.emotionCurve : ""
    },
    minimumStoryboardCount:
      typeof project.minimumStoryboardCount === "number" &&
      Number.isInteger(project.minimumStoryboardCount) &&
      project.minimumStoryboardCount > 0
        ? project.minimumStoryboardCount
        : Math.max(storyboard.length, 1),
    storyboard,
    continuity: {
      actionContinuity: typeof project.continuity?.actionContinuity === "string" ? project.continuity.actionContinuity : "",
      cameraContinuity: typeof project.continuity?.cameraContinuity === "string" ? project.continuity.cameraContinuity : "",
      lightingContinuity: typeof project.continuity?.lightingContinuity === "string" ? project.continuity.lightingContinuity : "",
      colorContinuity: typeof project.continuity?.colorContinuity === "string" ? project.continuity.colorContinuity : "",
      antiJumpGuidance: typeof project.continuity?.antiJumpGuidance === "string" ? project.continuity.antiJumpGuidance : ""
    },
    ...(typeof project.storyboardVideoPrompt === "string" ? { storyboardVideoPrompt: project.storyboardVideoPrompt } : {}),
    markdown: typeof project.markdown === "string" ? project.markdown : "",
    targetPlatform: project.targetPlatform ?? "generic",
    createdAt: typeof project.createdAt === "string" ? project.createdAt : now,
    updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : now
  };
}

function normalizeClassicShotState(classicShots: Partial<ClassicShotState> | undefined): ClassicShotState {
  const projects = (classicShots?.projects ?? [])
    .map(normalizeClassicShotProject)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const projectIds = new Set(projects.map((project) => project.id));
  const recentProjectIds = [
    ...(classicShots?.recentProjectIds ?? []),
    ...projects.map((project) => project.id)
  ]
    .filter((id, index, ids): id is string => typeof id === "string" && projectIds.has(id) && ids.indexOf(id) === index)
    .slice(0, 12);

  return {
    projects,
    recentProjectIds,
    lastGeneratedAt: classicShots?.lastGeneratedAt ?? projects[0]?.updatedAt ?? null,
    status: classicShots?.status === "generating" ? "generating" : "idle",
    lastError: classicShots?.lastError ?? null
  };
}

function buildClassicShotDashboard(classicShots: ClassicShotState): ClassicShotDashboardSummary {
  const projectById = new Map(classicShots.projects.map((project) => [project.id, project]));
  const recentProjects = classicShots.recentProjectIds
    .map((id) => projectById.get(id))
    .filter((project): project is ClassicShotProject => Boolean(project))
    .slice(0, 4);
  const latestProject = recentProjects[0] ?? classicShots.projects[0] ?? null;

  return {
    projectCount: classicShots.projects.length,
    recentProjects,
    latestProject,
    lastGeneratedAt: classicShots.lastGeneratedAt,
    totalStoryboardCount: classicShots.projects.reduce((count, project) => count + project.storyboard.length, 0),
    todayReference: latestProject
      ? `${latestProject.source.director}《${latestProject.source.film}》`
      : "选择一个有明确出处的经典镜头，再把它拆成可生成视频的连续调度。"
  };
}

function uniqueLimited(items: string[], limit: number): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function sortSummaryEntries(entries: SummaryEntry[]): SummaryEntry[] {
  return [...entries].sort((left, right) => {
    const periodDelta = right.periodStart.localeCompare(left.periodStart);

    if (periodDelta !== 0) {
      return periodDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function getWeekBounds(now: Date): { start: string; end: string } {
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  const start = new Date(date.getTime());
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start.getTime());
  end.setDate(start.getDate() + 6);

  return {
    start: todayLocalDate(start),
    end: todayLocalDate(end)
  };
}

function hasFinalSummary(entry: SummaryEntry): boolean {
  return entry.finalSummary.trim().length > 0;
}

function getSummaryStatus(entries: SummaryEntry[], drafts: SummaryEntry[], type: SummaryEntry["summaryType"], period: {
  start: string;
  end: string;
}): "missing" | "draft" | "final" {
  const matchesPeriod = (entry: SummaryEntry) =>
    entry.summaryType === type && entry.periodStart <= period.end && entry.periodEnd >= period.start;

  if (entries.some((entry) => matchesPeriod(entry) && hasFinalSummary(entry))) {
    return "final";
  }

  if (drafts.some(matchesPeriod)) {
    return "draft";
  }

  return "missing";
}

function buildSummaryDashboard(summary: SummaryState, now = new Date(Date.now())): SummaryDashboard {
  const entries = sortSummaryEntries(summary.entries);
  const latestSummary = entries[0] ?? null;
  const weekBounds = getWeekBounds(now);
  const today = todayLocalDate(now);

  return {
    todaySummaryStatus: getSummaryStatus(entries, summary.drafts, "daily", {
      start: today,
      end: today
    }),
    weekSummaryStatus: getSummaryStatus(entries, summary.drafts, "weekly", weekBounds),
    latestSummary,
    recentKeywords: uniqueLimited(entries.flatMap((entry) => entry.keywords), 8),
    recentMoodTags: uniqueLimited(entries.flatMap((entry) => entry.moodTags), 8),
    totalCount: entries.length,
    dailyCount: entries.filter((entry) => entry.summaryType === "daily").length,
    weeklyCount: entries.filter((entry) => entry.summaryType === "weekly").length,
    monthlyCount: entries.filter((entry) => entry.summaryType === "monthly").length,
    yearlyCount: entries.filter((entry) => entry.summaryType === "yearly").length
  };
}

function getBusinessDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return todayLocalDate(date);
}

function isLedgerDashboardDirection(
  direction: LedgerFactRecord["direction"]
): direction is "expense" | "income" {
  return direction === "expense" || direction === "income";
}

function buildLegacyLedgerSummary(entries: LedgerEntry[], today: string) {
  return entries
    .filter((entry) => getBusinessDateKey(entry.createdAt) === today)
    .reduce(
      (accumulator, entry) => {
        if (entry.direction === "expense") {
          accumulator.todayExpense += entry.amount;
          accumulator.balance -= entry.amount;
        } else {
          accumulator.todayIncome += entry.amount;
          accumulator.balance += entry.amount;
        }

        return accumulator;
      },
      {
        todayExpense: 0,
        todayIncome: 0,
        balance: 0
      }
    );
}

function buildLedgerSummaryFromFacts(facts: LedgerFactRecord[], today: string) {
  return facts.reduce(
    (accumulator, fact) => {
      if (fact.status !== "confirmed" || !isLedgerDashboardDirection(fact.direction)) {
        return accumulator;
      }

      const amount = fact.amountCents / 100;

      if (getBusinessDateKey(fact.occurredAt) === today) {
        if (fact.direction === "expense") {
          accumulator.todayExpense += amount;
        } else {
          accumulator.todayIncome += amount;
        }
      }

      if (fact.direction === "expense") {
        accumulator.balance -= amount;
      } else {
        accumulator.balance += amount;
      }

      return accumulator;
    },
    {
      todayExpense: 0,
      todayIncome: 0,
      balance: 0
    }
  );
}

function buildLedgerDashboardSummary(
  facts: LedgerFactRecord[],
  semantics: LedgerSemanticRecord[],
  now = new Date(Date.now())
): LedgerDashboardSummary {
  if (facts.length === 0) {
    return createEmptyLedgerDashboardSummary();
  }

  const today = getBusinessDateKey(now);
  const sevenDayWindowStart = new Date(now.getTime());
  sevenDayWindowStart.setHours(0, 0, 0, 0);
  sevenDayWindowStart.setDate(sevenDayWindowStart.getDate() - 6);

  const semanticByFactId = new Map(semantics.map((semantic) => [semantic.factId, semantic]));
  const pendingReviewCount = facts.filter((fact) => fact.status === "needs_review").length;
  const dashboardFacts = facts.filter(
    (fact) => fact.status === "confirmed" && isLedgerDashboardDirection(fact.direction)
  );
  let recentDiningExpenseCount = 0;
  const sortedFacts = [...dashboardFacts].sort((left, right) => {
    const occurredDelta = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();

    if (occurredDelta !== 0) {
      return occurredDelta;
    }

    return new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime();
  });

  const summary = sortedFacts.reduce<LedgerDashboardSummary>(
    (summary, fact) => {
      const semantic = semanticByFactId.get(fact.id);
      const occurredAt = new Date(fact.occurredAt);
      const occurredAtTime = occurredAt.getTime();

      if (getBusinessDateKey(fact.occurredAt) === today) {
        if (fact.direction === "income") {
          summary.todayIncomeCents += fact.amountCents;
        } else {
          summary.todayExpenseCents += fact.amountCents;
        }
      }

      if (!Number.isNaN(occurredAtTime) && occurredAtTime >= sevenDayWindowStart.getTime()) {
        summary.rolling7dNetCents += fact.direction === "income" ? fact.amountCents : -fact.amountCents;

        if (
          fact.direction === "expense" &&
          semantic?.primaryCategory === "餐饮" &&
          semantic.confidence >= 0.7
        ) {
          recentDiningExpenseCount += 1;
        }
      }

      if (summary.recentFacts.length < 3) {
        const direction = fact.direction === "income" ? "income" : "expense";

        summary.recentFacts.push({
          id: fact.id,
          direction,
          amountCents: fact.amountCents,
          occurredAt: fact.occurredAt,
          summary:
            semantic?.primaryCategory && semantic.primaryCategory.trim().length > 0
              ? `${semantic.primaryCategory} · ${fact.rawText}`
              : fact.rawText
        });
      }

      return summary;
    },
    {
      ...createEmptyLedgerDashboardSummary(),
      pendingReviewCount
    }
  );

  if (recentDiningExpenseCount >= 2) {
    return {
      ...summary,
      coachTip: "最近餐饮支出较频繁，留意外食节奏。"
    };
  }

  if (summary.pendingReviewCount > 0) {
    return {
      ...summary,
      coachTip: "你有待确认的账目，建议补充金额或场景。"
    };
  }

  return summary;
}

function normalizeLedgerState(state: AppState["ledger"] | undefined): AppState["ledger"] {
  return {
    entries: state?.entries ?? [],
    modules: state?.modules ?? ["工作", "游戏", "生活"],
    ...(state?.summary ? { summary: state.summary } : {}),
    dashboard: state?.dashboard ?? createEmptyLedgerDashboardSummary()
  };
}

function normalizeNewsState(news: Partial<NewsState> | undefined): NewsState {
  return {
    feed: news?.feed ?? {
      count: 0,
      hasNext: false,
      nextCursor: null,
      items: []
    },
    daily: news?.daily ?? null,
    dailyArchive: news?.dailyArchive ?? [],
    lastFetchedAt: news?.lastFetchedAt ?? news?.lastUpdatedAt ?? null,
    lastUpdatedAt: news?.lastUpdatedAt ?? null,
    lastError: news?.lastError ?? null,
    status: news?.status ?? "idle"
  };
}

function normalizeTopicIdea(topic: TopicIdea): TopicIdea {
  return {
    ...topic,
    contentDirection: topic.contentDirection ?? topic.angle
  };
}

function normalizeTopicDimensions(
  dimensions: TopicDimensionDefinition[] | undefined
): TopicDimensionDefinition[] {
  return (dimensions ?? []).map((dimension) => ({
    id: dimension.id,
    label: dimension.label,
    description: dimension.description
  }));
}

function normalizeTopicBuckets(
  buckets: TopicDimensionBucket[] | undefined,
  dimensions: TopicDimensionDefinition[]
): TopicDimensionBucket[] {
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.id, dimension]));

  return (buckets ?? []).map((bucket) => {
    const matchedDimension = dimensionMap.get(bucket.dimensionId);

    return {
      dimensionId: bucket.dimensionId,
      label: matchedDimension?.label ?? bucket.label,
      description: matchedDimension?.description ?? bucket.description,
      items: (bucket.items ?? []).map(normalizeTopicIdea)
    };
  });
}

function normalizeTopicState(topics: Partial<TopicState> | undefined): TopicState {
  const dimensions = normalizeTopicDimensions(topics?.dimensions);

  return {
    dimensions,
    current: (topics?.current ?? []).map(normalizeTopicIdea),
    currentByDimension: normalizeTopicBuckets(topics?.currentByDimension, dimensions),
    history: (topics?.history ?? []).map(normalizeTopicIdea),
    lastGeneratedAt: topics?.lastGeneratedAt ?? null,
    status: topics?.status ?? "idle",
    strategy: "manual-curation",
    lastError: topics?.lastError ?? null
  };
}

function normalizeSummaryEntry(entry: SummaryEntry): SummaryEntry {
  return {
    ...entry,
    structuredFields: entry.structuredFields ?? {},
    moodTags: entry.moodTags ?? [],
    energyLevel: typeof entry.energyLevel === "number" ? entry.energyLevel : null,
    keywords: entry.keywords ?? [],
    version: entry.version ?? 1
  };
}

function normalizeSummaryState(summary: Partial<SummaryState> | undefined): SummaryState {
  return {
    entries: sortSummaryEntries((summary?.entries ?? []).map(normalizeSummaryEntry)),
    drafts: sortSummaryEntries((summary?.drafts ?? []).map(normalizeSummaryEntry)),
    lastUpdatedAt: summary?.lastUpdatedAt ?? null,
    settings: {
      defaultSummaryType: summary?.settings?.defaultSummaryType ?? "daily"
    }
  };
}

function normalizeMetric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeHistoryXhsState(historyXhs: Partial<HistoryXhsState> | undefined): HistoryXhsState {
  const posts = (historyXhs?.posts ?? []).map((post, index) => ({
    id: typeof post.id === "string" && post.id ? post.id : `xhs-post-${index + 1}`,
    title: typeof post.title === "string" && post.title ? post.title : `小红书作品 ${index + 1}`,
    publishedAt: typeof post.publishedAt === "string" ? post.publishedAt : null,
    url: typeof post.url === "string" ? post.url : null,
    views: normalizeMetric(post.views),
    likes: normalizeMetric(post.likes),
    collects: normalizeMetric(post.collects),
    comments: normalizeMetric(post.comments),
    shares: normalizeMetric(post.shares)
  }));
  const totalViews = posts.reduce((sum, post) => sum + post.views, 0);
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const totalCollects = posts.reduce((sum, post) => sum + post.collects, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);
  const totalShares = posts.reduce((sum, post) => sum + post.shares, 0);
  const engagement = totalLikes + totalCollects + totalComments + totalShares;

  return {
    posts,
    overview: {
      postCount: posts.length,
      totalViews,
      totalLikes,
      totalCollects,
      totalComments,
      totalShares,
      engagementRate: totalViews > 0 ? engagement / totalViews : null
    },
    lastSyncedAt: historyXhs?.lastSyncedAt ?? null,
    status: historyXhs?.status === "syncing" || historyXhs?.status === "failed" ? historyXhs.status : "idle",
    lastError: typeof historyXhs?.lastError === "string" ? historyXhs.lastError : null,
    sourceUrl:
      typeof historyXhs?.sourceUrl === "string" && historyXhs.sourceUrl
        ? historyXhs.sourceUrl
        : XHS_ANALYTICS_URL
  };
}

function normalizeHistoryPushState(
  historyPush: Partial<HistoryPushState> | undefined
): HistoryPushState {
  return {
    lastTriggeredDate: historyPush?.lastTriggeredDate ?? null
  };
}

const MODEL_PURPOSES: ModelPurpose[] = [
  "general",
  "summary",
  "ledger",
  "todo",
  "router",
  "embedding",
  "vision"
];

function isModelProviderId(value: unknown): value is ModelProviderId {
  return (
    value === "modelscope" ||
    value === "deepseek" ||
    value === "openai" ||
    value === "doubao" ||
    value === "ollama" ||
    value === "openai-compatible"
  );
}

function isModelPurpose(value: unknown): value is ModelPurpose {
  return MODEL_PURPOSES.includes(value as ModelPurpose);
}

function normalizeModelProfile(profile: Partial<ModelProfile>, fallbackIndex: number): ModelProfile {
  const now = nowIso();
  const provider = isModelProviderId(profile.provider) ? profile.provider : "modelscope";
  const providerDefinition = getModelProvider(provider);
  const capabilities = (profile.capabilities ?? []).filter((capability) =>
    providerDefinition?.supportedCapabilities.includes(capability)
  );

  return {
    id: typeof profile.id === "string" && profile.id ? profile.id : `model-profile-${fallbackIndex}`,
    displayName:
      typeof profile.displayName === "string" && profile.displayName.trim()
        ? profile.displayName.trim()
        : providerDefinition?.name ?? "模型配置",
    provider,
    modelName:
      typeof profile.modelName === "string" && profile.modelName.trim()
        ? profile.modelName.trim()
        : providerDefinition?.defaultModels[0] ?? "",
    baseUrl:
      typeof profile.baseUrl === "string" ? profile.baseUrl : providerDefinition?.defaultBaseUrl ?? "",
    apiKeyRef: typeof profile.apiKeyRef === "string" ? profile.apiKeyRef : null,
    capabilities: capabilities.length > 0 ? capabilities : providerDefinition?.supportedCapabilities.slice(0, 2) ?? ["chat"],
    temperature: typeof profile.temperature === "number" ? profile.temperature : null,
    maxTokens: typeof profile.maxTokens === "number" ? profile.maxTokens : null,
    enabled: Boolean(profile.enabled),
    isDefault: Boolean(profile.isDefault),
    purpose: (profile.purpose ?? []).filter(isModelPurpose),
    createdAt: typeof profile.createdAt === "string" ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : now
  };
}

function normalizeModelSettingsState(
  modelSettings: Partial<ModelSettingsState> | undefined
): ModelSettingsState {
  if (!modelSettings?.profiles || modelSettings.profiles.length === 0) {
    return createInitialModelSettingsState();
  }

  let profiles = modelSettings.profiles.map(normalizeModelProfile);
  const envProfile = process.env.MODELSCOPE_API_KEY
    ? createEnvModelScopeProfile(modelSettings.lastUpdatedAt ?? nowIso())
    : null;

  if (envProfile) {
    const existingIndex = profiles.findIndex(
      (profile) => profile.id === envProfile.id || profile.apiKeyRef === envProfile.apiKeyRef
    );

    if (existingIndex >= 0) {
      profiles[existingIndex] = {
        ...profiles[existingIndex],
        ...envProfile,
        createdAt: profiles[existingIndex].createdAt
      };
    } else {
      profiles = [envProfile, ...profiles.filter((profile) => profile.id !== "modelscope-example")];
    }
  }

  const storedDefaultProfileId =
    typeof modelSettings.defaultProfileId === "string" &&
    profiles.some((profile) => profile.id === modelSettings.defaultProfileId && profile.enabled)
      ? modelSettings.defaultProfileId
      : null;
  const defaultProfileId =
    storedDefaultProfileId ?? envProfile?.id ?? profiles.find((profile) => profile.isDefault && profile.enabled)?.id ?? null;
  const purposeDefaults = Object.fromEntries(
    Object.entries(modelSettings.purposeDefaults ?? {}).filter(
      ([purpose, profileId]) =>
        isModelPurpose(purpose) &&
        typeof profileId === "string" &&
        profiles.some((profile) => profile.id === profileId)
    )
  );

  if (envProfile && defaultProfileId === envProfile.id) {
    for (const purpose of envProfile.purpose) {
      purposeDefaults[purpose] = envProfile.id;
    }
  }

  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      isDefault: profile.id === defaultProfileId
    })),
    defaultProfileId,
    purposeDefaults,
    agentDefaults: Object.fromEntries(
      Object.entries(modelSettings.agentDefaults ?? {}).filter(
        ([agentId, profileId]) =>
          typeof agentId === "string" &&
          agentId.trim().length > 0 &&
          typeof profileId === "string" &&
          profiles.some((profile) => profile.id === profileId)
      )
    ),
    lastUpdatedAt: modelSettings.lastUpdatedAt ?? null
  };
}

function buildModelSettingsDashboard(modelSettings: ModelSettingsState) {
  const defaultProfile =
    modelSettings.profiles.find((profile) => profile.id === modelSettings.defaultProfileId) ?? null;

  return {
    defaultProfile: defaultProfile
      ? {
          id: defaultProfile.id,
          displayName: defaultProfile.displayName,
          provider: defaultProfile.provider,
          modelName: defaultProfile.modelName
        }
      : null,
    enabledCount: modelSettings.profiles.filter((profile) => profile.enabled).length,
    totalCount: modelSettings.profiles.length,
    configuredPurposeCount: Object.keys(modelSettings.purposeDefaults).length,
    purposeCount: MODEL_PURPOSES.length,
    configuredAgentCount: Object.keys(modelSettings.agentDefaults).length,
    missingApiKeyCount: modelSettings.profiles.filter((profile) => {
      const provider = getModelProvider(profile.provider);
      return Boolean(profile.enabled && provider?.requiresApiKey && !profile.apiKeyRef);
    }).length
  };
}

function bootstrapLegacyLedgerFact(entry: LedgerEntry): LedgerFactRecord {
  const note = entry.note.trim();

  return {
    id: entry.id,
    // Legacy entries already exist in state.json, so bootstrap them as confirmed manual facts.
    sourceType: "manual_edit",
    rawText: note,
    normalizedText: note,
    direction: entry.direction,
    amountCents: Math.round(entry.amount * 100),
    currency: "CNY",
    occurredAt: entry.createdAt,
    recordedAt: entry.createdAt,
    status: "confirmed",
    ...(entry.taskId ? { taskId: entry.taskId } : {})
  };
}

function bootstrapLedgerRepositoryFromLegacyState(
  state: AppState,
  ledgerRepository: ReturnType<typeof createLedgerRepository>
): void {
  if (state.ledger.entries.length === 0) {
    return;
  }

  if (ledgerRepository.readFacts().length > 0) {
    return;
  }

  ledgerRepository.writeFacts(state.ledger.entries.map(bootstrapLegacyLedgerFact));
}

function normalizeAppState(state: AppState): AppState {
  const news = normalizeNewsState(state.news);
  const { newsBodies: _newsBodies, ...stateWithoutLegacyNewsBodies } = state as AppState & {
    newsBodies?: unknown;
  };

  return {
    ...stateWithoutLegacyNewsBodies,
    homeLayout: normalizeHomeLayout(state.homeLayout),
    ledger: normalizeLedgerState(state.ledger),
    news,
    topics: normalizeTopicState(state.topics),
    cinematic: normalizeCinematicState(state.cinematic),
    classicShots: normalizeClassicShotState(state.classicShots),
    browserAutomation: normalizeBrowserAutomationState(state.browserAutomation),
    promptTemplates: normalizePromptTemplateState(state.promptTemplates),
    summary: normalizeSummaryState(state.summary),
    historyXhs: normalizeHistoryXhsState(state.historyXhs),
    historyPush: normalizeHistoryPushState(state.historyPush),
    nightlyReview: state.nightlyReview ?? {
      lastTriggeredDate: null
    },
    modelSettings: normalizeModelSettingsState(state.modelSettings)
  };
}

export interface ControlPlaneStore {
  getState(): AppState;
  replaceState(state: AppState): void;
  setHomeLayout(layout: HomeModulePreference[]): void;
  upsertTask(task: TaskRecord): void;
  addMessage(message: ChatMessage): void;
  addNotifications(notifications: NotificationRecord[]): void;
  cancelNotification(notificationId: string): void;
  applyAgentResult(result: AgentExecutionResult): void;
  appendLedgerFact(fact: LedgerFactRecord): LedgerFactRecord;
  appendLedgerSemantic(semantic: LedgerSemanticRecord): LedgerSemanticRecord;
  getLedgerFacts(): LedgerFactRecord[];
  getLedgerSemantics(): LedgerSemanticRecord[];
  getLedgerReports(): LedgerReportRecord[];
  getLedgerStages(): LifeStageRecord[];
  upsertLedgerReport(report: LedgerReportRecord): LedgerReportRecord;
  setCinematicState(cinematic: CinematicState): CinematicState;
  setBrowserAutomationState(browserAutomation: BrowserAutomationState): BrowserAutomationState;
  setPromptTemplateState(promptTemplates: PromptTemplateState): PromptTemplateState;
  setSummaryState(summary: SummaryState): SummaryState;
  setHistoryXhsState(historyXhs: HistoryXhsState): HistoryXhsState;
  createModelProfile(profile: Omit<ModelProfile, "createdAt" | "updatedAt">): ModelProfile;
  updateModelProfile(id: string, patch: Partial<ModelProfile>): ModelProfile;
  deleteModelProfile(id: string): { ok: true };
  setDefaultModelProfile(id: string): ModelSettingsState;
  setPurposeDefault(purpose: ModelPurpose, profileId: string | null): ModelSettingsState;
  setAgentDefaultModelProfile(agentId: string, profileId: string | null): ModelSettingsState;
  setNightlyReviewDate(date: string): void;
  getDashboard(
    manifests: AgentManifest[],
    runtimeViews: DashboardData["agents"]
  ): DashboardData;
}

export function createControlPlaneStore(dataDir: string): ControlPlaneStore {
  const filePath = resolve(dataDir, "state.json");
  mkdirSync(dirname(filePath), { recursive: true });
  const ledgerRepository = createLedgerRepository(dataDir);

  let state = loadState(filePath);
  bootstrapLedgerRepositoryFromLegacyState(state, ledgerRepository);

  function persist() {
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    getState() {
      return structuredClone(state);
    },
    replaceState(nextState) {
      state = normalizeAppState(structuredClone(nextState));
      persist();
    },
    setHomeLayout(layout) {
      state.homeLayout = normalizeHomeLayout(structuredClone(layout));
      persist();
    },
    upsertTask(task) {
      const index = state.tasks.findIndex((item) => item.id === task.id);

      if (index >= 0) {
        state.tasks[index] = task;
      } else {
        state.tasks.unshift(task);
      }

      persist();
    },
    addMessage(message) {
      state.messages = [...state.messages, message].slice(-40);
      persist();
    },
    addNotifications(notifications) {
      const merged = new Map<string, NotificationRecord>();

      for (const notification of [...notifications, ...state.notifications]) {
        if (!merged.has(notification.id)) {
          merged.set(notification.id, notification);
        }
      }

      const sorted = [...merged.values()].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
      const persistent = sorted.filter((notification) => notification.persistent);
      const regular = sorted
        .filter((notification) => !notification.persistent)
        .slice(0, 20);

      state.notifications = [...persistent, ...regular].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
      persist();
    },
    cancelNotification(notificationId) {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== notificationId
      );
      persist();
    },
    applyAgentResult(result) {
      if (result.domainUpdates?.ledger) {
        state.ledger = result.domainUpdates.ledger;
      }

      if (result.domainUpdates?.schedule) {
        state.schedule = result.domainUpdates.schedule;
      }

      if (result.domainUpdates?.news) {
        state.news = result.domainUpdates.news;
      }

      if (result.domainUpdates?.topics) {
        state.topics = result.domainUpdates.topics;
      }

      if (result.domainUpdates?.cinematic) {
        state.cinematic = result.domainUpdates.cinematic;
      }

      if (result.domainUpdates?.classicShots) {
        state.classicShots = result.domainUpdates.classicShots;
      }

      if (result.domainUpdates?.summary) {
        state.summary = result.domainUpdates.summary;
      }

      if (result.domainUpdates?.historyPush) {
        state.historyPush = result.domainUpdates.historyPush;
      }

      state = normalizeAppState(state);

      persist();
    },
    appendLedgerFact(fact) {
      const facts = ledgerRepository.readFacts();
      const nextFacts = facts.filter((item) => item.id !== fact.id);

      nextFacts.unshift(structuredClone(fact));
      ledgerRepository.writeFacts(nextFacts);

      return fact;
    },
    appendLedgerSemantic(semantic) {
      const semantics = ledgerRepository.readSemantics();
      const nextSemantics = semantics.filter((item) => item.factId !== semantic.factId);

      nextSemantics.unshift(structuredClone(semantic));
      ledgerRepository.writeSemantics(nextSemantics);

      return semantic;
    },
    getLedgerFacts() {
      return structuredClone(ledgerRepository.readFacts());
    },
    getLedgerSemantics() {
      return structuredClone(ledgerRepository.readSemantics());
    },
    getLedgerReports() {
      return structuredClone(ledgerRepository.readReports());
    },
    getLedgerStages() {
      return structuredClone(ledgerRepository.readStages());
    },
    upsertLedgerReport(report) {
      const reports = ledgerRepository.readReports();
      const nextReports = reports.filter((item) => item.id !== report.id);

      nextReports.unshift(structuredClone(report));
      ledgerRepository.writeReports(nextReports);

      return report;
    },
    setCinematicState(cinematic) {
      state.cinematic = normalizeCinematicState(cinematic);
      persist();

      return structuredClone(state.cinematic);
    },
    setBrowserAutomationState(browserAutomation) {
      state.browserAutomation = normalizeBrowserAutomationState(browserAutomation);
      persist();

      return structuredClone(state.browserAutomation);
    },
    setPromptTemplateState(promptTemplates) {
      state.promptTemplates = normalizePromptTemplateState(promptTemplates);
      persist();

      return structuredClone(state.promptTemplates);
    },
    setSummaryState(summary) {
      state.summary = normalizeSummaryState(summary);
      persist();

      return structuredClone(state.summary);
    },
    setHistoryXhsState(historyXhs) {
      state.historyXhs = normalizeHistoryXhsState(historyXhs);
      persist();

      return structuredClone(state.historyXhs);
    },
    createModelProfile(profile) {
      const now = nowIso();
      const normalized = normalizeModelProfile(
        {
          ...profile,
          createdAt: now,
          updatedAt: now
        },
        state.modelSettings.profiles.length + 1
      );
      state.modelSettings.profiles = state.modelSettings.profiles.filter(
        (item) => item.id !== normalized.id && item.id !== "modelscope-example"
      );
      state.modelSettings.profiles.unshift(normalized);

      if (normalized.isDefault) {
        state.modelSettings.defaultProfileId = normalized.id;
        state.modelSettings.profiles = state.modelSettings.profiles.map((item) => ({
          ...item,
          isDefault: item.id === normalized.id
        }));
      }

      for (const purpose of normalized.purpose) {
        state.modelSettings.purposeDefaults[purpose] = normalized.id;
      }

      state.modelSettings.lastUpdatedAt = now;
      state.modelSettings = normalizeModelSettingsState(state.modelSettings);
      persist();

      return structuredClone(normalized);
    },
    updateModelProfile(id, patch) {
      const index = state.modelSettings.profiles.findIndex((profile) => profile.id === id);

      if (index < 0) {
        throw new Error("model profile not found");
      }

      const now = nowIso();
      const next = normalizeModelProfile(
        {
          ...state.modelSettings.profiles[index],
          ...patch,
          id,
          updatedAt: now
        },
        index
      );

      state.modelSettings.profiles[index] = next;

      if (next.isDefault) {
        state.modelSettings.defaultProfileId = next.id;
        state.modelSettings.profiles = state.modelSettings.profiles.map((profile) => ({
          ...profile,
          isDefault: profile.id === next.id
        }));
      }

      for (const purpose of next.purpose) {
        state.modelSettings.purposeDefaults[purpose] = next.id;
      }

      state.modelSettings.lastUpdatedAt = now;
      state.modelSettings = normalizeModelSettingsState(state.modelSettings);
      persist();

      return structuredClone(next);
    },
    deleteModelProfile(id) {
      state.modelSettings.profiles = state.modelSettings.profiles.filter((profile) => profile.id !== id);

      if (state.modelSettings.defaultProfileId === id) {
        state.modelSettings.defaultProfileId = null;
      }

      for (const [purpose, profileId] of Object.entries(state.modelSettings.purposeDefaults)) {
        if (profileId === id) {
          delete state.modelSettings.purposeDefaults[purpose as ModelPurpose];
        }
      }

      for (const [agentId, profileId] of Object.entries(state.modelSettings.agentDefaults)) {
        if (profileId === id) {
          delete state.modelSettings.agentDefaults[agentId];
        }
      }

      state.modelSettings.lastUpdatedAt = nowIso();
      state.modelSettings = normalizeModelSettingsState(state.modelSettings);
      persist();

      return { ok: true };
    },
    setDefaultModelProfile(id) {
      const profile = state.modelSettings.profiles.find((item) => item.id === id);

      if (!profile) {
        throw new Error("model profile not found");
      }

      state.modelSettings.defaultProfileId = id;
      state.modelSettings.profiles = state.modelSettings.profiles.map((item) => ({
        ...item,
        isDefault: item.id === id
      }));
      state.modelSettings.lastUpdatedAt = nowIso();
      persist();

      return structuredClone(state.modelSettings);
    },
    setPurposeDefault(purpose, profileId) {
      if (profileId === null) {
        delete state.modelSettings.purposeDefaults[purpose];
      } else if (state.modelSettings.profiles.some((profile) => profile.id === profileId)) {
        state.modelSettings.purposeDefaults[purpose] = profileId;
      } else {
        throw new Error("model profile not found");
      }

      state.modelSettings.lastUpdatedAt = nowIso();
      persist();

      return structuredClone(state.modelSettings);
    },
    setAgentDefaultModelProfile(agentId, profileId) {
      const normalizedAgentId = agentId.trim();

      if (!normalizedAgentId) {
        throw new Error("agentId is required");
      }

      if (profileId === null) {
        delete state.modelSettings.agentDefaults[normalizedAgentId];
      } else if (state.modelSettings.profiles.some((profile) => profile.id === profileId)) {
        state.modelSettings.agentDefaults[normalizedAgentId] = profileId;
      } else {
        throw new Error("model profile not found");
      }

      state.modelSettings.lastUpdatedAt = nowIso();
      persist();

      return structuredClone(state.modelSettings);
    },
    setNightlyReviewDate(date) {
      state.nightlyReview.lastTriggeredDate = date;
      persist();
    },
    getDashboard(manifests, runtimeViews) {
      const groups = groupTasksByStatus(state.tasks);
      const now = new Date(Date.now());
      const today = todayLocalDate(now);
      const facts = ledgerRepository.readFacts();
      const semantics = ledgerRepository.readSemantics();
      const summary = buildLedgerSummaryFromFacts(facts, today);
      const dashboard = buildLedgerDashboardSummary(facts, semantics, now);

      return {
        tasks: groups,
        recentTasks: state.tasks.slice(0, 8),
        messages: state.messages.slice(-20),
        notifications: (() => {
          const sorted = [...state.notifications].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          );
          const persistent = sorted.filter((notification) => notification.persistent);
          const regular = sorted
            .filter((notification) => !notification.persistent)
            .slice(0, 12);

          return [...persistent, ...regular].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          );
        })(),
        homeLayout: state.homeLayout,
        ledger: {
          ...state.ledger,
          summary,
          dashboard
        },
        schedule: {
          ...state.schedule,
          todayItems: state.schedule.items.filter((item) => item.date === today)
        },
        news: state.news,
        topics: state.topics,
        cinematic: {
          ...state.cinematic,
          dashboard: buildCinematicDashboard(state.cinematic)
        },
        classicShots: {
          ...state.classicShots,
          dashboard: buildClassicShotDashboard(state.classicShots)
        },
        browserAutomation: state.browserAutomation,
        promptTemplates: state.promptTemplates,
        summary: {
          ...state.summary,
          dashboard: buildSummaryDashboard(state.summary, now)
        },
        historyXhs: state.historyXhs,
        modelSettingsDashboard: buildModelSettingsDashboard(state.modelSettings),
        agents: manifests.map((manifest) => {
          const runtimeView = runtimeViews.find((item) => item.id === manifest.id);

          return (
            runtimeView ?? {
              id: manifest.id,
              name: manifest.name,
              status: "idle",
              activeTaskId: null,
              lastStartedAt: null,
              capabilities: manifest.capabilities
            }
          );
        })
      };
    }
  };
}

function loadState(filePath: string): AppState {
  let raw: string;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (!isEnoentError(error)) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load control-plane state at ${filePath}: ${reason}`);
    }

    const state = createInitialState();
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    return state;
  }

  try {
    return normalizeAppState(JSON.parse(raw) as AppState);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse control-plane state at ${filePath}: ${reason}`);
  }
}
