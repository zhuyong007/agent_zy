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

import { buildCinematicMarkdown, CinematicPage } from "./cinematic-page";

describe("CinematicPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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
  });

  it("exports markdown with bilingual prompts", () => {
    const markdown = buildCinematicMarkdown(project);

    expect(markdown).toContain("# 凌晨两点的城市");
    expect(markdown).toContain("中文提示词");
    expect(markdown).toContain("English Prompt");
  });
});
