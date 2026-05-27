export type { CinematicProject, CinematicState, StoryboardShot } from "@agent-zy/shared-types";

export interface CinematicGenerationInput {
  concept: string;
  style?: string;
  visualStyle?: string;
  pace?: string;
  targetShotCount?: number;
  visualFocus?: string;
  negativePrompt?: string;
}
