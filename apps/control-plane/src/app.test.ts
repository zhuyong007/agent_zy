import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";
import { DEFAULT_NEWS_INTERVAL_MS } from "./services/scheduler";

function longHistoryImagePrompt(topic: string) {
  return `${topic}，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，背景包含地图、书卷、建筑纹样与柔和光线，暖金与青灰配色，画面上方预留中文标题区域，下方保留解释文字空间，质感像博物馆展陈海报，细节丰富但不拥挤。`;
}

function createMultipartFilePayload(input: {
  boundary: string;
  fieldName: string;
  filename: string;
  mimeType: string;
  content: Buffer | string;
}) {
  return Buffer.concat([
    Buffer.from(`--${input.boundary}\r\n`),
    Buffer.from(
      `Content-Disposition: form-data; name="${input.fieldName}"; filename="${input.filename}"\r\nContent-Type: ${input.mimeType}\r\n\r\n`
    ),
    typeof input.content === "string" ? Buffer.from(input.content) : input.content,
    Buffer.from(`\r\n--${input.boundary}--\r\n`)
  ]);
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

  it("does not expose APIs for removed feature modules", async () => {
    const removedRoutes = [
      { method: "GET", url: "/api/topics" },
      { method: "GET", url: "/api/cinematic" },
      { method: "GET", url: "/api/classic-shots" },
      { method: "GET", url: "/api/image-to-video/projects" },
      { method: "GET", url: "/api/interview/overview" }
    ] as const;

    for (const route of removedRoutes) {
      const response = await app.inject(route);
      expect(response.statusCode).toBe(404);
    }

    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard" });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).not.toHaveProperty("topics");
    expect(dashboard.json()).not.toHaveProperty("cinematic");
    expect(dashboard.json()).not.toHaveProperty("classicShots");
    expect(dashboard.json()).not.toHaveProperty("imageToVideo");
    expect(dashboard.json()).not.toHaveProperty("interview");
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

  it("generates a history post from the manual generation endpoint", async () => {
    process.env.HISTORY_POST_FIXTURE_JSON = JSON.stringify({
      topic: "张骞出使西域如何改变丝绸之路",
      summary: "一次外交行动，重塑了贸易、地理认知和文化交流。",
      cover: {
        title: "张骞出使西域如何改变丝绸之路",
        subtitle: "一次外交打开欧亚交流网络",
        imageText: "张骞出使西域\n路线节点 / 外交背景 / 交流影响",
        prompt: longHistoryImagePrompt("张骞出使西域小红书首图封面")
      },
      cardCount: 3,
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
        },
        {
          title: "最后讲知识范围",
          imageText: "图中展示外交背景、路线节点和交流影响",
          prompt: longHistoryImagePrompt("张骞出使西域路线与知识交流")
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
          title: "每日历史知识点：张骞出使西域如何改变丝绸之路",
          payload: expect.objectContaining({
            cover: expect.objectContaining({
              title: "张骞出使西域如何改变丝绸之路",
              prompt: expect.stringContaining("小红书首图封面")
            })
          })
        })
      ])
    });
  });

  it("generates a dynasty four-module payload from the manual generation endpoint", async () => {
    const createDynastyModule = (type: string, topic: string) => ({
      type,
      topic,
      summary: `${topic} 摘要`,
      cover: {
        title: topic,
        subtitle: "一套完整封面方案",
        imageText: `${topic}\n关键人物 / 时间线 / 影响`,
        prompt: longHistoryImagePrompt(`${topic} 小红书首图封面`)
      },
      cardCount: 3,
      cards: [
        {
          title: `${topic} 图1`,
          imageText: "先讲背景",
          prompt: longHistoryImagePrompt(`${topic} 图1`)
        },
        {
          title: `${topic} 图2`,
          imageText: "再讲转折",
          prompt: longHistoryImagePrompt(`${topic} 图2`)
        },
        {
          title: `${topic} 图3`,
          imageText: "最后讲影响",
          prompt: longHistoryImagePrompt(`${topic} 图3`)
        }
      ],
      xiaohongshuCaption: `${topic} 小红书正文`
    });
    process.env.HISTORY_POST_FIXTURE_JSON = JSON.stringify({
      dynasty: "东汉",
      modules: [
        createDynastyModule("王朝兴衰录", "东汉是怎么一步步走向灭亡的"),
        createDynastyModule("皇帝图鉴", "看懂东汉只需要认识这几位皇帝"),
        createDynastyModule("风云人物", "改变东汉命运的5个人"),
        createDynastyModule("历史冷知识", "东汉公务员一个月赚多少钱？")
      ]
    });

    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-dynasty-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/history/generate",
        payload: {
          reason: "test",
          mode: "dynasty",
          dynasty: "东汉"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        notifications: expect.arrayContaining([
          expect.objectContaining({
            kind: "history-post",
            title: "朝代四件套：东汉",
            payload: expect.objectContaining({
              dynasty: "东汉",
              modules: expect.arrayContaining([
                expect.objectContaining({
                  type: "王朝兴衰录",
                  cardCount: 3,
                  cards: expect.arrayContaining([
                    expect.objectContaining({
                      prompt: expect.stringContaining("竖版小红书历史知识卡片")
                    })
                  ]),
                  xiaohongshuCaption: expect.stringContaining("小红书正文")
                })
              ])
            })
          })
        ])
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("generates a most-series post from the manual generation endpoint", async () => {
    const topic = "谁是中国历史上最富有的商人？";
    process.env.HISTORY_POST_FIXTURE_JSON = JSON.stringify({
      topic,
      summary: "限定比较范围与财富口径，并说明可考证据和争议。",
      cover: {
        title: topic,
        subtitle: "比较口径决定答案",
        imageText: `${topic}\n范围 / 指标 / 证据`,
        prompt: longHistoryImagePrompt(`${topic} 小红书首图封面`)
      },
      cardCount: 3,
      cards: [1, 2, 3].map((index) => ({
        title: `${topic} 图${index}`,
        imageText: `第${index}部分`,
        prompt: longHistoryImagePrompt(`${topic} 图${index}`)
      })),
      xiaohongshuCaption: `${topic} 小红书正文`
    });

    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-most-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/history/generate",
        payload: {
          reason: "test",
          mode: "most"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        notifications: expect.arrayContaining([
          expect.objectContaining({
            kind: "history-post",
            title: `“最”系列：${topic}`,
            payload: expect.objectContaining({
              topic,
              cardCount: 3
            })
          })
        ])
      });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("imports history xiaohongshu analytics from a workbook upload", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-control-plane-xhs-test-"));
    const workbookFilename = "\u7b14\u8bb0\u5217\u8868\u660e\u7ec6\u8868.xlsx";
    const noteTitle = "\u5f20\u9a9e\u51fa\u4f7f\u897f\u57df";
    const importWorkbook = vi.fn(async (input: { buffer: Buffer; fileName?: string | null }) => {
      expect(Buffer.isBuffer(input.buffer)).toBe(true);

      return {
        posts: [
          {
            id: "note-1",
            title: noteTitle,
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
        status: "idle" as const,
        lastError: null,
        sourceUrl: input.fileName ?? "uploaded-file"
      };
    });
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false,
      historyXhsService: {
        importWorkbook
      }
    });

    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/history/xhs/import",
        headers: {
          "content-type": "multipart/form-data; boundary=xhs-boundary"
        },
        payload: createMultipartFilePayload({
          boundary: "xhs-boundary",
          fieldName: "file",
          filename: workbookFilename,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          content: "fake workbook"
        })
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        overview: {
          totalViews: 1200,
          totalLikes: 88
        },
        sourceUrl: workbookFilename,
        posts: [
          expect.objectContaining({
            title: noteTitle
          })
        ]
      });
      expect(importWorkbook).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: workbookFilename,
          buffer: expect.any(Buffer)
        })
      );

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

  it("extracts, creates, updates and deletes history comment reply drafts", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-history-comment-api-test-"));
    const record = {
      id: "reply-api-1",
      targetNotificationId: "history-note-1",
      targetModuleType: null,
      sourceTitle: "张骞出使西域",
      commenterName: "阿青",
      commentText: "第一次出发是哪一年？",
      replyText: "张骞首次出使西域是在公元前138年，这个时间点确实很关键，感谢认真阅读。",
      inputMode: "screenshot" as const,
      detectedNoteTitle: "张骞出使西域",
      factualStatus: "ready" as const,
      verificationNote: "由原内容直接支撑",
      createdAt: "2026-06-29T08:00:00.000Z",
      updatedAt: "2026-06-29T08:00:00.000Z"
    };
    const extractScreenshot = vi.fn(async () => ({
      detectedNoteTitle: "张骞出使西域",
      comments: [{ commenterName: "阿青", commentText: "第一次出发是哪一年？" }],
      targetCandidates: [
        {
          targetNotificationId: "history-note-1",
          targetModuleType: null,
          sourceTitle: "张骞出使西域",
          score: 1
        }
      ],
      warnings: []
    }));
    const createReply = vi.fn(async () => record);
    const updateReply = vi.fn(async (_id: string, replyText: string) => ({ ...record, replyText }));
    const deleteReply = vi.fn(() => ({ records: [] }));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false,
      historyCommentReplyService: {
        extractScreenshot,
        createReply,
        updateReply,
        deleteReply
      }
    });

    await isolatedApp.ready();

    try {
      const extractionResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/history/comment-replies/extract",
        headers: {
          "content-type": "multipart/form-data; boundary=history-comment-boundary"
        },
        payload: createMultipartFilePayload({
          boundary: "history-comment-boundary",
          fieldName: "file",
          filename: "comment.png",
          mimeType: "image/png",
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        })
      });
      expect(extractionResponse.statusCode).toBe(200);
      expect(extractionResponse.json().comments).toHaveLength(1);
      expect(extractScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({ buffer: expect.any(Buffer), mimeType: "image/png" })
      );

      const createResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/history/comment-replies",
        payload: {
          targetNotificationId: "history-note-1",
          targetModuleType: null,
          commenterName: "阿青",
          commentText: "第一次出发是哪一年？",
          inputMode: "screenshot",
          detectedNoteTitle: "张骞出使西域"
        }
      });
      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json().id).toBe("reply-api-1");

      const updateResponse = await isolatedApp.inject({
        method: "PUT",
        url: "/api/history/comment-replies/reply-api-1",
        payload: { replyText: record.replyText }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateReply).toHaveBeenCalledWith("reply-api-1", record.replyText);

      const deleteResponse = await isolatedApp.inject({
        method: "DELETE",
        url: "/api/history/comment-replies/reply-api-1"
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json()).toEqual({ records: [] });
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, { recursive: true, force: true });
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

  it("stores client events, records business API requests, and clears structured logs", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-log-api-test-"));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });
    await isolatedApp.ready();

    try {
      const clientResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/logs/client-events",
        payload: {
          level: "info",
          category: "frontend",
          action: "history.generate.clicked",
          message: "立即生成",
          details: {
            authorization: "Bearer browser-secret"
          }
        }
      });
      expect(clientResponse.statusCode).toBe(202);

      await isolatedApp.inject({
        method: "GET",
        url: "/api/dashboard"
      });

      const listResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/logs?category=frontend"
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toMatchObject({
        items: [
          expect.objectContaining({
            category: "frontend",
            action: "history.generate.clicked",
            details: {
              authorization: "[redacted]"
            }
          })
        ]
      });

      const apiResponse = await isolatedApp.inject({
        method: "GET",
        url: "/api/logs?category=api"
      });
      expect(apiResponse.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "api",
            action: "request.completed",
            message: "GET /api/dashboard"
          })
        ])
      );
      expect(apiResponse.json().items).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("/api/logs")
          })
        ])
      );

      const clearResponse = await isolatedApp.inject({
        method: "DELETE",
        url: "/api/logs"
      });
      expect(clearResponse.statusCode).toBe(200);
      expect(clearResponse.json()).toEqual({ ok: true });
      expect((await isolatedApp.inject({ method: "GET", url: "/api/logs" })).json().items).toEqual([]);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("previews, executes, and undoes a local photo rename batch without logging paths or tokens", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-photo-renamer-api-test-"));
    const photoDir = join(isolatedDataDir, "photos");
    const sourcePath = join(photoDir, "holiday.jpg");
    const targetPath = join(photoDir, "20260101_12_23_24.jpg");
    mkdirSync(photoDir);
    writeFileSync(sourcePath, "photo", { flag: "wx" });
    utimesSync(sourcePath, new Date(2026, 0, 1, 12, 23, 24), new Date(2026, 0, 1, 12, 23, 24));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });
    await isolatedApp.ready();

    try {
      const previewResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/photo-renamer/preview",
        payload: {
          directoryPath: photoDir
        }
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(previewResponse.json()).toMatchObject({
        previewToken: expect.any(String),
        summary: {
          total: 1,
          rename: 1,
          unchanged: 0,
          skipped: 0
        }
      });

      const executeResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/photo-renamer/execute",
        payload: {
          previewToken: previewResponse.json().previewToken
        }
      });
      expect(executeResponse.statusCode).toBe(200);
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(targetPath)).toBe(true);

      const undoResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/photo-renamer/undo",
        payload: {
          undoToken: executeResponse.json().undoToken
        }
      });
      expect(undoResponse.statusCode).toBe(200);
      expect(existsSync(sourcePath)).toBe(true);

      const logs = (await isolatedApp.inject({
        method: "GET",
        url: "/api/logs?category=tool"
      })).json().items;
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "photo-renamer.preview.completed" }),
          expect.objectContaining({ action: "photo-renamer.execute.completed" }),
          expect.objectContaining({ action: "photo-renamer.undo.completed" })
        ])
      );
      expect(JSON.stringify(logs)).not.toContain(photoDir);
      expect(JSON.stringify(logs)).not.toContain(previewResponse.json().previewToken);
      expect(JSON.stringify(logs)).not.toContain(executeResponse.json().undoToken);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects photo renamer requests from non-local browser origins", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tools/photo-renamer/preview",
      headers: {
        origin: "https://example.com"
      },
      payload: {
        directoryPath: tmpdir()
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      message: "photo renamer is only available from a local browser"
    });
  });

  it("previews only the requested photo renamer media scope", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-photo-renamer-scope-api-test-"));
    const mediaDir = join(isolatedDataDir, "media");
    mkdirSync(mediaDir);
    writeFileSync(join(mediaDir, "photo.jpg"), "photo");
    writeFileSync(join(mediaDir, "clip.mp4"), "video");
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });
    await isolatedApp.ready();

    try {
      const response = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/photo-renamer/preview",
        payload: {
          directoryPath: mediaDir,
          mediaScope: "videos"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().items.map((item: { sourceName: string }) => item.sourceName)).toEqual(["clip.mp4"]);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("previews, executes, and undoes a local file organization batch without logging paths or tokens", async () => {
    const isolatedDataDir = mkdtempSync(join(tmpdir(), "agent-zy-file-organizer-api-test-"));
    const filesDir = join(isolatedDataDir, "files");
    const sourcePath = join(filesDir, "2025-01-02-note.txt");
    const targetDir = join(filesDir, "2025_01");
    const targetPath = join(targetDir, "2025-01-02-note.txt");
    mkdirSync(filesDir);
    writeFileSync(sourcePath, "note", { flag: "wx" });
    utimesSync(sourcePath, new Date(2025, 0, 2, 12, 0, 0), new Date(2025, 0, 2, 12, 0, 0));
    const isolatedApp = createControlPlaneApp({
      dataDir: isolatedDataDir,
      startSchedulers: false
    });
    await isolatedApp.ready();

    try {
      const previewResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/file-organizer/preview",
        payload: {
          directoryPath: filesDir,
          mode: "time",
          timeGranularity: "month"
        }
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(previewResponse.json()).toMatchObject({
        previewToken: expect.any(String),
        summary: {
          total: 1,
          move: 1,
          unchanged: 0,
          skipped: 0
        }
      });

      const executeResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/file-organizer/execute",
        payload: {
          previewToken: previewResponse.json().previewToken
        }
      });
      expect(executeResponse.statusCode).toBe(200);
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(targetPath)).toBe(true);

      const undoResponse = await isolatedApp.inject({
        method: "POST",
        url: "/api/tools/file-organizer/undo",
        payload: {
          undoToken: executeResponse.json().undoToken
        }
      });
      expect(undoResponse.statusCode).toBe(200);
      expect(existsSync(sourcePath)).toBe(true);
      expect(existsSync(targetDir)).toBe(true);

      const logs = (await isolatedApp.inject({
        method: "GET",
        url: "/api/logs?category=tool"
      })).json().items;
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "file-organizer.preview.completed" }),
          expect.objectContaining({ action: "file-organizer.execute.completed" }),
          expect.objectContaining({ action: "file-organizer.undo.completed" })
        ])
      );
      expect(JSON.stringify(logs)).not.toContain(filesDir);
      expect(JSON.stringify(logs)).not.toContain(previewResponse.json().previewToken);
      expect(JSON.stringify(logs)).not.toContain(executeResponse.json().undoToken);
    } finally {
      await isolatedApp.close();
      rmSync(isolatedDataDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects file organizer requests from non-local browser origins", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tools/file-organizer/preview",
      headers: {
        origin: "https://example.com"
      },
      payload: {
        directoryPath: tmpdir(),
        mode: "type"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      message: "file organizer is only available from a local browser"
    });
  });

  it("uses a 30-minute default news refresh interval", () => {
    expect(DEFAULT_NEWS_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});
