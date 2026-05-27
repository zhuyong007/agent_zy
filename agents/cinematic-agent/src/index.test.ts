import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, CinematicProject } from "@agent-zy/shared-types";

import { agent } from "./index";

function longZhPrompt(label: string) {
  return `${label}，凌晨雨后的城市街口被钠灯和冷蓝霓虹切成两层色温，镜头使用 50mm 焦段从潮湿玻璃后的前景缓慢推进，前景有失焦雨滴和反射的车灯，中景里人物只露出半张侧脸，背景高楼窗口像沉默的网格。画面保持浅景深，空气里有细小水汽和轻微胶片颗粒，摄影机移动很慢，像一次克制的呼吸。路面积水倒映红色信号灯，远处公交驶过带出柔软拖影，声音只有低频环境噪声和鞋底踩水声。构图把人物压在画面边缘，留出大面积空街，情绪从压抑过渡到清醒，孤独不是动作，而是城市空间对人的吞没。镜头最后不切到表情，而是停在人物身后的影子和路灯之间，让观众在空白里感到时间被拉长。便利店白光从玻璃门缝里漏出来，和街对面的霓虹形成冷暖分割，人物的呼吸在空气中短暂起雾，又立刻消失，像一句没有说出口的话。`;
}

function longEnPrompt(label: string) {
  return `${label}, a cinematic rainy midnight city intersection after the storm, sodium streetlights mixed with cold blue neon, shot on a 50mm lens with shallow depth of field. The camera slowly pushes forward from behind wet glass, foreground raindrops and reflected headlights drifting out of focus, a solitary figure in the middle ground with only half of the face visible, high-rise windows forming a silent grid in the background. Fine mist hangs in the air, subtle film grain, restrained handheld breathing, puddles reflecting a red traffic light, a distant bus creating soft motion streaks. The composition places the subject near the edge of the frame with a large empty street as negative space, turning loneliness into spatial pressure rather than simple action.`;
}

