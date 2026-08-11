import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  GameCreatorBranchKind,
  GameCreatorBranchStatus,
  GameCreatorManuscriptKind,
  GameCreatorProjectPhase,
  GameCreatorState,
  GameCreatorViewId
} from "@agent-zy/shared-types";

const VIEWS = new Set<GameCreatorViewId>(["capture", "library", "manuscript"]);
const PHASES = new Set<GameCreatorProjectPhase>(["playing", "organizing", "published"]);
const BRANCH_KINDS = new Set<GameCreatorBranchKind>([
  "story",
  "character",
  "world",
  "mechanic",
  "idea",
  "research"
]);
const BRANCH_STATUSES = new Set<GameCreatorBranchStatus>(["seed", "expanded", "used"]);
const MANUSCRIPT_KINDS = new Set<GameCreatorManuscriptKind>(["main", "fragment"]);
const LEGACY_DRAFT_KEYS = [
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
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRevisionMessage(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    (value.revisedText === undefined || typeof value.revisedText === "string") &&
    isTimestamp(value.createdAt)
  );
}

function isManuscript(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    MANUSCRIPT_KINDS.has(value.kind as GameCreatorManuscriptKind) &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    isStringArray(value.sourceNoteIds) &&
    Array.isArray(value.revisionMessages) &&
    value.revisionMessages.every(isRevisionMessage) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isBranchNote(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    BRANCH_KINDS.has(value.kind as GameCreatorBranchKind) &&
    typeof value.status === "string" &&
    BRANCH_STATUSES.has(value.status as GameCreatorBranchStatus) &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.gameProgress === "string" &&
    isStringArray(value.tags) &&
    typeof value.source === "string" &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isProject(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.game === "string" &&
    typeof value.phase === "string" &&
    PHASES.has(value.phase as GameCreatorProjectPhase) &&
    typeof value.progress === "string" &&
    typeof value.creativeQuestion === "string" &&
    Array.isArray(value.branchNotes) &&
    value.branchNotes.every(isBranchNote) &&
    Array.isArray(value.manuscripts) &&
    value.manuscripts.every(isManuscript) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function parseVersionTwo(value: Record<string, unknown>): GameCreatorState | null {
  const valid =
    value.version === 2 &&
    typeof value.date === "string" &&
    isTimestamp(value.updatedAt) &&
    typeof value.activeProjectId === "string" &&
    typeof value.activeView === "string" &&
    VIEWS.has(value.activeView as GameCreatorViewId) &&
    isOptionalString(value.selectedNoteId) &&
    isOptionalString(value.selectedManuscriptId) &&
    Array.isArray(value.projects) &&
    value.projects.length > 0 &&
    value.projects.every(isProject) &&
    value.projects.some((project) => isRecord(project) && project.id === value.activeProjectId);

  return valid ? structuredClone(value) as unknown as GameCreatorState : null;
}

function migrateLegacyState(value: Record<string, unknown>): GameCreatorState | null {
  const draftValue = value.draft;
  if (
    value.version !== 1 ||
    typeof value.date !== "string" ||
    typeof value.projectId !== "string" ||
    !isTimestamp(value.updatedAt) ||
    !isRecord(draftValue) ||
    !LEGACY_DRAFT_KEYS.every((key) => typeof draftValue[key] === "string")
  ) {
    return null;
  }

  const draft = draftValue as Record<(typeof LEGACY_DRAFT_KEYS)[number], string>;
  const timestamp = value.updatedAt;
  const mainId = `${value.projectId}-main`;
  const branchNotes = [
    draft.assetNotes.trim()
      ? {
          id: `${value.projectId}-legacy-assets`,
          kind: "research" as const,
          status: "expanded" as const,
          title: "旧版素材与证据",
          body: draft.assetNotes,
          gameProgress: "",
          tags: draft.tags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
          source: "从旧版游戏创作台迁移",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      : null,
    draft.retrospective.trim()
      ? {
          id: `${value.projectId}-legacy-review`,
          kind: "idea" as const,
          status: "expanded" as const,
          title: "旧版复盘",
          body: draft.retrospective,
          gameProgress: "已发布",
          tags: [],
          source: draft.publishedUrl,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      : null
  ].filter((item) => item !== null);
  const legacyContent = [draft.opening, draft.outline, draft.editNotes]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n\n");

  return {
    version: 2,
    date: value.date,
    updatedAt: timestamp,
    activeProjectId: value.projectId,
    activeView: legacyContent ? "manuscript" : "capture",
    selectedNoteId: branchNotes[0]?.id ?? null,
    selectedManuscriptId: mainId,
    projects: [
      {
        id: value.projectId,
        game: draft.game,
        phase: draft.publishedUrl.trim() ? "published" : "playing",
        progress: "",
        creativeQuestion: draft.promise || draft.audience,
        branchNotes,
        manuscripts: [
          {
            id: mainId,
            kind: "main",
            title: draft.title || `${draft.game || "未命名游戏"}总稿`,
            content: legacyContent,
            sourceNoteIds: branchNotes.map((item) => item.id),
            revisionMessages: [],
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]
  };
}

export function parseGameCreatorState(value: unknown): GameCreatorState {
  if (!isRecord(value)) {
    throw new Error("游戏创作数据不是有效对象");
  }

  const state = parseVersionTwo(value) ?? migrateLegacyState(value);
  if (!state) {
    throw new Error("游戏创作数据格式无效");
  }

  return state;
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
