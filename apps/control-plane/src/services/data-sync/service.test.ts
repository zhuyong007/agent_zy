import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataSyncModule } from "@agent-zy/shared-types";

import type { LocalDataSyncAdapter, LocalDataSyncAdapters } from "./local-adapters";
import type { SyncRecordMap } from "./merge";
import { createDataSyncService } from "./service";
import { readModuleSnapshot, writeModuleSnapshot } from "./snapshot";
import { GitNonFastForwardError, type GitDataSyncTransport, type GitSyncWorkspace } from "./git-transport";

describe("data sync service", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "agent-zy-sync-service-"));
    roots.push(root);
    const remoteRoot = join(root, "remote");
    const baselineRoot = join(root, "baseline");
    let remoteCommit: string | null = null;
    let nextCommit = 1;
    let failPush = false;
    const local = new Map<DataSyncModule, SyncRecordMap>([
      ["history", new Map()],
      ["mhxy", new Map()],
      ["browser-automation", new Map()]
    ]);
    const writes: DataSyncModule[] = [];
    const adapters = Object.fromEntries(
      [...local].map(([module, records]) => [module, {
        read: () => structuredClone(records),
        write: (next: SyncRecordMap) => {
          local.set(module, structuredClone(next));
          writes.push(module);
        }
      } satisfies LocalDataSyncAdapter])
    ) as LocalDataSyncAdapters;
    const transport: GitDataSyncTransport = {
      async open(lastCommit): Promise<GitSyncWorkspace> {
        return {
          rootDir: remoteRoot,
          baselineRootDir: lastCommit ? baselineRoot : null,
          remoteCommit
        };
      },
      async commitAndPush(_workspace, _module) {
        if (failPush) throw new Error("push denied");
        remoteCommit = `commit-${nextCommit++}`;
        rmSync(baselineRoot, { recursive: true, force: true });
        cpSync(remoteRoot, baselineRoot, { recursive: true });
        return remoteCommit;
      },
      async close() {}
    };
    const service = createDataSyncService({
      dataDir: join(root, "local-state"),
      enabled: true,
      adapters,
      transport,
      now: () => "2026-06-22T10:00:00.000Z",
      createToken: () => "conflict-token"
    });
    return {
      service,
      local,
      writes,
      remoteRoot,
      baselineRoot,
      setRemoteCommit(value: string) { remoteCommit = value; },
      setFailPush(value: boolean) { failPush = value; }
    };
  }

  it("imports remote records on the first explicit sync", async () => {
    const item = fixture();
    writeModuleSnapshot(item.remoteRoot, "history", new Map([["notification:one", { id: "one", title: "远端" }]]));

    const result = await item.service.sync("history");

    expect(result).toMatchObject({ status: "synced", module: "history", pulledCount: 1 });
    expect(item.local.get("history")?.get("notification:one")).toEqual({ id: "one", title: "远端" });
    expect(item.service.getStatus().modules.history.lastCommit).toBe("commit-1");
  });

  it("returns a conflict without mutating local data and applies an explicit resolution", async () => {
    const item = fixture();
    const initial = new Map([["workflow:one", { id: "one", name: "初始" }]]);
    item.local.set("browser-automation", structuredClone(initial));
    writeModuleSnapshot(item.remoteRoot, "browser-automation", initial);
    await item.service.sync("browser-automation");

    item.local.set("browser-automation", new Map([["workflow:one", { id: "one", name: "本地" }]]));
    writeModuleSnapshot(item.remoteRoot, "browser-automation", new Map([["workflow:one", { id: "one", name: "远端" }]]));
    item.writes.length = 0;

    const conflict = await item.service.sync("browser-automation");
    expect(conflict).toMatchObject({ status: "conflict", conflictToken: "conflict-token" });
    expect(item.writes).toEqual([]);

    const resolved = await item.service.sync("browser-automation", {
      conflictToken: "conflict-token",
      resolutions: [{ key: "workflow:one", choice: "remote" }]
    });
    expect(resolved.status).toBe("synced");
    expect(item.local.get("browser-automation")?.get("workflow:one")).toEqual({ id: "one", name: "远端" });
  });

  it("does not import merged data when push fails", async () => {
    const item = fixture();
    item.local.set("mhxy", new Map([["trade:local", { id: "local" }]]));
    item.setFailPush(true);

    const result = await item.service.sync("mhxy");

    expect(result).toEqual({ status: "failed", module: "mhxy", error: "push denied" });
    expect(item.writes).toEqual([]);
    expect(item.local.get("mhxy")?.has("trade:local")).toBe(true);
  });

  it("reopens the remote branch and recomputes once after a non-fast-forward push", async () => {
    const item = fixture();
    let opens = 0;
    let pushes = 0;
    const transport: GitDataSyncTransport = {
      async open() {
        opens += 1;
        return { rootDir: item.remoteRoot, baselineRootDir: null, remoteCommit: `remote-${opens}` };
      },
      async commitAndPush() {
        pushes += 1;
        if (pushes === 1) throw new GitNonFastForwardError("remote advanced");
        return "commit-after-retry";
      },
      async close() {}
    };
    const service = createDataSyncService({
      dataDir: join(roots[0], "retry-state"),
      enabled: true,
      adapters: {
        history: { read: () => new Map([["notification:one", { id: "one" }]]), write: vi.fn() },
        mhxy: { read: () => new Map(), write: vi.fn() },
        "browser-automation": { read: () => new Map(), write: vi.fn() }
      },
      transport
    });

    const result = await service.sync("history");

    expect(result).toMatchObject({ status: "synced", commitSha: "commit-after-retry" });
    expect(opens).toBe(2);
  });

  it("rejects an expired conflict token and recomputes the conflict", async () => {
    const item = fixture();
    const initial = new Map([["trade:one", { id: "one", amount: 1 }]]);
    item.local.set("mhxy", structuredClone(initial));
    writeModuleSnapshot(item.remoteRoot, "mhxy", initial);
    await item.service.sync("mhxy");
    item.local.set("mhxy", new Map([["trade:one", { id: "one", amount: 2 }]]));
    writeModuleSnapshot(item.remoteRoot, "mhxy", new Map([["trade:one", { id: "one", amount: 3 }]]));
    vi.spyOn(Date, "now").mockReturnValue(0);
    const first = await item.service.sync("mhxy");
    expect(first.status).toBe("conflict");

    vi.spyOn(Date, "now").mockReturnValue(15 * 60_000 + 1);
    const second = await item.service.sync("mhxy", {
      conflictToken: "conflict-token",
      resolutions: [{ key: "trade:one", choice: "local" }]
    });

    expect(second.status).toBe("conflict");
    expect(item.local.get("mhxy")?.get("trade:one")).toEqual({ id: "one", amount: 2 });
  });

  it("refuses synchronization while the safety flag is disabled", async () => {
    const item = fixture();
    const disabled = createDataSyncService({
      dataDir: join(roots[0], "disabled"),
      enabled: false,
      adapters: {} as LocalDataSyncAdapters,
      transport: {} as GitDataSyncTransport
    });

    expect(await disabled.sync("history")).toEqual({
      status: "failed",
      module: "history",
      error: "数据同步未启用，请确认仓库已设为 Private 后设置 AGENT_ZY_DATA_SYNC_ENABLED=true"
    });
  });
});
