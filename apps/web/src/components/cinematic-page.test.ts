// @vitest-environment jsdom

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
  openDashboardStream: vi.fn(() => () => undefined),
  restartProject: vi.fn(async () => ({ ok: true }))
}));

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
    expect(container.textContent).toContain("导出 markdown");
    expect(container.textContent).toContain("导出 JSON");
    expect(container.textContent).toContain("一键复制提示词");
    expect(container.textContent).toContain("分镜串联视频提示词");
  });

  it("exports markdown with bilingual prompts", () => {
    const markdown = buildCinematicMarkdown(project);

    expect(markdown).toContain("# 凌晨两点的城市");
    expect(markdown).toContain("中文提示词");
    expect(markdown).toContain("English Prompt");
    expect(markdown).toContain("分镜串联视频提示词");
  });

  it("builds a storyboard video prompt for turning ordered storyboard images into one video", () => {
    const prompt = buildStoryboardVideoPrompt(project);

    expect(prompt).toContain("请根据按顺序上传的 1 张分镜图生成一条连贯视频");
    expect(prompt).toContain("不要重新设计角色、服装、场景空间或主体构图");
    expect(prompt).toContain("第 1 张分镜图：雨后街口");
    expect(prompt).toContain("时长：5 秒");
    expect(prompt).toContain("镜头运动：缓慢推进");
    expect(prompt).toContain("转场：溶接");
    expect(prompt).toContain("整体风格：冷蓝霓虹");
    expect(prompt).toContain("连续动作线：人物从便利店门口走向街角，动作始终克制缓慢。");
    expect(prompt).toContain("空间连续性：所有镜头发生在同一条雨后街道，便利店、积水和街角霓虹保持方位连续。");
    expect(prompt).toContain("镜头衔接：镜头停在积水倒影，下一镜从同一片倒影抬起进入人物背影。");
  });
});
