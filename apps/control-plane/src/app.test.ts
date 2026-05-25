import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";
import { DEFAULT_NEWS_INTERVAL_MS } from "./services/scheduler";

function longHistoryImagePrompt(topic: string) {
  return `${topic}，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，背景包含地图、书卷、建筑纹样与柔和光线，暖金与青灰配色，画面上方预留中文标题区域，下方保留解释文字空间，质感像博物馆展陈海报，细节丰富但不拥挤。`;
}

function longCinematicPrompt(label: string) {
  return `${label}，夜色压低城市天际线，潮湿街面反射冷蓝霓虹和红色刹车灯，镜头以 50mm 焦段从玻璃雨痕后的前景缓慢推进。前景雨滴失焦，中景人物停在便利店门口，背景高楼窗口像沉默的网格，浅景深让城市边缘轻微化开。空气里有水汽、低频车流和细小胶片颗粒，摄影机移动像克制呼吸，人物没有夸张动作，只用肩膀下沉和迟疑停步表达疲惫。构图把人物压在画面右下角，左侧保留大片空街，孤独被空间放大。`;
}

function longClassicShotPrompt() {
  return [
    "昏暗狭窄的公寓走廊里，墙面是潮湿的绿色旧漆和磨损木门，主体是一男一女在狭窄空间里缓慢擦肩而过，时间像被压低的夜晚，空气中有饭菜蒸汽和旧灯泡的暖黄色微尘。",
    "摄影机保持连续镜头感，从走廊尽头以 50mm 焦段缓慢横移跟随，前景有虚焦的门框和纱帘边缘，中景是人物肩膀、手臂与垂下的视线，背景保留楼梯口微弱阴影和墙面反光。",
    "光线来自顶部钨丝灯和房门缝隙的暖光，形成柔软但压抑的高反差阴影，色彩低饱和，暗红、墨绿和旧黄色互相渗透，画面带细微 film grain。",
    "动作必须连贯：人物先从相反方向进入画面，步速很慢，肩膀靠近但不碰触，视线短暂停留后错开，摄影机不切镜，只用稳定横移和轻微推进完成情绪递进。",
    "背景中远处邻居开门的光线一闪即灭，空气感保持湿热、安静、克制，镜头节奏像一次被压住的呼吸，结尾停在两人背影错开的空隙上。"
  ].join("");
}

function createCinematicFixture() {
  return {
    id: "cinematic-app-fixture",
    title: "凌晨两点的城市",
    concept: "孤独感的城市夜晚",
    mood: "孤独、压抑、清醒",
    script: "城市从不睡觉，只是把孤独留给凌晨两点的人。",
    style: "冷蓝霓虹、低饱和胶片感",
    pace: "缓慢推进，结尾留白",
    targetShotCount: 4,
    tags: ["城市", "夜晚", "孤独"],
    continuity: {
      actionLine: "The figure keeps moving through the same rainy city block until reaching the final doorway.",
      spatialLine: "Every shot preserves the wet street, storefront light, and right-edge character position as a connected route.",
      emotionalLine: "The feeling shifts from isolation to a quiet decision without breaking the restrained mood.",
      visualLine: "Cold neon reflections, wet glass, shallow focus, and film grain stay consistent across the sequence.",
      audioLine: "Low city ambience and rain continue under each shot, with only subtle volume changes."
    },
    storyboard: Array.from({ length: 4 }, (_, index) => ({
      id: `shot-${index + 1}`,
      title: `镜头 ${index + 1}`,
      purpose: "建立城市孤独感",
      duration: "5 秒",
      cameraMovement: "缓慢推进",
      shotType: "环境人物镜头",
      composition: "人物偏右，大面积负空间",
      transition: "溶接",
      audioHint: "低频环境音",
      emotionalBeat: "压抑到清醒",
      handoff: `Shot ${index + 1} ends on a matching rain reflection that leads directly into shot ${index + 2}.`,
      prompt: {
        zh: longCinematicPrompt(`镜头 ${index + 1}`),
        en: `Shot ${index + 1}, cinematic rainy neon city night, slow push in through wet glass, shallow depth of field, solitary figure near the edge of frame, negative space, subtle film grain, low frequency city ambience, restrained emotional rhythm.`
      }
    }))
  };
}

