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
    continuity: {
      actionLine: "人物从便利店门口走向街角，动作始终克制缓慢。",
      spatialLine: "所有镜头发生在同一条雨后街道，便利店、积水和街角霓虹保持方位连续。",
      emotionalLine: "情绪从被城市压住的孤独，过渡到短暂停步后的清醒。",
      visualLine: "冷蓝霓虹、湿润路面反光和低饱和胶片颗粒贯穿全片。",
      audioLine: "低频城市环境音延续，脚步踏水声作为镜头之间的连接。"
    },
    targetShotCount: 4,
    tags: ["城市", "夜晚", "孤独", "霓虹"],
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    storyboard: Array.from({ length: 4 }, (_, index) => ({
      id: `shot-${index + 1}`,
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
  (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__ = {
    generateText: vi.fn(async () => ({ text }))
  };
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
      })
    });
    expect(project?.storyboard).toHaveLength(4);
    expect(project?.storyboard[0]?.handoff).toContain("积水倒影");
    expect(project?.storyboard[0]?.prompt.zh.length).toBeGreaterThan(300);
    expect(project?.storyboard[0]?.prompt.en).toContain("cinematic");
    expect(result.domainUpdates?.cinematic?.recentProjectIds).toEqual(["cinematic-fixture"]);
  });

  it("parses model JSON and records the project in cinematic state", async () => {
    mockModelRuntimeText(JSON.stringify(createFixture({ id: "cinematic-model" })));

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("completed");
    expect(result.domainUpdates?.cinematic?.projects[0]?.id).toBe("cinematic-model");
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
