import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { GameCreatorState } from "@agent-zy/shared-types";

import { createControlPlaneApp } from "./app";

function createState(): GameCreatorState {
  return {
    version: 1,
    date: "2026-07-30",
    projectId: "game-video-1",
    updatedAt: "2026-07-30T01:00:00.000Z",
    activeStage: "brief",
    completedTaskIds: [],
    checkedQualityIds: [],
    ready: false,
    completedVideos: 0,
    draft: {
      game: "黑神话：悟空",
      audience: "动作游戏新玩家",
      format: "5–15 分钟 · B站横版中视频",
      promise: "避开开荒误区",
      angle: "攻略 / 教学",
      title: "",
      coverCopy: "",
      opening: "",
      outline: "",
      assetNotes: "",
      editNotes: "",
      tags: "",
      publishedUrl: "",
      retrospective: ""
    }
  };
}

describe("game creator API", () => {
  it("persists valid workspace data and rejects malformed snapshots", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-game-creator-api-"));
    const app = createControlPlaneApp({ dataDir, startSchedulers: false });

    try {
      const empty = await app.inject({ method: "GET", url: "/api/game-creator" });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toBeNull();

      const invalid = await app.inject({
        method: "PUT",
        url: "/api/game-creator",
        payload: { version: 1, projectId: "broken" }
      });
      expect(invalid.statusCode).toBe(400);

      const state = createState();
      const saved = await app.inject({
        method: "PUT",
        url: "/api/game-creator",
        payload: state
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual(state);

      const loaded = await app.inject({ method: "GET", url: "/api/game-creator" });
      expect(loaded.json()).toEqual(state);
    } finally {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