function createFixture(overrides: Partial<CinematicProject> = {}) {
  return {
    id: "cinematic-fixture",
    title: "凌晨两点的城市",
    concept: "孤独感的城市夜晚",
    mood: "孤独、压抑、清醒",
    script: "城市从不睡觉，只是把孤独留给凌晨两点的人。",
    style: "冷蓝霓虹与低饱和胶片感",
    pace: "缓慢建立，轻微递进，结尾留白",
    scenePlan: {
      sceneCount: 1,
      maxDurationSeconds: 15,
      scenes: [
        {
          id: "scene-1",
          name: "rainy-street",
          anchor: "same rainy street outside the convenience store",
          role: "main continuous scene"
        }
      ]
    },
    continuity: {
      actionLine: "人物从便利店门口走向街角，动作始终克制缓慢。",
      spatialLine: "所有镜头发生在同一条雨后街道，便利店、积水和街角霓虹保持方位连续。",
      emotionalLine: "情绪从被城市压住的孤独，过渡到短暂停步后的清醒。",
      visualLine: "冷蓝霓虹、湿润路面反光和低饱和胶片颗粒贯穿全片。",
      audioLine: "低频城市环境音延续，脚步踏水声作为镜头之间的连接。"
    },
    referenceAssets: {
      characters: [
        {
          id: "character-1",
          name: "凌晨街口的白衣人",
          description: "二十多岁，白衬衫、深色长裤、湿发贴近额头，神情克制。",
          views: {
            front: {
              zh: "人物正面三视图参考，白衬衫、深色长裤、湿发、自然皮肤、冷蓝霓虹边缘光，纯色背景。",
              en: "Front character reference sheet, white shirt, dark trousers, wet hair, natural skin, cold blue neon rim light, plain background."
            },
            side: {
              zh: "人物侧面三视图参考，保持同一脸型、发型、服装比例和冷蓝边缘光，纯色背景。",
              en: "Side character reference sheet preserving the same face shape, hairstyle, costume proportions, and cold blue rim light, plain background."
            },
            back: {
              zh: "人物背面三视图参考，白衬衫背部湿痕、深色长裤、湿发后轮廓、冷蓝边缘光，纯色背景。",
              en: "Back character reference sheet with damp white shirt back, dark trousers, wet hair silhouette, cold blue rim light, plain background."
            }
          }
        }
      ],
      props: [
        {
          id: "prop-1",
          name: "红色雨伞",
          description: "半旧红色长柄雨伞，伞面有细小雨滴和轻微磨损。",
          views: {
            front: {
              zh: "红色长柄雨伞正面三视图参考，半旧伞面、雨滴、轻微磨损，纯色背景。",
              en: "Front prop reference sheet for an old red long-handle umbrella, raindrops, subtle wear, plain background."
            },
            side: {
              zh: "红色长柄雨伞侧面三视图参考，保持同一伞柄弧度、伞面磨损和材质，纯色背景。",
              en: "Side prop reference sheet preserving the same handle curve, canopy wear, and material, plain background."
            },
            back: {
              zh: "红色长柄雨伞背面三视图参考，伞骨结构、雨滴和磨损位置保持一致，纯色背景。",
              en: "Back prop reference sheet preserving ribs, raindrops, and wear placement, plain background."
            }
          }
        }
      ],
      scenes: [
        {
          id: "scene-ref-1",
          name: "雨后便利店街口",
          description: "便利店在画面右侧，冷蓝霓虹从街角打入，前景有积水倒影。",
          prompt: {
            zh: "场景参考图，雨后便利店街口，便利店白光在右侧，冷蓝霓虹从左后方打入，前景积水倒影，低饱和胶片质感。",
            en: "Scene reference image, rainy convenience-store street corner, white store light on the right, cold blue neon from back left, puddle reflections in the foreground, low-saturation film texture."
          }
        }
      ]
    },
    targetShotCount: 4,
    tags: ["城市", "夜晚", "孤独", "霓虹"],
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    storyboard: Array.from({ length: 4 }, (_, index) => ({
      id: `shot-${index + 1}`,
      sceneId: "scene-1",
      sceneAnchor: "same rainy street outside the convenience store",
      title: `镜头 ${index + 1}`,
      purpose: "建立孤独的城市空间",
      duration: "4-6 秒",
      cameraMovement: "缓慢推进",
      shotType: "环境人物镜头",
      composition: "人物偏置，保留大面积负空间",
      transition: "声音先行的溶接",
      audioHint: "低频城市环境音、远处车流",
      emotionalBeat: "从压抑进入清醒",
      handoff: "镜头结尾停在积水倒影，下一镜从同一片倒影抬起进入人物背影。",
      characterRefs: ["character-1"],
      propRefs: ["prop-1"],
      sceneRef: "scene-ref-1",
      prompt: {
        zh: longZhPrompt(`镜头 ${index + 1}`),
        en: longEnPrompt(`Shot ${index + 1}`)
      }
    })),
    ...overrides
  };
}

function createState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: {
      entries: [],
      modules: []
    },
    schedule: {
      items: [],
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
    cinematic: {
      projects: [],
      recentProjectIds: [],
      lastGeneratedAt: null,
      status: "idle",
      lastError: null
    },
    classicShots: {
      projects: [],
      recentProjectIds: [],
      lastGeneratedAt: null,
      status: "idle",
      lastError: null
    },
    summary: {
      entries: [],
      drafts: [],
      lastUpdatedAt: null,
      settings: {
        defaultSummaryType: "daily"
      }
    },
    historyPush: {
      lastTriggeredDate: null
    },
    nightlyReview: {
      lastTriggeredDate: null
    },
    modelSettings: {
      profiles: [],
      defaultProfileId: null,
      purposeDefaults: {},
      agentDefaults: {},
      lastUpdatedAt: null
    }
  };
}

function createRequest(state = createState()): AgentExecutionRequest {
  return {
    taskId: "task-cinematic",
    trigger: "system",
    requestedAt: "2026-05-22T08:00:00.000Z",
    meta: {
      action: "generate",
      concept: "孤独感的城市夜晚",
      style: "赛博朋克极简",
      pace: "缓慢",
      targetShotCount: 4
    },
    state
  };
}

