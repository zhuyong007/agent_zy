// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import {
  GAME_CREATOR_STORAGE_KEY,
  GameCreatorWorkspace,
  chooseNewestGameCreatorState,
  createInitialGameCreatorState,
  loadGameCreatorState
} from "./game-creator-page";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let lastKey = "";
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => {
      lastKey = key;
      values.set(key, next);
    },
    read: (key = GAME_CREATOR_STORAGE_KEY) => values.get(key) ?? null,
    key: () => lastKey
  };
}

async function changeValue(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  await act(async () => {
    if (!element) throw new Error("missing form control");
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("GameCreatorWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
  });

  async function renderWorkspace(options: Partial<React.ComponentProps<typeof GameCreatorWorkspace>> = {}) {
    const storage = options.storage ?? createMemoryStorage();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(GameCreatorWorkspace, {
          storage,
          now: () => new Date("2026-08-11T09:00:00+08:00"),
          remoteActions: null,
          ...options
        })
      );
    });

    return storage as ReturnType<typeof createMemoryStorage>;
  }

  it("organizes the workspace around branch-first creation", async () => {
    await renderWorkspace();

    expect(container.textContent).toContain("边玩边收集，通关后再把它们串起来");
    expect(container.textContent).toContain("刚才有什么值得单独说？");
    expect(container.textContent).toContain("支线库");
    expect(container.textContent).toContain("文稿间");
    expect(container.querySelectorAll(".game-creator-tabs button")).toHaveLength(3);
  });

  it("captures a small branch note and persists it immediately", async () => {
    const storage = await renderWorkspace();
    await changeValue(
      container.querySelector<HTMLInputElement>('input[placeholder="例如：宗教审判所"]'),
      "宗教审判所"
    );
    await changeValue(
      container.querySelector<HTMLTextAreaElement>('textarea[placeholder^="它为什么让我停下来"]'),
      "这里把信仰变成了一套行政流程，值得单独查资料。"
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="save-branch"]')?.click();
    });

    const saved = JSON.parse(storage.read() ?? "{}");
    expect(saved.projects[0].branchNotes[0]).toMatchObject({
      title: "宗教审判所",
      kind: "world"
    });
    expect(container.textContent).toContain("支线已收进素材库");
    expect(storage.key()).toBe(GAME_CREATOR_STORAGE_KEY);
  });

  it("supports short manuscript revisions, follow-up history and adopting a version", async () => {
    const writingAction = vi.fn().mockResolvedValue({
      reply: "我保留了原意，把书面表达放松了一点。",
      revisedText: "这个审判所最可怕的地方，是所有人都觉得流程很正常。"
    });
    const storage = await renderWorkspace({ writingAction });
    const manuscriptTab = [...container.querySelectorAll<HTMLButtonElement>(".game-creator-tabs button")]
      .find((button) => button.textContent?.includes("文稿间"));
    await act(async () => manuscriptTab?.click());
    await changeValue(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="文稿正文"]'), "审判所的流程非常可怕。");
    await changeValue(
      container.querySelector<HTMLTextAreaElement>('textarea[placeholder^="这次想怎么改"]'),
      "别太书面，像我平时说话"
    );

    const sendButton = [...container.querySelectorAll<HTMLButtonElement>(".game-creator-ai-editor__composer button")]
      .find((button) => button.textContent === "发送");
    await act(async () => {
      sendButton?.click();
      await Promise.resolve();
    });

    expect(writingAction).toHaveBeenCalledWith(expect.objectContaining({
      content: "审判所的流程非常可怕。",
      instruction: "别太书面，像我平时说话",
      history: []
    }));
    expect(container.textContent).toContain("我保留了原意");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="adopt-revision"]')?.click();
    });
    const saved = JSON.parse(storage.read() ?? "{}");
    expect(saved.projects[0].manuscripts[0].content).toContain("所有人都觉得流程很正常");
    expect(saved.projects[0].manuscripts[0].revisionMessages).toHaveLength(2);
  });

  it("migrates an old single-video browser snapshot without dropping its writing", () => {
    const legacy = {
      version: 1,
      date: "2026-07-30",
      projectId: "game-video-old",
      updatedAt: "2026-07-30T01:00:00.000Z",
      draft: {
        game: "空洞骑士",
        promise: "看懂圣巢的信仰",
        title: "圣巢总稿",
        opening: "先从一尊神像说起。",
        outline: "再讲审判与秩序。",
        editNotes: "",
        assetNotes: "截图在素材目录",
        tags: "剧情,设定"
      }
    };
    const storage = createMemoryStorage({ "agent-zy-game-creator-v1": JSON.stringify(legacy) });
    const state = loadGameCreatorState(storage, new Date("2026-08-11T09:00:00+08:00"));

    expect(state.version).toBe(2);
    expect(state.projects[0].game).toBe("空洞骑士");
    expect(state.projects[0].manuscripts[0].content).toContain("先从一尊神像说起");
    expect(state.projects[0].branchNotes[0].body).toBe("截图在素材目录");
  });

  it("keeps newer local edits and adopts newer synchronized data", () => {
    const local = createInitialGameCreatorState(new Date("2026-08-11T09:00:00+08:00"));
    local.projects[0].game = "本地新项目";
    local.updatedAt = "2026-08-11T02:00:00.000Z";
    const remote = structuredClone(local);
    remote.projects[0].game = "远端旧项目";
    remote.updatedAt = "2026-08-11T01:00:00.000Z";

    expect(chooseNewestGameCreatorState(local, remote)).toEqual({ state: local, dirty: true });
    remote.updatedAt = "2026-08-11T03:00:00.000Z";
    expect(chooseNewestGameCreatorState(local, remote)).toEqual({ state: remote, dirty: false });
    expect(chooseNewestGameCreatorState(local, remote, false)).toEqual({ state: remote, dirty: false });
  });
});