function createClassicShotFixture() {
  return {
    id: "classic-shot-app-fixture",
    rawInput: "王家卫 花样年华 走廊擦肩镜头",
    title: "走廊擦肩的压抑长镜头",
    source: {
      director: "王家卫",
      film: "花样年华",
      year: 2000,
      shotName: "走廊擦肩镜头",
      shotPosition: "影片前中段，周慕云与苏丽珍在公寓走廊多次相遇的段落"
    },
    coreValue: "经典在于用狭窄走廊、慢速横移和钨丝暖光，把克制关系压缩成一次擦肩。",
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
        prompt: longClassicShotPrompt(),
        movementKeywords: ["slow tracking shot", "long take"],
        visualKeywords: ["film grain", "cinematic lighting"]
      }
    ],
    continuity: {
      actionContinuity: "人物从走廊两端进入，擦肩后继续向相反方向离开，动作不中断。",
      cameraContinuity: "摄影机始终沿走廊横移并轻微推进，不改变轴线。",
      lightingContinuity: "顶部暖光和门缝光保持同一方向。",
      colorContinuity: "暗红、墨绿、旧黄色和胶片颗粒贯穿整条提示词。",
      antiJumpGuidance: "不要切换场景、服装、人物脸型或镜头方向。"
    }
  };
}

