import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type {
  FileOrganizerExecuteResult,
  FileOrganizerMode,
  FileOrganizerPreviewInput,
  FileOrganizerPreviewItem,
  FileOrganizerPreviewResult,
  FileOrganizerTimeGranularity,
  FileOrganizerTimeSource,
  FileOrganizerUndoResult
} from "@agent-zy/shared-types";

const TOKEN_TTL_MS = 30 * 60 * 1000;
const UNKNOWN_TIME_FOLDER = "未识别时间";

type FileMetadata = Awaited<ReturnType<typeof stat>>;

type MoveOperation = {
  sourcePath: string;
  targetPath: string;
  size: number;
  modifiedAtMs: number;
};

type PreviewRecord = {
  expiresAtMs: number;
  input: {
    mode: FileOrganizerMode;
    timeGranularity: FileOrganizerTimeGranularity | null;
  };
  operations: MoveOperation[];
};

type UndoRecord = {
  expiresAtMs: number;
  operations: MoveOperation[];
};

type Dependencies = {
  statFile?: (path: string) => Promise<FileMetadata>;
  moveFile?: (sourcePath: string, targetPath: string) => Promise<void>;
  makeDirectory?: (path: string) => Promise<unknown>;
  now?: () => Date;
  createToken?: () => string;
};

