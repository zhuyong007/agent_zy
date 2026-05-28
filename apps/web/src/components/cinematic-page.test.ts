// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { CinematicState } from "@agent-zy/shared-types";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

const project = {
  id: "cinematic-1",
  title: "凌晨两点的城市",
  concept: "孤独感的城市夜晚",
  mood: "孤独",
  script: "城市从不睡觉，只是把孤独留给凌晨两点的人。",
  storyboard: [
    {
      id: "shot-1",
      sceneId: "scene-1",
      sceneAnchor: "same rainy street outside the convenience store",
      characterRefs: ["character-1"],
      propRefs: ["prop-1"],
      sceneRef: "scene-ref-1",
      title: "雨后街口",
      purpose: "建立孤独空间",
      duration: "5 秒",
      cameraMovement: "缓慢推进",
      shotType: "环境人物镜头",
      composition: "人物偏右，大面积负空间",
      transition: "溶接",
      audioHint: "低频城市环境音",
      emotionalBeat: "压抑",
      handoff: "镜头停在积水倒影，下一镜从同一片倒影抬起进入人物背影。",
      prompt: {
        zh: "雨后街口，冷蓝霓虹，镜头缓慢推进，人物被压在画面边缘。",
        en: "Rainy neon city street, slow cinematic push in, lonely figure at the edge of frame."
      }
    }
  ],
  createdAt: "2026-05-22T08:00:00.000Z",
  updatedAt: "2026-05-22T08:00:00.000Z",
  tags: ["城市"],
  style: "冷蓝霓虹",
  pace: "缓慢",
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
  referenceAssets: {
    characters: [
      {
        id: "character-1",
        name: "凌晨街口的白衣人",
        description: "白衬衫、深色长裤、湿发贴近额头。",
        views: {
          front: {
            zh: "人物正面三视图参考，白衬衫、深色长裤、湿发、冷蓝边缘光。",
            en: "Front character reference sheet, white shirt, dark trousers, wet hair, cold blue rim light."
          },
          side: {
            zh: "人物侧面三视图参考，保持同一脸型、服装比例和发型。",
            en: "Side character reference sheet preserving the same face shape, costume proportions, and hairstyle."
          },
          back: {
            zh: "人物背面三视图参考，白衬衫背部湿痕、深色长裤、湿发后轮廓。",
            en: "Back character reference sheet with damp white shirt back, dark trousers, wet hair silhouette."
          }
        }
      }
    ],
    props: [
      {
        id: "prop-1",
        name: "红色雨伞",
        description: "半旧红色长柄雨伞。",
        views: {
          front: {
            zh: "红色雨伞正面三视图参考，伞面有雨滴和轻微磨损。",
            en: "Front prop reference sheet for a red umbrella with raindrops and subtle wear."
          },
          side: {
            zh: "红色雨伞侧面三视图参考，保持同一伞柄弧度。",
            en: "Side prop reference sheet preserving the same handle curve."
          },
          back: {
            zh: "红色雨伞背面三视图参考，伞骨结构保持一致。",
            en: "Back prop reference sheet preserving the rib structure."
          }
        }
      }
    ],
    scenes: [
      {
        id: "scene-ref-1",
        name: "雨后便利店街口",
        description: "便利店在画面右侧，前景有积水倒影。",
        prompt: {
          zh: "场景参考图，雨后便利店街口，便利店白光在右侧，冷蓝霓虹从街角打入。",
          en: "Scene reference image, rainy convenience-store street corner, white store light on the right, cold blue neon from the corner."
        }
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
  targetShotCount: 4
};

const cinematicState: CinematicState = {
  projects: [project],
  recentProjectIds: [project.id],
  lastGeneratedAt: project.updatedAt,
  status: "idle",
  lastError: null
};

vi.mock("../api", () => ({
  fetchCinematic: vi.fn(async () => cinematicState),
  fetchDashboard: vi.fn(async () => ({
    homeLayout: [],
    cinematic: {
      ...cinematicState,
      dashboard: {
        projectCount: 1,
        recentProjects: [project],
        latestProject: project,
        lastGeneratedAt: project.updatedAt,
        totalShotCount: 1,
        todayInspiration: "孤独 · 冷蓝霓虹"
      }
    }
  })),
  fetchHomeLayout: vi.fn(async () => []),
  saveHomeLayout: vi.fn(async (layout) => layout),
  generateCinematic: vi.fn(async () => cinematicState),
  updateCinematicProject: vi.fn(async () => project),
  deleteCinematicProject: vi.fn(async () => ({
    projects: [],
    recentProjectIds: [],
    lastGeneratedAt: null,
    status: "idle",
    lastError: null
  })),
  openDashboardStream: vi.fn(() => () => undefined),
  restartProject: vi.fn(async () => ({ ok: true }))
}));

import { deleteCinematicProject, generateCinematic } from "../api";
import { buildCinematicMarkdown, buildStoryboardVideoPrompt, CinematicPage } from "./cinematic-page";

describe("CinematicPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    vi.clearAllMocks();
  });

  it("renders the three-column cinematic workspace controls", async () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["cinematic"], cinematicState);
    queryClient.setQueryData(["home-layout"], []);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(CinematicPage)
        )
      );
    });

    expect(container.textContent).toContain("电影镜头设计");
    expect(container.textContent).toContain("分镜结构");
    expect(container.textContent).toContain("中文提示词");
    expect(container.textContent).toContain("English Prompt");
    expect(container.textContent).toContain("画面风格（可选）");
    expect(container.querySelector('select[aria-label="画面风格"]')).not.toBeNull();
    expect(container.textContent).toContain("必须出现的静态画面元素");
    expect(container.textContent).toContain("不要出现的内容");
    expect(container.querySelector(".cinematic-shot-meta")).toBeNull();
    expect(container.textContent).toContain("导出 markdown");
    expect(container.textContent).toContain("导出 JSON");
    expect(container.textContent).toContain("一键复制提示词");
    expect(container.textContent).toContain("分镜串联视频提示词");
    expect(container.textContent).toContain("Front character reference sheet");
    expect(container.textContent).toContain("Scene reference image");
    expect(container.textContent).toContain("人物参考图提示词");
    expect(container.textContent).toContain("场景参考图提示词");
    expect(container.querySelectorAll(".cinematic-reference-module .cinematic-prompt-block").length).toBeGreaterThanOrEqual(8);
  });

  it("keeps the cinematic workspace scrollable when generated content exceeds the viewport", () => {
    const css = readFileSync(join(process.cwd(), "apps/web/src/styles.css"), "utf8");
    const workspaceRule = css.match(/\.cinematic-workspace\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

    expect(workspaceRule).toContain("height: 100vh");
    expect(workspaceRule).toContain("overflow-y: auto");
  });

  it("exports markdown with bilingual prompts", () => {
    const markdown = buildCinematicMarkdown(project);

    expect(markdown).toContain("# 凌晨两点的城市");
    expect(markdown).toContain("中文提示词");
    expect(markdown).toContain("English Prompt");
    expect(markdown).toContain("分镜串联视频提示词");
    expect(markdown).toContain("参考图生成提示词");
    expect(markdown).toContain("人物三视图");
    expect(markdown).toContain("物品三视图");
    expect(markdown).toContain("场景参考图");
    expect(markdown).toContain("引用参考图：character-1 / prop-1 / scene-ref-1");
  });

  it("submits the selected visual style when generating cinematic storyboards", async () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["cinematic"], cinematicState);
    queryClient.setQueryData(["home-layout"], []);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(CinematicPage)
        )
      );
    });

    const visualStyleSelect = container.querySelector('select[aria-label="画面风格"]') as HTMLSelectElement | null;
    expect(visualStyleSelect).not.toBeNull();

    await act(async () => {
      visualStyleSelect!.value = "动漫";
      visualStyleSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const generateButton = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(generateButton).not.toBeNull();

    await act(async () => {
      generateButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(vi.mocked(generateCinematic).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      visualStyle: "动漫"
    }));
  });

  it("builds a storyboard video prompt for turning ordered storyboard images into one video", () => {
    const prompt = buildStoryboardVideoPrompt(project);

    expect(prompt.length).toBeLessThanOrEqual(500);
    expect(prompt).toContain("请按上传顺序把1张分镜图生成一条连贯视频");
    expect(prompt).toContain("先上传参考图");
    expect(prompt).toContain("人物character-1");
    expect(prompt).toContain("物品prop-1");
    expect(prompt).toContain("场景scene-ref-1");
    expect(prompt).toContain("画面连贯");
    expect(prompt).toContain("镜头运动");
    expect(prompt).toContain("总长≤15秒");
    expect(prompt).toContain("只用1个连续场景");
    expect(prompt).toContain("不要一图一景");
    expect(prompt).toContain("scene-1");
    expect(prompt).toContain("镜头链：1.雨后街口/缓慢推进/溶接");
    expect(prompt).toContain("禁止变脸、跳切、场景漂移");
    expect(prompt).toContain("整体风格：冷蓝霓虹");
    expect(prompt).not.toContain("情绪");
    expect(prompt).not.toContain("声音");
    expect(prompt).not.toContain("压抑");
    expect(prompt).not.toContain("低频城市环境音");
  });

  it("summarizes long storyboard video prompts without hard truncating the final text", () => {
    const longProject = {
      ...project,
      style: "冷蓝霓虹、雨夜反光、低饱和胶片颗粒、浅景深、湿润街面、便利店白光、红色信号灯".repeat(8),
      continuity: {
        ...project.continuity,
        spatialLine: "所有镜头都发生在同一条雨后街道，人物始终沿便利店门口、积水倒影、街角霓虹这一条连续路径移动，前景雨滴、中景人物、背景高楼窗口的层次关系不能断裂。".repeat(4)
      },
      scenePlan: {
        sceneCount: 2,
        maxDurationSeconds: 15,
        scenes: [
          {
            id: "scene-1",
            name: "rainy-street",
            anchor: "同一条雨后街道，便利店白光在右侧，积水倒影在前景，冷蓝霓虹从街角打入画面".repeat(4),
            role: "主场景"
          },
          {
            id: "scene-2",
            name: "street-corner",
            anchor: "同一街区末端的街角红灯，人物从便利店门口走到这里，空间方向保持一致".repeat(4),
            role: "收束场景"
          }
        ]
      },
      storyboard: Array.from({ length: 8 }, (_, index) => ({
        ...project.storyboard[0],
        id: `shot-${index + 1}`,
        title: `雨夜镜头${index + 1}`,
        cameraMovement: index % 2 === 0 ? "缓慢推进" : "轻微横移",
        transition: index % 2 === 0 ? "积水倒影匹配转场" : "动作延续转场"
      }))
    };
    const prompt = buildStoryboardVideoPrompt(longProject);

    expect(prompt.length).toBeLessThanOrEqual(500);
    expect(prompt.endsWith("…")).toBe(false);
    expect(prompt).toContain("镜头链");
    expect(prompt).toContain("雨夜镜头1");
    expect(prompt).toContain("后续");
    expect(prompt).toContain("总长≤15秒");
  });

  it("deletes a cinematic generation history item from the project list", async () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["cinematic"], cinematicState);
    queryClient.setQueryData(["home-layout"], []);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(CinematicPage)
        )
      );
    });

    const deleteButton = container.querySelector('[aria-label^="删除生成历史"]') as HTMLButtonElement | null;
    expect(deleteButton).not.toBeNull();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(deleteCinematicProject).toHaveBeenCalledWith("cinematic-1");
    expect(queryClient.getQueryData(["cinematic"])).toMatchObject({
      projects: [],
      recentProjectIds: []
    });
  });
});
