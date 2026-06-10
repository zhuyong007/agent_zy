import { describe, expect, it } from "vitest";

import {
  IMAGE_TO_VIDEO_SYSTEM_PROMPT,
  buildFinalPromptRequest,
  buildImageAnalysisRequest,
  buildJsonRepairRequest,
  buildKeyframePlanRequest,
  buildKeyframeReviewRequest,
  buildVideoPlanRequest
} from "./prompts";

describe("image-to-video planner prompts", () => {
  it("keeps each stage explicit and requires strict Chinese JSON", () => {
    expect(IMAGE_TO_VIDEO_SYSTEM_PROMPT).toContain("严格 JSON");
    expect(buildImageAnalysisRequest("asset-1")).toContain('"roleSuggestion"');
    expect(buildVideoPlanRequest({ subjectDescription: "人物" } as any)).toContain('"recommendedKeyframes"');
    expect(buildKeyframePlanRequest({} as any, { videoDuration: 8 } as any)).toContain('"generationPrompt"');
    expect(buildKeyframeReviewRequest({} as any, {} as any, {} as any)).toContain('"improvementAdvice"');
    expect(buildFinalPromptRequest({} as any, {} as any, [])).toContain('"promptText"');
    expect(buildJsonRepairRequest("bad", "issue")).toContain("修复");
  });
});
