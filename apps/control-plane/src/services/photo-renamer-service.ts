import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readdir, rename, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type {
  PhotoRenameExecuteResult,
  PhotoRenameMediaScope,
  PhotoRenamePreviewItem,
  PhotoRenamePreviewResult,
  PhotoRenameUndoResult
} from "@agent-zy/shared-types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);
const SUPPORTED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
const TOKEN_TTL_MS = 30 * 60 * 1000;

type RenameOperation = {
  sourcePath: string;
  targetPath: string;
  size: number;
  modifiedAtMs: number;
};

type PreviewRecord = {
  expiresAtMs: number;
  operations: RenameOperation[];
};

type UndoRecord = {
  expiresAtMs: number;
  operations: RenameOperation[];
};

type Dependencies = {
  readExifDate?: (filePath: string) => Promise<Date | null>;
  readVideoDate?: (filePath: string) => Promise<Date | null>;
  renameFile?: (sourcePath: string, targetPath: string) => Promise<void>;
  now?: () => Date;
  createToken?: () => string;
};

async function readDefaultExifDate(filePath: string): Promise<Date | null> {
  try {
    const moduleName = "exifr";
    const exifr = await import(moduleName);
    const metadata = await exifr.parse(filePath, ["DateTimeOriginal", "CreateDate"]);
    const value = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  } catch {
    return null;
  }
}

async function readDefaultVideoDate(filePath: string): Promise<Date | null> {
  return new Promise((resolveDate) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_entries",
        "format_tags=creation_time:stream_tags=creation_time",
        filePath
      ],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolveDate(null);
          return;
        }

        try {
          const metadata = JSON.parse(stdout) as {
            format?: { tags?: { creation_time?: string } };
            streams?: Array<{ tags?: { creation_time?: string } }>;
          };
          const value = metadata.format?.tags?.creation_time
            ?? metadata.streams?.find((stream) => stream.tags?.creation_time)?.tags?.creation_time;
          const date = value ? new Date(value) : null;
          resolveDate(date && !Number.isNaN(date.getTime()) ? date : null);
        } catch {
          resolveDate(null);
        }
      }
    );
  });
}

