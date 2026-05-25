import type { ClassicShotTargetPlatform } from "@agent-zy/shared-types";

export type { ClassicShotProject, ClassicShotState, ClassicShotStoryboard, ClassicShotTargetPlatform } from "@agent-zy/shared-types";

export interface ClassicShotGenerationInput {
  input: string;
  targetPlatform?: ClassicShotTargetPlatform;
}
