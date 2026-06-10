// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { ImageToVideoPage } from "./image-to-video-page";

describe("ImageToVideoPage", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  it("renders the staged planner workflow instead of a single prompt form", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          React.createElement(ImageToVideoPage)
        )
      );
    });

    expect(container.textContent).toContain("图片转视频策划");
    expect(container.textContent).toContain("图片分析");
    expect(container.textContent).toContain("视频设计");
    expect(container.textContent).toContain("关键帧");
    expect(container.textContent).toContain("素材审核");
    expect(container.textContent).toContain("最终提示词");
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });
});
