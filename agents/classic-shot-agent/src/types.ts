import type { ClassicShotTargetPlatform } from "@agent-zy/shared-types";

export type { ClassicShotProject, ClassicShotState, ClassicShotStoryboard, ClassicShotTargetPlatform } from "@agent-zy/shared-types";

export interface ClassicShotVideoFrameInput {
  index: number;
  timestampSeconds: number;
  dataUrl: string;
}

export interface ClassicShotGenerationInput {
  input: string;
  targetPlatform?: ClassicShotTargetPlatform;
  action?: "generate" | "generateFromVideoFrames";
  revisionInstruction?: string;
  videoReference?: {
    fileName: string;
    durationSeconds: number;
    extractedFrameCount: number;
  };
  frames?: ClassicShotVideoFrameInput[];
}
