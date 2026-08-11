import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { GameCreatorState } from "@agent-zy/shared-types";

import { createControlPlaneApp } from "./app";
import type { ModelRuntime } from "./services/model-runtime";

function createState(): GameCreatorState {
  return {
    version: 2,
    date: "2026-08-11",
    updatedAt: "2026-08-11T01:00:00.000Z",
    activeProjectId: "game-project-1",
    activeView: "capture",
    selectedNoteId: "game-note-1",
    selectedManuscriptId: "game-main-1",
    projects: [
      {
        id: "game-project-1",
        game: "黑神话：悟空",
        phase: "playing",
        progress: "第三章",
        creativeQuestion: "宗教秩序如何影响角色选择",
        branchNotes: [
          {
            id: "game-note-1",
            kind: "world",
            status: "seed",
            title: "宗教审判所",
            body: "值得单独查资料。",
            gameProgress: "第三章",
            tags: ["宗教"],
            source: "截图目录/03",
            createdAt: "2026-08-11T01:00:00.000Z",
            updatedAt: "2026-08-11T01:00:00.000Z"
          }
        ],
        manuscripts: [
          {
            id: "game-main-1",
            kind: "main",
            title: "黑神话总稿",
            content: "",
            sourceNoteIds: [],
            revisionMessages: [],
            createdAt: "2026-08-11T01:00:00.000Z",
            updatedAt: "2026-08-11T01:00:00.000Z"
          }
        ],
        createdAt: "2026-08-11T01:00:00.000Z",
        updatedAt: "2026-08-11T01:00:00.000Z"
      }
    ]
  };
}

describe("game creator API", () => {
  it("persists the branch-first workspace and rejects malformed snapshots", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-game-creator-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });

    try {
      const empty = await app.inject({ method: "GET", url: "/api/game-creator" });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toBeNull();

      const invalid = await app.inject({
        method: "PUT",
        url: "/api/game-creator",
        payload: { version: 2, activeProjectId: "broken" }
      });
      expect(invalid.statusCode).toBe(400);

      const state = createState();
      const saved = await app.inject({ method: "PUT", url: "/api/game-creator", payload: state });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual(state);

      const loaded = await app.inject({ method: "GET", url: "/api/game-creator" });
      expect(loaded.json()).toEqual(state);
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("migrates a valid legacy video workspace on save", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-game-creator-legacy-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });
    const legacy = {
      version: 1,
      date: "2026-07-30",
      projectId: "game-video-old",
      updatedAt: "2026-07-30T01:00:00.000Z",
      activeStage: "script",
      completedTaskIds: [],
      checkedQualityIds: [],
      ready: false,
      completedVideos: 0,
      draft: {
        game: "空洞骑士", audience: "剧情玩家", format: "横版", promise: "看懂圣巢",
        angle: "剧情解析", title: "圣巢总稿", coverCopy: "", opening: "从神像说起。",
        outline: "再讲审判。", assetNotes: "截图目录", editNotes: "", tags: "设定",
        publishedUrl: "", retrospective: ""
      }
    };

    try {
      const saved = await app.inject({ method: "PUT", url: "/api/game-creator", payload: legacy });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ version: 2, activeProjectId: "game-video-old" });
      expect(saved.json().projects[0].manuscripts[0].content).toContain("从神像说起");
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("uses the configured model for conversational manuscript revision", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-game-writing-api-"));
    const generateText = vi.fn<ModelRuntime["generateText"]>().mockResolvedValue({
      text: JSON.stringify({
        reply: "保留原意，放松了语气。",
        revisedText: "这个地方最吓人的，是每个人都觉得它很正常。"
      })
    });
    const app = createControlPlaneApp({
      dataDir,
      startSchedulers: false,
      modelRuntime: { generateText } as unknown as ModelRuntime
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/game-creator/revise",
        payload: {
          manuscriptTitle: "宗教审判所",
          content: "这里很可怕。",
          instruction: "像我平时说话",
          history: [{ role: "user", content: "先短一点" }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().revisedText).toContain("每个人都觉得它很正常");
      expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
        purpose: "general",
        responseFormat: "json"
      }));
      expect(generateText.mock.calls[0]?.[0].prompt).toContain("最近问答");
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
