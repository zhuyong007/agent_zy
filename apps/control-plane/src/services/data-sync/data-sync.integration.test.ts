import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LocalDataSyncAdapters } from "./local-adapters";
import type { SyncRecordMap } from "./merge";
import { createGitDataSyncTransport } from "./git-transport";
import { createDataSyncService } from "./service";

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createMemoryAdapters(history: { records: SyncRecordMap }): LocalDataSyncAdapters {
  return {
    history: {
      read: () => structuredClone(history.records),
      write: (records) => {
        history.records = structuredClone(records);
      }
    },
    mhxy: { read: () => new Map(), write: () => undefined },
    "browser-automation": { read: () => new Map(), write: () => undefined }
  };
}

describe("data sync two-client integration", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("publishes, imports, merges independent additions, and surfaces same-record conflicts", async () => {
    const root = mkdtempSync(join(tmpdir(), "agent-zy-sync-two-client-"));
    roots.push(root);
    const remote = join(root, "origin.git");
    const firstProject = join(root, "first");
    const secondProject = join(root, "second");
    git(root, "init", "--bare", remote);
    git(root, "init", "-b", "main", firstProject);
    git(firstProject, "config", "user.name", "Sync One");
    git(firstProject, "config", "user.email", "one@example.test");
    writeFileSync(join(firstProject, "README.md"), "initial\n");
    git(firstProject, "add", "README.md");
    git(firstProject, "commit", "-m", "initial");
    git(firstProject, "remote", "add", "origin", remote);
    git(firstProject, "push", "-u", "origin", "main");
    git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
    git(root, "clone", remote, secondProject);
    git(secondProject, "config", "user.name", "Sync Two");
    git(secondProject, "config", "user.email", "two@example.test");

    const firstLocal = { records: new Map([["notification:shared", { id: "shared", title: "初始" }]]) };
    const secondLocal = { records: new Map() as SyncRecordMap };
    const firstService = createDataSyncService({
      dataDir: join(firstProject, ".agent-zy-data"),
      enabled: true,
      adapters: createMemoryAdapters(firstLocal),
      transport: createGitDataSyncTransport({ projectDir: firstProject, dataDir: join(firstProject, ".agent-zy-data") })
    });
    const secondService = createDataSyncService({
      dataDir: join(secondProject, ".agent-zy-data"),
      enabled: true,
      adapters: createMemoryAdapters(secondLocal),
      transport: createGitDataSyncTransport({ projectDir: secondProject, dataDir: join(secondProject, ".agent-zy-data") })
    });

    expect((await firstService.sync("history")).status).toBe("synced");
    expect((await secondService.sync("history")).status).toBe("synced");
    expect(secondLocal.records.has("notification:shared")).toBe(true);

    firstLocal.records.set("notification:first", { id: "first", title: "第一端" });
    secondLocal.records.set("notification:second", { id: "second", title: "第二端" });
    expect((await firstService.sync("history")).status).toBe("synced");
    expect((await secondService.sync("history")).status).toBe("synced");
    expect([...secondLocal.records.keys()].sort()).toEqual([
      "notification:first",
      "notification:second",
      "notification:shared"
    ]);

    firstLocal.records.set("notification:shared", { id: "shared", title: "本地版本" });
    secondLocal.records.set("notification:shared", { id: "shared", title: "远端版本" });
    expect((await secondService.sync("history")).status).toBe("synced");
    const conflict = await firstService.sync("history");
    expect(conflict).toMatchObject({ status: "conflict", module: "history" });
    if (conflict.status !== "conflict") throw new Error("expected conflict");

    const resolved = await firstService.sync("history", {
      conflictToken: conflict.conflictToken,
      resolutions: [{ key: "notification:shared", choice: "remote" }]
    });
    expect(resolved.status).toBe("synced");
    expect(firstLocal.records.get("notification:shared")).toEqual({ id: "shared", title: "远端版本" });
  }, 20_000);
});