const TYPE_FOLDERS: Array<{ folderName: string; extensions: string[] }> = [
  { folderName: "图片", extensions: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".svg"] },
  { folderName: "视频", extensions: [".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".wmv", ".flv", ".mpeg", ".mpg"] },
  { folderName: "音频", extensions: [".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg", ".wma"] },
  { folderName: "文档", extensions: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".rtf", ".csv", ".pages", ".numbers", ".key"] },
  { folderName: "压缩包", extensions: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"] },
  { folderName: "应用安装包", extensions: [".exe", ".msi", ".dmg", ".pkg", ".apk", ".ipa", ".appimage", ".deb", ".rpm"] },
  { folderName: "代码", extensions: [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".cs", ".php", ".rb", ".html", ".css", ".json", ".yaml", ".yml", ".xml", ".sql", ".sh", ".ps1"] }
];

const TYPE_FOLDER_BY_EXTENSION = new Map(
  TYPE_FOLDERS.flatMap((group) => group.extensions.map((extension) => [extension, group.folderName]))
);

function invalidToken(kind: "preview" | "undo") {
  return new Error(`${kind} token is invalid or expired`);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isValidDate(date: Date | null | undefined) {
  return date instanceof Date && Number.isFinite(date.getTime()) && date.getTime() > 0;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatFolderName(date: Date, granularity: FileOrganizerTimeGranularity) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());

  if (granularity === "year") {
    return year;
  }

  if (granularity === "month") {
    return `${year}_${month}`;
  }

  return `${year}_${month}_${day}`;
}

function parseDateFromFileName(fileName: string) {
  const stem = basename(fileName, extname(fileName));
  const separated = /(?:^|[^0-9])((?:19|20)\d{2})[-_.年 ]?([01]\d)(?:[-_.月 ]?([0-3]\d))?(?:日)?(?:[^0-9]|$)/.exec(stem);

  if (separated) {
    const year = Number(separated[1]);
    const month = Number(separated[2]);
    const day = separated[3] ? Number(separated[3]) : 1;
    const date = new Date(year, month - 1, day);

    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date;
    }
  }

  const compact = /(?:^|[^0-9])((?:19|20)\d{2})([01]\d)([0-3]\d)?(?:[^0-9]|$)/.exec(stem);

  if (!compact) {
    return null;
  }

  const year = Number(compact[1]);
  const month = Number(compact[2]);
  const day = compact[3] ? Number(compact[3]) : 1;
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function resolveTimeFolder(fileName: string, metadata: FileMetadata, granularity: FileOrganizerTimeGranularity) {
  const filenameDate = parseDateFromFileName(fileName);

  if (filenameDate) {
    return {
      folderName: formatFolderName(filenameDate, granularity),
      timeSource: "filename" as FileOrganizerTimeSource
    };
  }

  if (isValidDate(metadata.birthtime)) {
    return {
      folderName: formatFolderName(metadata.birthtime, granularity),
      timeSource: "file-birthtime" as FileOrganizerTimeSource
    };
  }

  if (isValidDate(metadata.mtime)) {
    return {
      folderName: formatFolderName(metadata.mtime, granularity),
      timeSource: "file-mtime" as FileOrganizerTimeSource
    };
  }

  return {
    folderName: UNKNOWN_TIME_FOLDER,
    timeSource: "unknown" as FileOrganizerTimeSource
  };
}

function resolveTypeFolder(fileName: string) {
  const extension = extname(fileName).toLocaleLowerCase();
  return TYPE_FOLDER_BY_EXTENSION.get(extension) ?? "其他";
}

function createSummary(items: FileOrganizerPreviewItem[]) {
  return {
    total: items.length,
    move: items.filter((item) => item.status === "move").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    skipped: items.filter((item) => item.status === "skipped").length
  };
}

function normalizeInput(input: FileOrganizerPreviewInput) {
  const mode: FileOrganizerMode = input.mode === "type" ? "type" : "time";
  const timeGranularity: FileOrganizerTimeGranularity | null = mode === "time"
    ? input.timeGranularity === "day" || input.timeGranularity === "year" ? input.timeGranularity : "month"
    : null;

  return {
    mode,
    timeGranularity
  };
}

function toModifiedAtIso(metadata: FileMetadata) {
  const mtimeMs = Number(metadata.mtimeMs);
  const timestamp = Number.isFinite(mtimeMs) ? mtimeMs : metadata.mtime.getTime();
  return new Date(Number.isFinite(timestamp) ? timestamp : 0).toISOString();
}

function toFileSize(metadata: FileMetadata) {
  return Number(metadata.size);
}

export function createFileOrganizerService(dependencies: Dependencies = {}) {
  const statFile = dependencies.statFile ?? stat;
  const moveFile = dependencies.moveFile ?? rename;
  const makeDirectory = dependencies.makeDirectory ?? ((path: string) => mkdir(path, { recursive: true }));
  const now = dependencies.now ?? (() => new Date());
  const createToken = dependencies.createToken ?? randomUUID;
  const previews = new Map<string, PreviewRecord>();
  const undos = new Map<string, UndoRecord>();

  function takeToken<T extends { expiresAtMs: number }>(
    records: Map<string, T>,
    token: string,
    kind: "preview" | "undo"
  ) {
    const record = records.get(token);
    records.delete(token);

    if (!record || record.expiresAtMs <= now().getTime()) {
      throw invalidToken(kind);
    }

    return record;
  }

  async function listFiles(rootDir: string) {
    const files: string[] = [];

    async function visit(directoryPath: string) {
      const entries = await readdir(directoryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue;
        }

        const entryPath = join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          await visit(entryPath);
          continue;
        }

        if (entry.isFile()) {
          files.push(entryPath);
        }
      }
    }

    await visit(rootDir);
    return files.sort((first, second) => first.localeCompare(second));
  }

  async function validateOperations(operations: MoveOperation[], direction: "execute" | "undo") {
    for (const operation of operations) {
      const currentPath = direction === "execute" ? operation.sourcePath : operation.targetPath;
      const metadata = await statFile(currentPath);

      if (!metadata.isFile() || toFileSize(metadata) !== operation.size || Number(metadata.mtimeMs) !== operation.modifiedAtMs) {
        throw new Error(`file changed after preview: ${basename(currentPath)}`);
      }
    }

    const movingPaths = new Set(
      operations.map((operation) =>
        (direction === "execute" ? operation.sourcePath : operation.targetPath).toLocaleLowerCase()
      )
    );

    for (const operation of operations) {
      const targetPath = direction === "execute" ? operation.targetPath : operation.sourcePath;

      if (movingPaths.has(targetPath.toLocaleLowerCase())) {
        continue;
      }

      try {
        await statFile(targetPath);
        throw new Error(`target path is occupied: ${basename(targetPath)}`);
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
    }
  }

  async function moveBatch(operations: MoveOperation[], direction: "execute" | "undo") {
    const staged = operations.map((operation) => ({
      from: direction === "execute" ? operation.sourcePath : operation.targetPath,
      to: direction === "execute" ? operation.targetPath : operation.sourcePath,
      temp: join(dirname(direction === "execute" ? operation.sourcePath : operation.targetPath), `.agent-zy-file-organizer-${createToken()}.tmp`),
      location: "from" as "from" | "temp" | "to"
    }));

    try {
      for (const item of staged) {
        await moveFile(item.from, item.temp);
        item.location = "temp";
      }

      for (const item of staged) {
        await makeDirectory(dirname(item.to));
        await moveFile(item.temp, item.to);
        item.location = "to";
      }
    } catch (error) {
      for (const item of [...staged].reverse()) {
        if (item.location === "to") {
          try {
            await moveFile(item.to, item.temp);
            item.location = "temp";
          } catch {
            // Keep restoring the remaining files.
          }
        }
      }

      for (const item of [...staged].reverse()) {
        if (item.location === "temp") {
          try {
            await moveFile(item.temp, item.from);
            item.location = "from";
          } catch {
            // Preserve the original failure after best-effort rollback.
          }
        }
      }

      throw error;
    }
  }

  return {
    async preview(input: FileOrganizerPreviewInput): Promise<FileOrganizerPreviewResult> {
      const rootDir = resolve(input.directoryPath);
      const rootMetadata = await statFile(rootDir);

      if (!rootMetadata.isDirectory()) {
        throw new Error("directoryPath must point to a directory");
      }

      const normalized = normalizeInput(input);
      const files = await listFiles(rootDir);
      const occupiedPaths = new Set(files.map((filePath) => filePath.toLocaleLowerCase()));
      const items: FileOrganizerPreviewItem[] = [];

      for (const sourcePath of files) {
        const metadata = await statFile(sourcePath);

        if (!metadata.isFile()) {
          continue;
        }

        const sourceName = basename(sourcePath);
        const folder = normalized.mode === "time" && normalized.timeGranularity
          ? resolveTimeFolder(sourceName, metadata, normalized.timeGranularity)
          : {
              folderName: resolveTypeFolder(sourceName),
              timeSource: undefined
            };
        const targetPath = join(rootDir, folder.folderName, sourceName);
        const targetName = sourceName;
        const sourcePathKey = sourcePath.toLocaleLowerCase();
        const targetPathKey = targetPath.toLocaleLowerCase();
        const status = sourcePathKey === targetPathKey
          ? "unchanged"
          : occupiedPaths.has(targetPathKey)
            ? "skipped"
            : "move";

        if (status === "move") {
          occupiedPaths.add(targetPathKey);
        }

        items.push({
          sourcePath,
          sourceName,
          targetPath,
          targetName,
          targetFolderName: folder.folderName,
          status,
          timeSource: folder.timeSource,
          size: toFileSize(metadata),
          modifiedAt: toModifiedAtIso(metadata),
          skipReason: status === "skipped" ? "目标位置已存在同名文件" : undefined
        });
      }

      const createdAt = now();
      const expiresAtMs = createdAt.getTime() + TOKEN_TTL_MS;
      const previewToken = createToken();
      previews.set(previewToken, {
        expiresAtMs,
        input: normalized,
        operations: items
          .filter((item) => item.status === "move")
          .map((item) => ({
            sourcePath: item.sourcePath,
            targetPath: item.targetPath,
            size: item.size,
            modifiedAtMs: new Date(item.modifiedAt).getTime()
          }))
      });

      return {
        previewToken,
        directoryPath: rootDir,
        mode: normalized.mode,
        timeGranularity: normalized.timeGranularity,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        summary: createSummary(items),
        items
      };
    },

    async execute(previewToken: string): Promise<FileOrganizerExecuteResult> {
      const preview = takeToken(previews, previewToken, "preview");
      await validateOperations(preview.operations, "execute");
      await moveBatch(preview.operations, "execute");
      const undoToken = createToken();
      undos.set(undoToken, {
        expiresAtMs: now().getTime() + TOKEN_TTL_MS,
        operations: preview.operations
      });

      return {
        undoToken,
        summary: {
          moved: preview.operations.length,
          failed: 0
        },
        items: preview.operations.map((operation) => ({
          sourcePath: operation.sourcePath,
          targetPath: operation.targetPath,
          status: "moved"
        }))
      };
    },

    async undo(undoToken: string): Promise<FileOrganizerUndoResult> {
      const undo = takeToken(undos, undoToken, "undo");
      await validateOperations(undo.operations, "undo");
      await moveBatch(undo.operations, "undo");

      return {
        summary: {
          restored: undo.operations.length,
          failed: 0
        },
        items: undo.operations.map((operation) => ({
          sourcePath: operation.sourcePath,
          targetPath: operation.targetPath,
          status: "restored"
        }))
      };
    }
  };
}