function mockModelRuntimeText(text: string) {
  const generateText = vi.fn(async (_input: Record<string, unknown>) => ({ text }));

  (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__ = {
    generateText
  };

  return generateText;
}

describe("cinematic agent", () => {
  afterEach(() => {
    delete process.env.CINEMATIC_PROJECT_FIXTURE_JSON;
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;
  });

  it("generates a cinematic project from fixture JSON", async () => {
    process.env.CINEMATIC_PROJECT_FIXTURE_JSON = JSON.stringify(createFixture());

    const result = await agent.execute(createRequest());
    const project = result.domainUpdates?.cinematic?.projects[0];

    expect(result.status).toBe("completed");
    expect(project).toMatchObject({
      title: "凌晨两点的城市",
      concept: "孤独感的城市夜晚",
      mood: "孤独、压抑、清醒",
      targetShotCount: 4,
      continuity: expect.objectContaining({
        actionLine: expect.stringContaining("便利店门口"),
        spatialLine: expect.stringContaining("同一条雨后街道")
      }),
      scenePlan: expect.objectContaining({
        sceneCount: 1,
        maxDurationSeconds: 15
      })
    });
    expect(project?.storyboard).toHaveLength(4);
    expect(new Set(project?.storyboard.map((shot) => shot.sceneId)).size).toBeLessThanOrEqual(3);
    expect(project?.storyboard[0]?.handoff).toContain("积水倒影");
    expect(project?.referenceAssets?.characters[0]?.views.front.zh).toContain("人物正面三视图");
    expect(project?.referenceAssets?.props[0]?.views.side.zh).toContain("红色长柄雨伞侧面");
    expect(project?.referenceAssets?.scenes[0]?.prompt.zh).toContain("场景参考图");
    expect(project?.storyboard[0]?.characterRefs).toEqual(["character-1"]);
    expect(project?.storyboard[0]?.propRefs).toEqual(["prop-1"]);
    expect(project?.storyboard[0]?.sceneRef).toBe("scene-ref-1");
    expect(project?.storyboard[0]?.prompt.zh.length).toBeGreaterThan(200);
    expect(project?.storyboard[0]?.prompt.zh).not.toContain("摄影机移动");
    expect(project?.storyboard[0]?.prompt.zh).not.toContain("声音");
    expect(project?.storyboard[0]?.prompt.en).toContain("cinematic");
    expect(result.domainUpdates?.cinematic?.recentProjectIds).toEqual(["cinematic-fixture"]);
  });

  it("parses model JSON and records the project in cinematic state", async () => {
    const generateText = mockModelRuntimeText(JSON.stringify(createFixture({ id: "cinematic-model" })));

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.domainUpdates?.cinematic?.projects[0]?.id).toBe("cinematic-model");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: "json",
        timeoutMs: 600_000
      })
    );
    const callInput = generateText.mock.calls[0]?.[0];
    expect(callInput.prompt).toContain("1-3");
    expect(callInput.prompt).toContain("15");
    expect(callInput.prompt).toContain("scenePlan");
    expect(callInput.prompt).toContain("referenceAssets");
    expect(callInput.prompt).toContain("三视图");
    expect(callInput.prompt).toContain("分镜图必须基于已生成的人物、物品、场景参考图");
  });

  it("fills continuity and handoff when an older model returns the previous schema", async () => {
    const legacyProject = createFixture({ id: "cinematic-legacy" }) as any;
    delete legacyProject.continuity;
    delete legacyProject.scenePlan;
    legacyProject.storyboard = legacyProject.storyboard.map(({ handoff: _handoff, ...shot }: any) => shot);
    legacyProject.storyboard = legacyProject.storyboard.map(({ sceneId: _sceneId, sceneAnchor: _sceneAnchor, ...shot }: any) => shot);
    mockModelRuntimeText(JSON.stringify(legacyProject));

    const result = await agent.execute(createRequest());
    const project = result.domainUpdates?.cinematic?.projects[0];

    expect(result.status).toBe("completed");
    expect(project?.id).toBe("cinematic-legacy");
    expect(project?.continuity?.actionLine).toBeTruthy();
    expect(project?.scenePlan?.sceneCount).toBe(1);
    expect(project?.scenePlan?.maxDurationSeconds).toBe(15);
    expect(project?.storyboard[0]?.handoff).toBeTruthy();
    expect(project?.storyboard[0]?.sceneId).toBe("scene-1");
  });

  it("accepts model JSON that changes top-level field casing", async () => {
    const casingProject = createFixture({ id: "cinematic-casing" }) as any;
    casingProject.TITLE = casingProject.title;
    casingProject.CONCEPT = casingProject.concept;
    casingProject.MOOD = casingProject.mood;
    casingProject.SCRIPT = casingProject.script;
    casingProject.STYLE = casingProject.style;
    casingProject.PACE = casingProject.pace;
    casingProject.TARGETSHOTCOUNT = casingProject.targetShotCount;
    delete casingProject.title;
    delete casingProject.concept;
    delete casingProject.mood;
    delete casingProject.script;
    delete casingProject.style;
    delete casingProject.pace;
    delete casingProject.targetShotCount;
    mockModelRuntimeText(JSON.stringify(casingProject));

    const result = await agent.execute(createRequest());
    const project = result.domainUpdates?.cinematic?.projects[0];

    expect(result.status).toBe("completed");
    expect(project).toMatchObject({
      id: "cinematic-casing",
      title: "凌晨两点的城市",
      concept: "孤独感的城市夜晚",
      mood: "孤独、压抑、清醒",
      targetShotCount: 4
    });
  });

  it("accepts model JSON wrapped in a project object", async () => {
    mockModelRuntimeText(JSON.stringify({ project: createFixture({ id: "cinematic-wrapped" }) }));

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.domainUpdates?.cinematic?.projects[0]?.id).toBe("cinematic-wrapped");
  });

  it("normalizes storyboard frame prompts into static image descriptions", async () => {
    const dynamicProject = createFixture({ id: "cinematic-static-frame" }) as any;
    dynamicProject.storyboard[0].prompt.zh =
      "中心瞳孔急剧收缩成针尖大小，镜头缓慢推进，低频嗡声增强，人物正在转头看向窗外。雨夜街口、冷蓝霓虹、湿润柏油路、便利店白光、浅景深、胶片颗粒。";
    dynamicProject.storyboard[0].prompt.en =
      "The central pupil rapidly shrinks into a pin point, the camera slowly pushes in, low hum rises, the subject is turning toward the window. Rainy neon street, wet asphalt, shallow depth of field.";
    mockModelRuntimeText(JSON.stringify(dynamicProject));

    const result = await agent.execute(createRequest());
    const shot = result.domainUpdates?.cinematic?.projects[0]?.storyboard[0];

    expect(result.status).toBe("completed");
    expect(shot?.prompt.zh).toContain("针尖大小");
    expect(shot?.prompt.zh).not.toContain("急剧收缩成");
    expect(shot?.prompt.zh).not.toContain("镜头缓慢推进");
    expect(shot?.prompt.zh).not.toContain("低频嗡声");
    expect(shot?.prompt.zh).not.toContain("正在转头");
    expect(shot?.prompt.en).not.toContain("camera slowly pushes");
    expect(shot?.prompt.en).not.toContain("low hum");
  });

  it("rejects model output with missing storyboard fields", async () => {
    mockModelRuntimeText(JSON.stringify({ title: "坏输出", concept: "x", mood: "x", script: "x", storyboard: [] }));

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.domainUpdates?.cinematic).toBeUndefined();
    expect(result.summary).toContain("至少需要 4");
  });

  it("does not update domain state when model runtime is unavailable", async () => {
    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.domainUpdates?.cinematic).toBeUndefined();
  });
});
