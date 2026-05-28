// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ClassicShotProject, ClassicShotState } from "@agent-zy/shared-types";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

const project: ClassicShotProject = {
  id: "classic-shot-1",
  rawInput: "王家卫 花样年华 走廊擦肩镜头",
  title: "走廊擦肩的压抑长镜头",
  source: {
    director: "王家卫",
    film: "花样年华",
    year: 2000,
    shotName: "走廊擦肩镜头",
    shotPosition: "影片前中段"
  },
  coreValue: "经典在于用狭窄走廊和慢速横移，把关系压缩成一次擦肩。",
  analysis: {
    cameraMovement: "缓慢横移跟拍。",
    lighting: "钨丝灯暖黄和高反差阴影。",
    emotionCurve: "平静、压抑、靠近、错开、余韵。"
  },
  minimumStoryboardCount: 1,
  storyboard: [
    {
      id: "shot-1",
      title: "走廊擦肩",
      function: "建立空间与克制关系。",
      prompt: "昏暗走廊里的连续镜头感提示词，摄影机缓慢横移，人物擦肩而过。",
      movementKeywords: ["slow tracking shot", "long take"],
      visualKeywords: ["film grain", "warm tungsten light"]
    }
  ],
  continuity: {
    actionContinuity: "人物从走廊两端进入并擦肩离开。",
    cameraContinuity: "摄影机保持同一方向横移。",
    lightingContinuity: "顶部暖光保持一致。",
    colorContinuity: "暗红、墨绿和旧黄色统一。",
    antiJumpGuidance: "避免换脸、换景和跳切。"
  },
  markdown: "一、镜头出处\n\n导演：王家卫\n电影：花样年华\n\n五、镜头衔接设计（必须有）",
  targetPlatform: "generic",
  createdAt: "2026-05-25T08:00:00.000Z",
  updatedAt: "2026-05-25T08:00:00.000Z"
};

const classicShotState: ClassicShotState = {
  projects: [project],
  recentProjectIds: [project.id],
  lastGeneratedAt: project.updatedAt,
  status: "idle",
  lastError: null
};

const apiMocks = vi.hoisted(() => ({
  generateClassicShotFromVideo: vi.fn()
}));

vi.mock("../api", () => ({
  fetchClassicShots: vi.fn(async () => classicShotState),
  fetchDashboard: vi.fn(async () => ({
    homeLayout: [],
    classicShots: {
      ...classicShotState,
      dashboard: {
        projectCount: 1,
        recentProjects: [project],
        latestProject: project,
        lastGeneratedAt: project.updatedAt,
        totalStoryboardCount: 1,
        todayReference: "王家卫《花样年华》"
      }
    }
  })),
  fetchHomeLayout: vi.fn(async () => []),
  saveHomeLayout: vi.fn(async (layout) => layout),
  generateClassicShot: vi.fn(async () => classicShotState),
  generateClassicShotFromVideo: apiMocks.generateClassicShotFromVideo,
  openDashboardStream: vi.fn(() => () => undefined),
  restartProject: vi.fn(async () => ({ ok: true }))
}));

import { ClassicShotPage } from "./classic-shot-page";

describe("ClassicShotPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    apiMocks.generateClassicShotFromVideo.mockReset();
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("renders the classic shot recreation workspace", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["classic-shots"], classicShotState);
    queryClient.setQueryData(["home-layout"], []);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(ClassicShotPage)
        )
      );
    });

    expect(container.textContent).toContain("经典镜头复刻");
    expect(container.textContent).toContain("王家卫");
    expect(container.textContent).toContain("花样年华");
    expect(container.textContent).toContain("一、镜头出处");
    expect(container.textContent).toContain("五、镜头衔接设计");
    expect(container.textContent).toContain("复制完整 Markdown");
    expect(container.textContent).toContain("复制分镜提示词");
  });

  it("uploads a video with revision instructions through FormData", async () => {
    apiMocks.generateClassicShotFromVideo.mockResolvedValue(classicShotState);
    const queryClient = new QueryClient();
    queryClient.setQueryData(["classic-shots"], classicShotState);
    queryClient.setQueryData(["home-layout"], []);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(ClassicShotPage)
        )
      );
    });

    expect(container.textContent).toContain("上传视频复刻");
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='classic-shot-video-tab']")?.click();
    });

    const file = new File(["fake-video"], "reference.mp4", { type: "video/mp4" });
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file]
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const revisionInput = container.querySelector<HTMLTextAreaElement>("[name='revisionInstruction']");
    expect(revisionInput).not.toBeNull();
    await act(async () => {
      revisionInput!.value = "切换到雨夜赛博朋克市场";
      revisionInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("[data-testid='classic-shot-video-form']")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(apiMocks.generateClassicShotFromVideo).toHaveBeenCalledTimes(1);
    const formData = apiMocks.generateClassicShotFromVideo.mock.calls[0]?.[0] as FormData;
    expect(formData.get("video")).toBe(file);
    expect(formData.get("revisionInstruction")).toBe("切换到雨夜赛博朋克市场");
    expect(formData.get("frameCount")).toBe("6");
  });
});
