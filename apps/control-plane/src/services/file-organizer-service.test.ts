import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, rename, stat, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createFileOrganizerService } from "./file-organizer-service";

const createdDirs: string[] = [];

function createFixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-zy-file-organizer-"));
  createdDirs.push(dir);
  return dir;
}

async function createFile(path: string, modifiedAt: Date, content = "file") {
  writeFileSync(path, content);
  await utimes(path, modifiedAt, modifiedAt);
}

function overrideMetadata(metadata: Awaited<ReturnType<typeof stat>>, overrides: Partial<Awaited<ReturnType<typeof stat>>>) {
  return Object.assign(Object.create(Object.getPrototypeOf(metadata)), metadata, overrides);
}

afterEach(() => {
  createdDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("file organizer service", () => {
  it("recursively previews files by month using filename dates and skips symbolic links", async () => {
    const rootDir = createFixtureDir();
    const nestedDir = join(rootDir, "nested");
    await mkdir(nestedDir);
    await createFile(join(rootDir, "2025-01-02 invoice.pdf"), new Date(2024, 1, 1));
    await createFile(join(nestedDir, "IMG_20250203.jpg"), new Date(2024, 2, 1));

    try {
      await symlink(nestedDir, join(rootDir, "linked"), "junction");
    } catch {
      // Some platforms disallow symlink creation in test environments.
    }

    const result = await createFileOrganizerService().preview({
      directoryPath: rootDir,
      mode: "time",
      timeGranularity: "month"
    });

    expect(result.summary).toEqual({
      total: 2,
      move: 2,
      unchanged: 0,
      skipped: 0
    });
    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetFolderName: item.targetFolderName,
      timeSource: item.timeSource,
      status: item.status
    }))).toEqual([
      {
        sourceName: "2025-01-02 invoice.pdf",
        targetFolderName: "2025_01",
        timeSource: "filename",
        status: "move"
      },
      {
        sourceName: "IMG_20250203.jpg",
        targetFolderName: "2025_02",
        timeSource: "filename",
        status: "move"
      }
    ]);
  });

  it("falls back to birthtime, then mtime, then unknown time folder", async () => {
    const rootDir = createFixtureDir();
    const birthtimePath = join(rootDir, "birthtime.txt");
    const mtimePath = join(rootDir, "mtime.txt");
    const unknownPath = join(rootDir, "unknown.txt");
    await createFile(birthtimePath, new Date(2024, 0, 1));
    await createFile(mtimePath, new Date(2024, 0, 1));
    await createFile(unknownPath, new Date(2024, 0, 1));

    const service = createFileOrganizerService({
      statFile: async (path) => {
        const metadata = await stat(path);

        if (path === birthtimePath) {
          return overrideMetadata(metadata, {
            birthtime: new Date(2025, 3, 5),
            birthtimeMs: new Date(2025, 3, 5).getTime()
          });
        }

        if (path === mtimePath) {
          return overrideMetadata(metadata, {
            birthtime: new Date(0),
            birthtimeMs: 0,
            mtime: new Date(2025, 4, 6),
            mtimeMs: new Date(2025, 4, 6).getTime()
          });
        }

        if (path === unknownPath) {
          return overrideMetadata(metadata, {
            birthtime: new Date(Number.NaN),
            birthtimeMs: Number.NaN,
            mtime: new Date(Number.NaN),
            mtimeMs: metadata.mtimeMs
          });
        }

        return metadata;
      }
    });

    const result = await service.preview({
      directoryPath: rootDir,
      mode: "time",
      timeGranularity: "day"
    });

    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetFolderName: item.targetFolderName,
      timeSource: item.timeSource
    }))).toEqual([
      {
        sourceName: "birthtime.txt",
        targetFolderName: "2025_04_05",
        timeSource: "file-birthtime"
      },
      {
        sourceName: "mtime.txt",
        targetFolderName: "2025_05_06",
        timeSource: "file-mtime"
      },
      {
        sourceName: "unknown.txt",
        targetFolderName: "未识别时间",
        timeSource: "unknown"
      }
    ]);
  });

  it("previews files by broad type folders and marks occupied targets skipped", async () => {
    const rootDir = createFixtureDir();
    const docsDir = join(rootDir, "文档");
    mkdirSync(docsDir);
    await createFile(join(rootDir, "report.pdf"), new Date(2025, 0, 1), "source");
    await createFile(join(docsDir, "report.pdf"), new Date(2025, 0, 2), "occupied");
    await createFile(join(rootDir, "clip.MP4"), new Date(2025, 0, 3), "video");
    await createFile(join(rootDir, "no-extension"), new Date(2025, 0, 4), "other");

    const result = await createFileOrganizerService().preview({
      directoryPath: rootDir,
      mode: "type"
    });

    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetFolderName: item.targetFolderName,
      status: item.status,
      skipReason: item.skipReason
    }))).toEqual(expect.arrayContaining([
      {
        sourceName: "report.pdf",
        targetFolderName: "文档",
        status: "skipped",
        skipReason: "目标位置已存在同名文件"
      },
      {
        sourceName: "report.pdf",
        targetFolderName: "文档",
        status: "unchanged",
        skipReason: undefined
      },
      {
        sourceName: "clip.MP4",
        targetFolderName: "视频",
        status: "move",
        skipReason: undefined
      },
      {
        sourceName: "no-extension",
        targetFolderName: "其他",
        status: "move",
        skipReason: undefined
      }
    ]));
  });

  it("executes a preview once and undoes moved files without deleting created folders", async () => {
    const rootDir = createFixtureDir();
    const sourcePath = join(rootDir, "2025-01-02.txt");
    const targetDir = join(rootDir, "2025");
    const targetPath = join(targetDir, "2025-01-02.txt");
    await createFile(sourcePath, new Date(2025, 0, 2), "content");
    const service = createFileOrganizerService();

    const preview = await service.preview({
      directoryPath: rootDir,
      mode: "time",
      timeGranularity: "year"
    });
    const execution = await service.execute(preview.previewToken);

    expect(existsSync(sourcePath)).toBe(false);
    expect(readFileSync(targetPath, "utf8")).toBe("content");
    expect(execution.summary).toEqual({ moved: 1, failed: 0 });
    await expect(service.execute(preview.previewToken)).rejects.toThrow("preview token");

    const undo = await service.undo(execution.undoToken);

    expect(readFileSync(sourcePath, "utf8")).toBe("content");
    expect(existsSync(targetDir)).toBe(true);
    expect(undo.summary).toEqual({ restored: 1, failed: 0 });
    await expect(service.undo(execution.undoToken)).rejects.toThrow("undo token");
  });

  it("rejects execution when a target path becomes occupied after preview", async () => {
    const rootDir = createFixtureDir();
    const sourcePath = join(rootDir, "2025-01-02.txt");
    const targetDir = join(rootDir, "2025_01");
    const targetPath = join(targetDir, "2025-01-02.txt");
    await createFile(sourcePath, new Date(2025, 0, 2), "source");
    const moveFile = vi.fn(rename);
    const service = createFileOrganizerService({ moveFile });
    const preview = await service.preview({
      directoryPath: rootDir,
      mode: "time",
      timeGranularity: "month"
    });
    mkdirSync(targetDir);
    await createFile(targetPath, new Date(2025, 0, 3), "occupied");

    await expect(service.execute(preview.previewToken)).rejects.toThrow("target path is occupied");
    expect(moveFile).not.toHaveBeenCalled();
    expect(readFileSync(sourcePath, "utf8")).toBe("source");
    expect(readFileSync(targetPath, "utf8")).toBe("occupied");
  });

  it("rolls back moved files when a later move fails", async () => {
    const rootDir = createFixtureDir();
    const firstPath = join(rootDir, "2025-01-01.txt");
    const secondPath = join(rootDir, "2025-02-01.txt");
    await createFile(firstPath, new Date(2025, 0, 1), "first");
    await createFile(secondPath, new Date(2025, 1, 1), "second");
    let moveCalls = 0;
    const service = createFileOrganizerService({
      moveFile: async (source, target) => {
        moveCalls += 1;
        if (moveCalls === 4) {
          throw new Error("simulated move failure");
        }
        await rename(source, target);
      }
    });

    const preview = await service.preview({
      directoryPath: rootDir,
      mode: "time",
      timeGranularity: "month"
    });

    await expect(service.execute(preview.previewToken)).rejects.toThrow("simulated move failure");
    expect(readFileSync(firstPath, "utf8")).toBe("first");
    expect(readFileSync(secondPath, "utf8")).toBe("second");
  });

  it("rejects expired preview tokens", async () => {
    const rootDir = createFixtureDir();
    await createFile(join(rootDir, "2025-01-02.txt"), new Date(2025, 0, 2));
    let current = new Date(2026, 0, 1, 12, 0, 0);
    const service = createFileOrganizerService({
      now: () => current
    });
    const preview = await service.preview({
      directoryPath: rootDir,
      mode: "time",
      timeGranularity: "year"
    });
    current = new Date(2026, 0, 1, 12, 31, 0);

    await expect(service.execute(preview.previewToken)).rejects.toThrow("preview token");
  });
});