function formatPhotoStem(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}_${minutes}_${seconds}`;
}

function normalizedStem(fileName: string) {
  return basename(fileName, extname(fileName)).toLocaleLowerCase();
}

async function listDirectoryEntries(rootDir: string, mediaScope: PhotoRenameMediaScope) {
  const files: string[] = [];
  const occupiedStemsByDirectory = new Map<string, Set<string>>();

  async function visit(directoryPath: string) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const occupiedStems = new Set(entries.map((entry) => normalizedStem(entry.name)));
    occupiedStemsByDirectory.set(directoryPath, occupiedStems);

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const entryPath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      const extension = extname(entry.name).toLocaleLowerCase();
      const matchesScope = mediaScope === "all"
        || mediaScope === "images" && IMAGE_EXTENSIONS.has(extension)
        || mediaScope === "videos" && VIDEO_EXTENSIONS.has(extension);

      if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extension) && matchesScope) {
        files.push(entryPath);
      }
    }
  }

  await visit(rootDir);
  return {
    files: files.sort((first, second) => first.localeCompare(second)),
    occupiedStemsByDirectory
  };
}

function createSummary(items: PhotoRenamePreviewItem[]) {
  return {
    total: items.length,
    rename: items.filter((item) => item.status === "rename").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    skipped: items.filter((item) => item.status === "skipped").length
  };
}

function invalidToken(kind: "preview" | "undo") {
  return new Error(`${kind} token is invalid or expired`);
}

function isMissingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createPhotoRenamerService(dependencies: Dependencies = {}) {
  const readExifDate = dependencies.readExifDate ?? readDefaultExifDate;
  const readVideoDate = dependencies.readVideoDate ?? readDefaultVideoDate;
  const renameFile = dependencies.renameFile ?? rename;
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

  async function validateOperations(operations: RenameOperation[], direction: "execute" | "undo") {
    for (const operation of operations) {
      const path = direction === "execute" ? operation.sourcePath : operation.targetPath;
      const metadata = await stat(path);

      if (!metadata.isFile() || metadata.size !== operation.size || metadata.mtimeMs !== operation.modifiedAtMs) {
        throw new Error(`photo changed after preview: ${basename(path)}`);
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
        await stat(targetPath);
        throw new Error(`target path is occupied: ${basename(targetPath)}`);
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
    }
  }

  async function renameBatch(operations: RenameOperation[], direction: "execute" | "undo") {
    const staged = operations.map((operation) => ({
      from: direction === "execute" ? operation.sourcePath : operation.targetPath,
      to: direction === "execute" ? operation.targetPath : operation.sourcePath,
      temp: join(dirname(operation.sourcePath), `.agent-zy-photo-renamer-${createToken()}.tmp`),
      location: "from" as "from" | "temp" | "to"
    }));

    try {
      for (const item of staged) {
        await renameFile(item.from, item.temp);
        item.location = "temp";
      }

      for (const item of staged) {
        await renameFile(item.temp, item.to);
        item.location = "to";
      }
    } catch (error) {
      for (const item of [...staged].reverse()) {
        if (item.location === "to") {
          try {
            await renameFile(item.to, item.temp);
            item.location = "temp";
          } catch {
            // Keep trying to restore the remaining files.
          }
        }
      }

      for (const item of [...staged].reverse()) {
        if (item.location === "temp") {
          try {
            await renameFile(item.temp, item.from);
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
    async preview(directoryPath: string, mediaScope: PhotoRenameMediaScope = "all"): Promise<PhotoRenamePreviewResult> {
      const rootDir = resolve(directoryPath);
      const rootMetadata = await stat(rootDir);

      if (!rootMetadata.isDirectory()) {
        throw new Error("directoryPath must point to a directory");
      }

      const { files, occupiedStemsByDirectory } = await listDirectoryEntries(rootDir, mediaScope);
      const items: PhotoRenamePreviewItem[] = [];

      for (const sourcePath of files) {
        const metadata = await stat(sourcePath);
        const extension = extname(sourcePath).toLocaleLowerCase();
        const embeddedDate = IMAGE_EXTENSIONS.has(extension)
          ? await readExifDate(sourcePath)
          : await readVideoDate(sourcePath);
        const captureDate = embeddedDate ?? metadata.mtime;
        const timeSource = embeddedDate
          ? IMAGE_EXTENSIONS.has(extension) ? "exif" : "video-metadata"
          : "file-mtime";
        const directory = dirname(sourcePath);
        const occupiedStems = occupiedStemsByDirectory.get(directory) ?? new Set<string>();
        const preferredStem = formatPhotoStem(captureDate);
        const sourceName = basename(sourcePath);
        const sourceStem = normalizedStem(sourceName);
        let targetStem = preferredStem;
        let suffix = 2;

        while (occupiedStems.has(targetStem.toLocaleLowerCase()) && targetStem.toLocaleLowerCase() !== sourceStem) {
          targetStem = `${preferredStem}_${String(suffix).padStart(2, "0")}`;
          suffix += 1;
        }

        occupiedStems.add(targetStem.toLocaleLowerCase());
        const originalExtension = extname(sourceName);
        const targetName = `${targetStem}${originalExtension}`;

        items.push({
          sourcePath,
          sourceName,
          targetPath: join(directory, targetName),
          targetName,
          status: sourceName === targetName ? "unchanged" : "rename",
          timeSource,
          capturedAt: captureDate.toISOString(),
          size: metadata.size,
          modifiedAt: metadata.mtime.toISOString()
        });
      }

      const createdAt = now();
      const expiresAtMs = createdAt.getTime() + TOKEN_TTL_MS;
      const previewToken = createToken();
      previews.set(previewToken, {
        expiresAtMs,
        operations: items
          .filter((item) => item.status === "rename")
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
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        summary: createSummary(items),
        items
      };
    },

    async execute(previewToken: string): Promise<PhotoRenameExecuteResult> {
      const preview = takeToken(previews, previewToken, "preview");
      await validateOperations(preview.operations, "execute");
      await renameBatch(preview.operations, "execute");
      const undoToken = createToken();
      undos.set(undoToken, {
        expiresAtMs: now().getTime() + TOKEN_TTL_MS,
        operations: preview.operations
      });

      return {
        undoToken,
        summary: {
          renamed: preview.operations.length,
          failed: 0
        },
        items: preview.operations.map((operation) => ({
          sourcePath: operation.sourcePath,
          targetPath: operation.targetPath,
          status: "renamed"
        }))
      };
    },

    async undo(undoToken: string): Promise<PhotoRenameUndoResult> {
      const undo = takeToken(undos, undoToken, "undo");
      await validateOperations(undo.operations, "undo");
      await renameBatch(undo.operations, "undo");

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
