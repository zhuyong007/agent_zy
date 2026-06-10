// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props, children)
}));

vi.mock("../api", () => ({
  fetchImageToVideoProjects: vi.fn(async () => ({ projects: [], recentProjectIds: [] })),
  analyzeImageToVideo: vi.fn(),
  generateImageToVideoPlan: vi.fn(),
  generateImageToVideoKeyframes: vi.fn(),
  reviewImageToVideoKeyframe: vi.fn(),
  overrideImageToVideoKeyframe: vi.fn(),
  generateImageToVideoFinalPrompt: vi.fn(),
  deleteImageToVideoProject: vi.fn()
}));

import { analyzeImageToVideo, deleteImageToVideoProject, fetchImageToVideoProjects } from "../api";
import { ImageToVideoPage } from "./image-to-video-page";

const project = {
  id: "project-1",
  title: "测试策划",
  stage: "IMAGE_ANALYZED",
  activeOperation: null,
  lastError: null,
  originalImageAssetId: null,
  assets: [],
  imageAnalysis: {
    imageId: "image-1",
    suitableForVideo: true,
    unsuitableReason: null,
    roleSuggestion: "首帧",
    subjectDescription: "人物",
    sceneDescription: "室内",
    composition: "中景",
    lighting: "侧光",
    mood: "平静",
    style: "写实",
    motionPotential: "适合轻微运动",
    risks: []
  },
  videoPlan: null,
  keyframes: [],
  finalPrompt: null,
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:00.000Z"
} as any;

describe("ImageToVideoPage", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.mocked(fetchImageToVideoProjects).mockResolvedValue({ projects: [], recentProjectIds: [] });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderPage(initialProjects?: { projects: any[]; recentProjectIds: string[] }) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const client = new QueryClient();
    if (initialProjects) client.setQueryData(["image-to-video-projects"], initialProjects);
    await act(async () => {
      root?.render(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(ImageToVideoPage)
        )
      );
    });
    return container;
  }

  it("renders the staged planner workflow instead of a single prompt form", async () => {
    const container = await renderPage();

    expect(container.textContent).toContain("图片转视频策划");
    expect(container.textContent).toContain("图片分析");
    expect(container.textContent).toContain("视频设计");
    expect(container.textContent).toContain("关键帧");
    expect(container.textContent).toContain("素材审核");
    expect(container.textContent).toContain("最终提示词");
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector(".itv-projects")).not.toBeNull();
    expect(container.querySelector(".itv-workspace")).not.toBeNull();
    expect(container.querySelector(".itv-context")).not.toBeNull();
  });

  it("uses an in-app confirmation dialog instead of window.confirm", async () => {
    vi.mocked(fetchImageToVideoProjects).mockResolvedValue({ projects: [project], recentProjectIds: [project.id] });
    const nativeConfirm = vi.spyOn(window, "confirm");
    const container = await renderPage({ projects: [project], recentProjectIds: [project.id] });

    await act(async () => {
      (container.querySelector(".itv-danger") as HTMLButtonElement).click();
    });

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("删除这个策划项目");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      (container.querySelector(".itv-danger") as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector(".itv-confirm-dialog__danger") as HTMLButtonElement).click();
    });
    expect(vi.mocked(deleteImageToVideoProject).mock.calls[0]?.[0]).toBe(project.id);
  });

  it("shows a page loading overlay while uploading and analyzing an image", async () => {
    vi.mocked(analyzeImageToVideo).mockImplementation(() => new Promise(() => undefined));
    const container = await renderPage();
    const input = container.querySelector(".itv-new-project input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["image"], "frame.png", { type: "image/png" })] });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("正在上传并分析首图");
  });
});
