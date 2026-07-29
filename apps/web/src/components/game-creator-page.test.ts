// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import {
  GAME_CREATOR_STORAGE_KEY,
  GameCreatorWorkspace,
  createInitialGameCreatorState,
  getQualityScore,
  getReadyBlockers
} from "./game-creator-page";

function createMemoryStorage(initial?: string) {
  let value = initial ?? null;
  let lastKey = "";
  return {
    getItem: () => value,
    setItem: (key: string, next: string) => {
      lastKey = key;
      value = next;
    },
    read: () => value,
    key: () => lastKey
  };
}

describe("GameCreatorWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    container?.remove();
  });

  async function renderWorkspace(storage = createMemoryStorage()) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(GameCreatorWorkspace, {
          storage,
          now: () => new Date("2026-07-29T09:00:00+08:00")
        })
      );
    });

    return storage;
  }

  it("turns the Bilibili methodology into a daily production workflow", async () => {
    await renderWorkspace();

    expect(container.textContent).toContain("游戏创作台");
    expect(container.textContent).toContain("今天只做三件事");
    expect(container.textContent).toContain("B站游戏内容方法论");
    expect(container.textContent).toContain("四类选题形成组合");
    expect(container.textContent).toContain("5–15 分钟");
    expect(container.querySelectorAll(".game-creator-stages button")).toHaveLength(7);
  });

  it("persists input and task progress in local storage", async () => {
    const storage = await renderWorkspace();
    const gameInput = [...container.querySelectorAll("input")]
      .find((input) => input.parentElement?.textContent?.includes("本期游戏"));

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(gameInput, "空洞骑士");
      gameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".game-creator-taskline button")?.click();
    });

    const saved = JSON.parse(storage.read() ?? "{}");
    expect(saved.draft.game).toBe("空洞骑士");
    expect(saved.completedTaskIds).toContain("brief-audience");
    expect(storage.key()).toBe(GAME_CREATOR_STORAGE_KEY);
  });

  it("requires the critical checks and an 80 point score before a video is ready", () => {
    const state = createInitialGameCreatorState(new Date("2026-07-29T09:00:00+08:00"));
    state.draft = {
      ...state.draft,
      game: "塞尔达传说",
      audience: "刚开始探索的新玩家",
      promise: "看完能避开五个开荒误区",
      title: "新手最容易踩的五个坑",
      coverCopy: "别再踩坑",
      opening: "先展示最致命的错误，再说明本期会逐个解决。",
      outline: "问题一；问题二；问题三；问题四；问题五。",
      assetNotes: "已记录五段实机演示、版本号和测试条件。",
      editNotes: "粗剪 9 分钟，已清理停顿并检查人声与字幕。"
    };
    state.completedTaskIds = [
      "brief-audience",
      "brief-angle",
      "brief-promise",
      "script-opening",
      "script-outline",
      "script-payoff",
      "capture-list",
      "capture-proof",
      "capture-rights",
      "edit-rough",
      "edit-pace",
      "edit-audio",
      "package-title",
      "package-cover",
      "package-match",
      "review-full",
      "review-mobile"
    ];
    state.checkedQualityIds = [
      "quality-title",
      "quality-cover",
      "quality-promise",
      "quality-hook",
      "quality-proof",
      "quality-pace"
    ];

    expect(getQualityScore(state)).toBe(80);
    expect(getReadyBlockers(state)).toEqual([]);

    state.completedTaskIds = state.completedTaskIds.filter((id) => id !== "edit-audio");
    expect(getReadyBlockers(state)).toContain("还有 1 项发布前流程未完成");
    state.completedTaskIds.push("edit-audio");

    state.checkedQualityIds = state.checkedQualityIds.filter((id) => id !== "quality-hook");
    state.checkedQualityIds.push("quality-audio", "quality-rights");

    expect(getQualityScore(state)).toBe(85);
    expect(getReadyBlockers(state)).toContain("关键项未过：前 30 秒成立");
  });
});
