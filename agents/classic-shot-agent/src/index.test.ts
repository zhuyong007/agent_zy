import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentExecutionRequest } from "@agent-zy/agent-sdk";
import type { AppState, ClassicShotProject } from "@agent-zy/shared-types";

import { agent } from "./index";

const longPrompt = [
  "昏暗狭窄的公寓走廊里，墙面是潮湿的绿色旧漆和磨损木门，主体是一男一女在狭窄空间里缓慢擦肩而过，时间像被压低的夜晚，空气中有饭菜蒸汽和旧灯泡的暖黄色微尘。",
  "摄影机保持连续镜头感，从走廊尽头以 50mm 焦段缓慢横移跟随，前景有虚焦的门框和纱帘边缘，中景是人物肩膀、手臂与垂下的视线，背景保留楼梯口微弱阴影和墙面反光。",
  "光线来自顶部钨丝灯和房门缝隙的暖光，形成柔软但压抑的高反差阴影，色彩低饱和，暗红、墨绿和旧黄色互相渗透，画面带细微 film grain。",
  "动作必须连贯：人物先从相反方向进入画面，步速很慢，肩膀靠近但不碰触，视线短暂停留后错开，摄影机不切镜，只用稳定横移和轻微推进完成情绪递进。",
  "背景中远处邻居开门的光线一闪即灭，空气感保持湿热、安静、克制，镜头节奏像一次被压住的呼吸，结尾停在两人背影错开的空隙上。"
].join("");

function createProject(overrides: Partial<ClassicShotProject> = {}): ClassicShotProject {
  return {
    id: "classic-shot-fixture",
    rawInput: "王家卫 花样年华 走廊擦肩镜头",
    title: "走廊擦肩的压抑长镜头",
    source: {
      director: "王家卫",
      film: "花样年华",
      year: 2000,
      shotName: "走廊擦肩镜头",
      shotPosition: "影片前中段，周慕云与苏丽珍在公寓走廊多次相遇的段落",
      context: "狭窄邻里空间中，两人的克制关系通过擦肩和停顿建立。"
    },
    coreValue: "经典在于用狭窄走廊、慢速横移和钨丝暖光，把人物关系压缩成一次克制擦肩，情绪靠调度推进而非台词说明。",
    analysis: {
      cameraMovement: "缓慢横移跟拍，轻微推进，保持长镜头连续感。",
      lighting: "钨丝灯暖黄、门缝漏光、低饱和暗红与墨绿、高反差阴影。",
      emotionCurve: "平静、压抑、靠近、错开、余韵。"
    },
    minimumStoryboardCount: 1,
    storyboard: [
      {
        id: "shot-1",
        title: "走廊擦肩",
        function: "用一个连续横移镜头完成空间建立、人物靠近、情绪停顿和错开。",
        prompt: longPrompt,
        movementKeywords: ["slow tracking shot", "long take", "cinematic lateral dolly"],
        visualKeywords: ["film grain", "cinematic lighting", "shallow depth of field", "warm tungsten light"]
      }
    ],
    continuity: {
      actionContinuity: "人物从走廊两端进入，擦肩后继续向相反方向离开，动作不中断。",
      cameraContinuity: "摄影机始终沿走廊横移并轻微推进，不改变轴线。",
      lightingContinuity: "顶部暖光和门缝光保持同一方向，阴影随人物移动自然变化。",
      colorContinuity: "暗红、墨绿、旧黄色和胶片颗粒贯穿整条提示词。",
      antiJumpGuidance: "不要切换场景、服装、人物脸型或镜头方向，用同一走廊和同一横移动作维持连续镜头感。"
    },
    markdown: "",
    targetPlatform: "generic",
    createdAt: "2026-05-25T08:00:00.000Z",
    updatedAt: "2026-05-25T08:00:00.000Z",
    ...overrides
  };
}

