import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  GameCreatorDraft,
  GameCreatorState,
  GameCreatorWorkflowStageId
} from "@agent-zy/shared-types";

const STAGES = new Set<GameCreatorWorkflowStageId>([
  "brief",
  "script",
  "capture",
  "edit",
  "package",
  "review",
  "publish"
]);

const DRAFT_KEYS = [
  "game",
  "audience",
  "format",
  "promise",
  "angle",
  "title",
  "coverCopy",
  "opening",
  "outline",
  "assetNotes",
  "editNotes",
  "tags",
  "publishedUrl",
  "retrospective"
] as const satisfies readonly (keyof GameCreatorDraft)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function parseGameCreatorState(value: unknown): GameCreatorState {
  if (!isRecord(value) || !isRecord(value.draft)) {
    throw new Error("游戏创作数据不是有效对象");
  }
  const draft = value.draft;

  const valid =
    value.version === 1 &&
    typeof value.date === "string" &&
    typeof value.projectId === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.activeStage === "string" &&
    STAGES.has(value.activeStage as GameCreatorWorkflowStageId) &&
    isStringArray(value.completedTaskIds) &&
    isStringArray(value.checkedQualityIds) &&
    typeof value.ready === "boolean" &&
    typeof value.completedVideos === "number" &&
    Number.isInteger(value.completedVideos) &&
    value.completedVideos >= 0 &&
    DRAFT_KEYS.every((key) => typeof draft[key] === "string");

  if (!valid || Number.isNaN(Date.parse(value.updatedAt as string))) {
    throw new Error("游戏创作数据格式无效");
  }

  return structuredClone(value) as unknown as GameCreatorState;
}

export interface GameCreatorRepository {
  read(): GameCreatorState | null;
  write(state: unknown): GameCreatorState;
  clear(): void;
}

export function createGameCreatorRepository(dataDir: string): GameCreatorRepository {
  const path = join(dataDir, "game-creator", "state.json");

  return {
    read() {
      if (!existsSync(path)) return null;
      return parseGameCreatorState(JSON.parse(readFileSync(path, "utf8")) as unknown);
    },
    write(input) {
      const state = parseGameCreatorState(input);
      mkdirSync(dirname(path), { recursive: true });
      const tempPath = `${path}.${process.pid}.tmp`;
      writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      renameSync(tempPath, path);
      return structuredClone(state);
    },
    clear() {
      rmSync(path, { force: true });
    }
  };
}
