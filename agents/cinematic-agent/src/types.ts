export type { CinematicProject, CinematicState, StoryboardShot } from "@agent-zy/shared-types";

export interface CinematicGenerationInput {
  concept: string;
  style?: string;
  pace?: string;
  targetShotCount?: number;
}