function createState(): AppState {
  return {
    tasks: [],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: { entries: [], modules: [] },
    schedule: { items: [], pendingReview: null },
    news: {
      feed: { count: 0, hasNext: false, nextCursor: null, items: [] },
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
    cinematic: { projects: [], recentProjectIds: [], lastGeneratedAt: null, status: "idle", lastError: null },
    classicShots: { projects: [], recentProjectIds: [], lastGeneratedAt: null, status: "idle", lastError: null },
    summary: {
      entries: [],
      drafts: [],
      lastUpdatedAt: null,
      settings: { defaultSummaryType: "daily" }
    },
    historyPush: { lastTriggeredDate: null },
    nightlyReview: { lastTriggeredDate: null },
    modelSettings: {
      profiles: [],
      defaultProfileId: null,
      purposeDefaults: {},
      agentDefaults: {},
      lastUpdatedAt: null
    }
  };
}

function createRequest(input = "王家卫 花样年华 走廊擦肩镜头"): AgentExecutionRequest {
  return {
    taskId: "task-classic-shot",
    trigger: "user",
    requestedAt: "2026-05-25T08:00:00.000Z",
    message: input,
    meta: { input, targetPlatform: "generic" },
    state: createState()
  };
}

function mockModelRuntimeText(text: string) {
  (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__ = {
    generateText: vi.fn(async () => ({ text }))
  };
}

describe("classic-shot agent", () => {
  afterEach(() => {
    delete process.env.CLASSIC_SHOT_PROJECT_FIXTURE_JSON;
    delete (globalThis as typeof globalThis & { __AGENT_ZY_MODEL_CLIENT__?: any }).__AGENT_ZY_MODEL_CLIENT__;
  });

  it("generates a sourced classic shot recreation project", async () => {
    process.env.CLASSIC_SHOT_PROJECT_FIXTURE_JSON = JSON.stringify(createProject());

    const result = await agent.execute(createRequest());
    const project = result.domainUpdates?.classicShots?.projects[0];

    expect(result.status).toBe("completed");
    expect(project?.source).toMatchObject({
      director: "王家卫",
      film: "花样年华",
      year: 2000
    });
    expect(project?.minimumStoryboardCount).toBe(1);
    expect(project?.storyboard[0]?.prompt.length).toBeGreaterThanOrEqual(300);
    expect(project?.storyboard[0]?.prompt).toContain("连续镜头感");
    expect(project?.markdown).toContain("一、镜头出处");
    expect(project?.markdown).toContain("五、镜头衔接设计");
  });

  it("accepts a random classic shot fixture that is suitable for AI recreation", async () => {
    process.env.CLASSIC_SHOT_PROJECT_FIXTURE_JSON = JSON.stringify(
      createProject({
        id: "classic-shot-random",
        rawInput: "随机生成一个经典镜头",
        source: {
          director: "阿方索·卡隆",
          film: "人类之子",
          year: 2006,
          shotName: "车内遇袭长镜头",
          shotPosition: "影片中段车内逃亡段落",
          context: "保留车内连续调度灵魂，降低群演和爆破复杂度。"
        }
      })
    );

    const result = await agent.execute(createRequest("随机生成一个经典镜头"));

    expect(result.status).toBe("completed");
    expect(result.domainUpdates?.classicShots?.projects[0]?.source.film).toBe("人类之子");
    expect(result.domainUpdates?.classicShots?.projects[0]?.continuity.cameraContinuity).toContain("不改变轴线");
  });

  it("rejects output without explicit source", async () => {
    mockModelRuntimeText(JSON.stringify(createProject({ source: { director: "", film: "", year: 0, shotName: "", shotPosition: "" } })));

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.domainUpdates?.classicShots).toBeUndefined();
    expect(result.summary).toContain("明确出处");
  });

  it("rejects storyboard prompts shorter than 300 characters", async () => {
    const invalid = createProject({
      storyboard: [
        {
          ...createProject().storyboard[0],
          prompt: "太短的提示词"
        }
      ]
    });
    mockModelRuntimeText(JSON.stringify(invalid));

    const result = await agent.execute(createRequest());

    expect(result.status).toBe("failed");
    expect(result.summary).toContain("300");
  });
});
