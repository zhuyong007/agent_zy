import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, rename, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPhotoRenamerService } from "./photo-renamer-service";

const createdDirs: string[] = [];

function createFixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-zy-photo-renamer-"));
  createdDirs.push(dir);
  return dir;
}

async function createPhoto(path: string, modifiedAt: Date) {
  writeFileSync(path, "photo");
  await utimes(path, modifiedAt, modifiedAt);
}

afterEach(() => {
  createdDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("photo renamer service", () => {
  it("recursively previews supported photos and falls back to file modification time", async () => {
    const rootDir = createFixtureDir();
    const nestedDir = join(rootDir, "nested");
    await mkdir(nestedDir);
    await createPhoto(join(rootDir, "cover.jpg"), new Date(2026, 0, 1, 12, 23, 24));
    await createPhoto(join(nestedDir, "inside.PNG"), new Date(2026, 1, 2, 3, 4, 5));
    writeFileSync(join(rootDir, "notes.txt"), "ignore");

    const result = await createPhotoRenamerService().preview(rootDir);

    expect(result.summary).toEqual({
      total: 2,
      rename: 2,
      unchanged: 0,
      skipped: 0
    });
    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetName: item.targetName,
      timeSource: item.timeSource
    }))).toEqual([
      {
        sourceName: "cover.jpg",
        targetName: "20260101_12_23_24.jpg",
        timeSource: "file-mtime"
      },
      {
        sourceName: "inside.PNG",
        targetName: "20260202_03_04_05.PNG",
        timeSource: "file-mtime"
      }
    ]);
  });

  it("prefers injected EXIF capture time and assigns stable duplicate suffixes", async () => {
    const rootDir = createFixtureDir();
    const firstPath = join(rootDir, "a.jpg");
    const secondPath = join(rootDir, "b.jpeg");
    await createPhoto(firstPath, new Date(2026, 3, 4, 1, 1, 1));
    await createPhoto(secondPath, new Date(2026, 3, 4, 1, 1, 2));
    const capturedAt = new Date(2026, 0, 1, 12, 23, 24);
    const service = createPhotoRenamerService({
      readExifDate: async () => capturedAt
    });

    const result = await service.preview(rootDir);

    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetName: item.targetName,
      timeSource: item.timeSource
    }))).toEqual([
      {
        sourceName: "a.jpg",
        targetName: "20260101_12_23_24.jpg",
        timeSource: "exif"
      },
      {
        sourceName: "b.jpeg",
        targetName: "20260101_12_23_24_02.jpeg",
        timeSource: "exif"
      }
    ]);
  });

  it("previews videos using metadata capture time and falls back to file modification time", async () => {
    const rootDir = createFixtureDir();
    const metadataVideoPath = join(rootDir, "clip.mp4");
    const fallbackVideoPath = join(rootDir, "fallback.MOV");
    await createPhoto(metadataVideoPath, new Date(2026, 2, 3, 4, 5, 6));
    await createPhoto(fallbackVideoPath, new Date(2026, 3, 4, 5, 6, 7));
    const videoCapturedAt = new Date(2026, 0, 1, 12, 23, 24);
    const readExifDate = vi.fn(async () => null);
    const dependencies = {
      readExifDate,
      readVideoDate: async (filePath: string) => filePath === metadataVideoPath ? videoCapturedAt : null
    };

    const result = await createPhotoRenamerService(dependencies).preview(rootDir);

    expect(readExifDate).not.toHaveBeenCalled();
    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetName: item.targetName,
      timeSource: item.timeSource
    }))).toEqual([
      {
        sourceName: "clip.mp4",
        targetName: "20260101_12_23_24.mp4",
        timeSource: "video-metadata"
      },
      {
        sourceName: "fallback.MOV",
        targetName: "20260404_05_06_07.MOV",
        timeSource: "file-mtime"
      }
    ]);
  });

  it("filters previews by image, video, or combined media scope", async () => {
    const rootDir = createFixtureDir();
    await createPhoto(join(rootDir, "photo.jpg"), new Date(2026, 0, 1, 12, 23, 24));
    await createPhoto(join(rootDir, "clip.mp4"), new Date(2026, 0, 2, 12, 23, 24));
    const service = createPhotoRenamerService({
      readVideoDate: async () => null
    });

    const images = await service.preview(rootDir, "images");
    const videos = await service.preview(rootDir, "videos");
    const all = await service.preview(rootDir);

    expect(images.items.map((item) => item.sourceName)).toEqual(["photo.jpg"]);
    expect(videos.items.map((item) => item.sourceName)).toEqual(["clip.mp4"]);
    expect(all.items.map((item) => item.sourceName)).toEqual(["clip.mp4", "photo.jpg"]);
  });

  it("avoids occupied target names and marks already-normalized photos unchanged", async () => {
    const rootDir = createFixtureDir();
    const capturedAt = new Date(2026, 0, 1, 12, 23, 24);
    await createPhoto(join(rootDir, "20260101_12_23_24.jpg"), capturedAt);
    await createPhoto(join(rootDir, "holiday.jpg"), capturedAt);
    const service = createPhotoRenamerService({
      readExifDate: async () => capturedAt
    });

    const result = await service.preview(rootDir);

    expect(result.items.map((item) => ({
      sourceName: item.sourceName,
      targetName: item.targetName,
      status: item.status
    }))).toEqual([
      {
        sourceName: "20260101_12_23_24.jpg",
        targetName: "20260101_12_23_24.jpg",
        status: "unchanged"
      },
      {
        sourceName: "holiday.jpg",
        targetName: "20260101_12_23_24_02.jpg",
        status: "rename"
      }
    ]);
  });

  it("executes a preview once and undoes the successful batch once", async () => {
    const rootDir = createFixtureDir();
    const sourcePath = join(rootDir, "holiday.jpg");
    const targetPath = join(rootDir, "20260101_12_23_24.jpg");
    await createPhoto(sourcePath, new Date(2026, 0, 1, 12, 23, 24));
    const service = createPhotoRenamerService();

    const preview = await service.preview(rootDir);
    const execution = await service.execute(preview.previewToken);

    expect(existsSync(sourcePath)).toBe(false);
    expect(readFileSync(targetPath, "utf8")).toBe("photo");
    expect(execution.summary).toEqual({ renamed: 1, failed: 0 });
    await expect(service.execute(preview.previewToken)).rejects.toThrow("preview token");

    const undo = await service.undo(execution.undoToken);

    expect(existsSync(targetPath)).toBe(false);
    expect(readFileSync(sourcePath, "utf8")).toBe("photo");
    expect(undo.summary).toEqual({ restored: 1, failed: 0 });
    await expect(service.undo(execution.undoToken)).rejects.toThrow("undo token");
  });

  it("rolls back renamed files when a later filesystem rename fails", async () => {
    const rootDir = createFixtureDir();
    const firstPath = join(rootDir, "a.jpg");
    const secondPath = join(rootDir, "b.jpg");
    await createPhoto(firstPath, new Date(2026, 0, 1, 12, 23, 24));
    await createPhoto(secondPath, new Date(2026, 0, 1, 12, 23, 25));
    let renameCalls = 0;
    const service = createPhotoRenamerService({
      renameFile: async (source, target) => {
        renameCalls += 1;
        if (renameCalls === 4) {
          throw new Error("simulated rename failure");
        }
        await rename(source, target);
      }
    });

    const preview = await service.preview(rootDir);

    await expect(service.execute(preview.previewToken)).rejects.toThrow("simulated rename failure");
    expect(existsSync(firstPath)).toBe(true);
    expect(existsSync(secondPath)).toBe(true);
  });

  it("ignores symbolic links during recursive scanning", async () => {
    const rootDir = createFixtureDir();
    const realDir = join(rootDir, "real");
    await mkdir(realDir);
    await createPhoto(join(realDir, "inside.jpg"), new Date(2026, 0, 1, 12, 23, 24));

    try {
      await symlink(realDir, join(rootDir, "linked"), "junction");
    } catch {
      return;
    }

    const result = await createPhotoRenamerService().preview(rootDir);

    expect(result.summary.total).toBe(1);
  });

  it("rejects expired preview tokens", async () => {
    const rootDir = createFixtureDir();
    await createPhoto(join(rootDir, "holiday.jpg"), new Date(2026, 0, 1, 12, 23, 24));
    let current = new Date(2026, 0, 1, 12, 0, 0);
    const service = createPhotoRenamerService({
      now: () => current
    });
    const preview = await service.preview(rootDir);
    current = new Date(2026, 0, 1, 12, 31, 0);

    await expect(service.execute(preview.previewToken)).rejects.toThrow("preview token");
  });

  it("does not start renaming when a target path becomes occupied after preview", async () => {
    const rootDir = createFixtureDir();
    const sourcePath = join(rootDir, "holiday.jpg");
    const targetPath = join(rootDir, "20260101_12_23_24.jpg");
    await createPhoto(sourcePath, new Date(2026, 0, 1, 12, 23, 24));
    const renameFile = vi.fn(rename);
    const service = createPhotoRenamerService({ renameFile });
    const preview = await service.preview(rootDir);
    await createPhoto(targetPath, new Date(2026, 0, 1, 12, 24, 0));

    await expect(service.execute(preview.previewToken)).rejects.toThrow("target path is occupied");
    expect(renameFile).not.toHaveBeenCalled();
    expect(readFileSync(sourcePath, "utf8")).toBe("photo");
    expect(readFileSync(targetPath, "utf8")).toBe("photo");
  });
});