describe("control-plane app", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-test-"));
  const app = createControlPlaneApp({
    dataDir,
    startSchedulers: false
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterEach(() => {
    delete process.env.AIHOT_BASE_URL;
    delete process.env.AIHOT_ITEMS_FIXTURE_JSON;
    delete process.env.AIHOT_DAILY_FIXTURE_JSON;
    delete process.env.AIHOT_DAILIES_FIXTURE_JSON;
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_MODEL;
    delete process.env.HISTORY_POST_FIXTURE_JSON;
    delete process.env.CINEMATIC_PROJECT_FIXTURE_JSON;
    delete process.env.CLASSIC_SHOT_PROJECT_FIXTURE_JSON;
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, {
      recursive: true,
      force: true
    });
  });

  it("routes a chat request through the manifest-driven runtime and returns a task result", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "今天工作午餐花了 128 元，记到账本"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      route: {
        agentId: "ledger-agent"
      },
      task: {
        status: "completed"
      }
    });
  });

  it("opens safe external URLs through the local browser bridge", async () => {
    const openExternalUrl = vi.fn();
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-open-url-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false,
      openExternalUrl
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/open-url",
        payload: {
          url: "https://example.com/news-1"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true
      });
      expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/news-1");
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects unsafe external URL protocols", async () => {
    const openExternalUrl = vi.fn();
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-open-url-invalid-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false,
      openExternalUrl
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/open-url",
        payload: {
          url: "file:///C:/Windows/System32/calc.exe"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(openExternalUrl).not.toHaveBeenCalled();
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("dispatches a detached project restart request", async () => {
    const restartProject = vi.fn();
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-restart-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false,
      restartProject
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/system/restart"
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({
        ok: true
      });
      expect(restartProject).toHaveBeenCalledTimes(1);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("reports the current backend process start marker", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-status-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "GET",
        url: "/api/system/status"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true,
        startedAt: expect.any(String)
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("records ledger facts through the ledger-agent path and exposes them in dashboard recent facts", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-record-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();
    vi.useFakeTimers({
      toFake: ["Date"]
    });
    vi.setSystemTime(new Date("2026-05-14T14:30:00+08:00"));

    try {
      const recordResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/ledger/record",
        payload: {
          message: "今天梦幻西游卖货赚了 500"
        }
      });

      expect(recordResponse.statusCode).toBe(200);
      expect(recordResponse.json()).toMatchObject({
        route: {
          agentId: "ledger-agent"
        },
        task: {
          status: "completed"
        }
      });

      const dashboardResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/dashboard"
      });

      expect(dashboardResponse.statusCode).toBe(200);
      expect(dashboardResponse.json().ledger.dashboard.recentFacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            amountCents: 50000,
            summary: expect.stringContaining("梦幻西游")
          })
        ])
      );
      expect(dashboardResponse.json().ledger.summary.todayIncome).toBe(
        dashboardResponse.json().ledger.dashboard.todayIncomeCents / 100
      );
      expect(dashboardResponse.json().ledger.summary.todayIncome).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("generates cinematic projects and exposes them in dashboard summary", async () => {
    process.env.CINEMATIC_PROJECT_FIXTURE_JSON = JSON.stringify(createCinematicFixture());
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-cinematic-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const generateResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/cinematic/generate",
        payload: {
          concept: "孤独感的城市夜晚",
          targetShotCount: 4
        }
      });

      expect(generateResponse.statusCode).toBe(200);
      expect(generateResponse.json()).toMatchObject({
        projects: [
          expect.objectContaining({
            id: "cinematic-app-fixture",
            title: "凌晨两点的城市"
          })
        ],
        recentProjectIds: ["cinematic-app-fixture"]
      });

      const dashboardResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/dashboard"
      });

      expect(dashboardResponse.statusCode).toBe(200);
      expect(dashboardResponse.json().cinematic.dashboard).toMatchObject({
        projectCount: 1,
        totalShotCount: 4,
        latestProject: expect.objectContaining({
          title: "凌晨两点的城市"
        })
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("reports cinematic generation task failures instead of returning an empty state", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-cinematic-failure-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const generateResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/cinematic/generate",
        payload: {
          concept: ""
        }
      });

      expect(generateResponse.statusCode).toBe(500);
      expect(generateResponse.json().message).toContain("未找到可用模型配置");
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("generates classic shot projects and exposes them in dashboard summary", async () => {
    process.env.CLASSIC_SHOT_PROJECT_FIXTURE_JSON = JSON.stringify(createClassicShotFixture());
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-classic-shot-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const generateResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/classic-shots/generate",
        payload: {
          input: "王家卫 花样年华 走廊擦肩镜头",
          targetPlatform: "kling"
        }
      });

      expect(generateResponse.statusCode).toBe(200);
      expect(generateResponse.json()).toMatchObject({
        projects: [
          expect.objectContaining({
            id: "classic-shot-app-fixture",
            title: "走廊擦肩的压抑长镜头",
            source: expect.objectContaining({
              director: "王家卫",
              film: "花样年华",
              year: 2000
            })
          })
        ],
        recentProjectIds: ["classic-shot-app-fixture"]
      });

      const dashboardResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/dashboard"
      });

      expect(dashboardResponse.statusCode).toBe(200);
      expect(dashboardResponse.json().classicShots.dashboard).toMatchObject({
        projectCount: 1,
        totalStoryboardCount: 1,
        latestProject: expect.objectContaining({
          title: "走廊擦肩的压抑长镜头"
        })
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("returns repository-backed ledger timeline facts", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-timeline-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const recordResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/ledger/record",
        payload: {
          message: "昨天和老婆吃火锅花了 280"
        }
      });

      expect(recordResponse.statusCode).toBe(200);

      const timelineResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/ledger/timeline"
      });

      expect(timelineResponse.statusCode).toBe(200);
      expect(timelineResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fact: expect.objectContaining({
              rawText: "昨天和老婆吃火锅花了 280",
              amountCents: 28000,
              direction: "expense"
            }),
            semantic: expect.objectContaining({
              primaryCategory: "餐饮",
              confidence: 0.86
            })
          })
        ])
      );
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("returns the minimal ledger reports list", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-reports-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const reportsResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/ledger/reports"
      });

      expect(reportsResponse.statusCode).toBe(200);
      expect(reportsResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: expect.stringMatching(/weekly|monthly/),
            summary: expect.any(String),
            insights: expect.any(Array)
          })
        ])
      );
      expect(
        JSON.parse(readFileSync(join(isolatedDataDir, "ledger", "reports.json"), "utf8"))
      ).toEqual([]);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects empty ledger record messages", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-ledger-empty-record-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/ledger/record",
        payload: {
          message: "   "
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        message: expect.stringContaining("message")
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("creates, lists, drafts, exports, imports, and deletes summaries through the summary API", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-summary-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const draftResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/summaries/generate-draft",
        payload: {
          summaryType: "daily",
          rawInput: "今天上班很累，晚上研究 AI agent 有进展，但剪视频没动，有点焦虑。"
        }
      });

      expect(draftResponse.statusCode).toBe(200);
      expect(draftResponse.json()).toMatchObject({
        summaryType: "daily",
        finalSummary: "",
        aiDraft: expect.stringContaining("焦虑")
      });
      const draft = draftResponse.json() as Record<string, unknown>;

      const createResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/summaries",
        payload: {
          ...draft,
          finalSummary: "今天推进了 AI agent 学习，但视频任务继续拖延，焦虑来自重要任务迟迟没有开始。"
        }
      });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json()).toMatchObject({
        id: expect.any(String),
        summaryType: "daily",
        version: 1
      });

      const listResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/summaries?summaryType=daily&q=agent"
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().entries).toHaveLength(1);

      const exportResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/summaries/export"
      });

      expect(exportResponse.statusCode).toBe(200);
      expect(exportResponse.json()).toMatchObject({
        version: 1,
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: createResponse.json().id
          })
        ])
      });

      const importResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/summaries/import",
        payload: exportResponse.json()
      });

      expect(importResponse.statusCode).toBe(200);
      expect(importResponse.json()).toMatchObject({
        importedCount: 0,
        skippedCount: 1
      });

      const deleteResponse = await isolatedApp.inject({
        method: "DELETE",
        url: `/api/summaries/${createResponse.json().id}`
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toMatchObject({
        ok: true
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("syncs AI HOT all items and daily reports", async () => {
    process.env.AIHOT_ITEMS_FIXTURE_JSON = JSON.stringify({
      count: 1,
      hasNext: false,
      nextCursor: null,
      items: [
        {
          id: "cmow6i2aq036jslcxxneym5zm",
          title: "Claude v2.1.133 版本更新",
          url: "https://github.com/anthropics/claude-code/releases/tag/v2.1.133",
          source: "Claude Code：GitHub Releases（RSS）",
          publishedAt: "2026-05-07T23:49:04.000Z",
          summary: "Claude 发布 v2.1.133 版本，新增多项配置与优化。",
          category: "ai-products"
        }
      ]
    });
    process.env.AIHOT_DAILY_FIXTURE_JSON = JSON.stringify({
      date: "2026-05-08",
      generatedAt: "2026-05-08T11:00:00.000Z",
      windowStart: "2026-05-07T00:00:00.000Z",
      windowEnd: "2026-05-08T00:00:00.000Z",
      lead: {
        title: "今日 AI 摘要",
        summary: "AI 产品和模型更新密集。"
      },
      sections: [],
      flashes: []
    });
    process.env.AIHOT_DAILIES_FIXTURE_JSON = JSON.stringify({
      count: 1,
      items: [
        {
          date: "2026-05-08",
          generatedAt: "2026-05-08T11:00:00.000Z",
          leadTitle: "今日 AI 摘要"
        }
      ]
    });

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/news/refresh",
      payload: {
        reason: "test",
        view: "all"
      }
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshedNews = refreshResponse.json();
    expect(refreshedNews).toMatchObject({
      feed: {
        items: [
          expect.objectContaining({
            title: "Claude v2.1.133 版本更新",
            category: "ai-products",
            source: "Claude Code：GitHub Releases（RSS）"
          })
        ]
      },
      lastError: null
    });

    const dailyResponse = await app.inject({
      method: "POST",
      url: "/api/news/refresh",
      payload: {
        reason: "test",
        view: "daily"
      }
    });

    expect(dailyResponse.statusCode).toBe(200);
    expect(dailyResponse.json()).toMatchObject({
      daily: {
        date: "2026-05-08",
        lead: {
          title: "今日 AI 摘要"
        }
      },
      dailyArchive: [
        {
          date: "2026-05-08",
          leadTitle: "今日 AI 摘要"
        }
      ]
    });
  });

  it("does not expose the removed news analysis endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/news/items/missing/analyze"
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns the current news state", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/news"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "idle",
      feed: {
        items: expect.any(Array)
      },
      dailyArchive: expect.any(Array)
    });
  });

  it("generates and returns AI self-media topic ideas", async () => {
    const generateResponse = await app.inject({
      method: "POST",
      url: "/api/topics/generate",
      payload: {
        reason: "test"
      }
    });

    expect(generateResponse.statusCode).toBe(200);
    expect(generateResponse.json()).toMatchObject({
      dimensions: expect.any(Array),
      currentByDimension: expect.any(Array),
      current: expect.any(Array),
      history: expect.any(Array),
      status: "idle"
    });
    expect(generateResponse.json().dimensions).toHaveLength(3);
    expect(generateResponse.json().currentByDimension).toHaveLength(3);
    expect(generateResponse.json().current).toHaveLength(3);

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/topics"
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().current).toHaveLength(3);
  });

  it("generates a history post from the manual generation endpoint", async () => {
    process.env.HISTORY_POST_FIXTURE_JSON = JSON.stringify({
      topic: "张骞出使西域如何改变丝绸之路",
      summary: "一次外交行动，重塑了贸易、地理认知和文化交流。",
      cardCount: 2,
      cards: [
        {
          title: "先讲出发背景",
          imageText: "汉朝为什么一定要向西走？",
          prompt: longHistoryImagePrompt("中国古代使者与丝路地图")
        },
        {
          title: "再讲长期影响",
          imageText: "打开的不是一条路，而是一整套交流网络",
          prompt: longHistoryImagePrompt("丝绸之路商队与文明交流")
        }
      ],
      xiaohongshuCaption: "今天用两张图讲清张骞出使西域为什么是历史转折点。"
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/history/generate",
      payload: {
        reason: "test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: expect.arrayContaining([
        expect.objectContaining({
          kind: "history-post",
          title: "每日历史知识点：张骞出使西域如何改变丝绸之路"
        })
      ])
    });
  });

  it("syncs history xiaohongshu analytics", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-xhs-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false,
      historyXhsService: {
        async sync() {
          return {
            posts: [
              {
                id: "note-1",
                title: "张骞出使西域",
                publishedAt: "2026-05-20T08:00:00.000Z",
                url: "https://www.xiaohongshu.com/explore/note-1",
                views: 1200,
                likes: 88,
                collects: 19,
                comments: 7,
                shares: 3
              }
            ],
            overview: {
              postCount: 1,
              totalViews: 1200,
              totalLikes: 88,
              totalCollects: 19,
              totalComments: 7,
              totalShares: 3,
              engagementRate: 117 / 1200
            },
            lastSyncedAt: "2026-05-24T08:00:00.000Z",
            status: "idle",
            lastError: null,
            sourceUrl: "https://creator.xiaohongshu.com/statistics/data-analysis"
          };
        }
      }
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/history/xhs/sync"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        overview: {
          totalViews: 1200,
          totalLikes: 88
        },
        posts: [
          expect.objectContaining({
            title: "张骞出使西域"
          })
        ]
      });

      const dashboard = await isolatedApp.inject({
        method: "GET",
        url: "/api/dashboard"
      });

      expect(dashboard.json().historyXhs.overview.totalViews).toBe(1200);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("manages model profiles without exposing API keys", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-model-profile-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });
    await isolatedApp.ready();

    try {
      process.env.OPENAI_API_KEY = "sk-env-secret-0000";
      const createResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/model-profiles",
        payload: {
          displayName: "OpenAI Mini",
          provider: "openai",
          modelName: "gpt-4.1-mini",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test-secret-abcd",
          capabilities: ["chat", "text"],
          purpose: ["general"],
          temperature: 0.2,
          maxTokens: 1200,
          enabled: true,
          isDefault: true
        }
      });

      expect(createResponse.statusCode).toBe(200);
      expect(JSON.stringify(createResponse.json())).not.toContain("sk-test-secret-abcd");
      expect(createResponse.json()).toMatchObject({
        displayName: "OpenAI Mini",
        hasApiKey: true,
        maskedKey: "sk-****abcd",
        apiKeySource: "local"
      });

      const listResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/model-profiles"
      });

      expect(listResponse.statusCode).toBe(200);
      expect(JSON.stringify(listResponse.json())).not.toContain("sk-test-secret-abcd");
      expect(listResponse.json().profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            displayName: "OpenAI Mini",
            hasApiKey: true,
            maskedKey: "sk-****abcd",
            apiKeySource: "local"
          })
        ])
      );

      const profileId = createResponse.json().id;
      const deleteResponse = await isolatedApp.inject({
        method: "DELETE",
        url: `/api/model-profiles/${profileId}`
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(readFileSync(join(isolatedDataDir, "secrets", "model-secrets.json"), "utf8")).not.toContain(
        "sk-test-secret-abcd"
      );
    } finally {
      delete process.env.OPENAI_API_KEY;
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("exposes model providers without secrets", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/model-providers"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "modelscope",
          requiresApiKey: true
        }),
        expect.objectContaining({
          id: "ollama",
          requiresApiKey: false
        })
      ])
    );
    expect(JSON.stringify(response.json())).not.toContain("API_KEY");
  });

  it("sets an agent default model profile for a sub-agent module", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-agent-model-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });
    await isolatedApp.ready();

    try {
      const createResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/model-profiles",
        payload: {
          displayName: "DeepSeek for history",
          provider: "deepseek",
          modelName: "deepseek-chat",
          baseUrl: "https://api.deepseek.com",
          apiKey: "sk-agent-secret-abcd",
          capabilities: ["chat", "text"],
          purpose: [],
          enabled: true,
          isDefault: false
        }
      });
      const profileId = createResponse.json().id;

      const bindResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/model-profiles/agent-default",
        payload: {
          agentId: "history-agent",
          profileId
        }
      });

      expect(bindResponse.statusCode).toBe(200);
      expect(bindResponse.json().agentDefaults).toMatchObject({
        "history-agent": profileId
      });

      const listResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/model-profiles"
      });

      expect(listResponse.json().agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "history-agent",
            name: expect.any(String)
          })
        ])
      );
      expect(listResponse.json().settings.agentDefaults).toMatchObject({
        "history-agent": profileId
      });
      expect(JSON.stringify(listResponse.json())).not.toContain("sk-agent-secret-abcd");
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("exposes a notification cancellation endpoint", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/notifications/missing-notification"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: expect.any(Array)
    });
  });

  it("uses a 30-minute default news refresh interval", () => {
    expect(DEFAULT_NEWS_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});
