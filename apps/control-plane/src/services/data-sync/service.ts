import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  DataSyncConflict,
  DataSyncModule,
  DataSyncModuleStatus,
  DataSyncResolution,
  DataSyncResult,
  DataSyncStatusResponse
} from "@agent-zy/shared-types";

import { GitNonFastForwardError, type GitDataSyncTransport } from "./git-transport";
import type { LocalDataSyncAdapters } from "./local-adapters";
import { canonicalJson, mergeRecordMaps, type SyncRecord, type SyncRecordMap } from "./merge";
import { readModuleSnapshot, writeModuleSnapshot } from "./snapshot";

const DATA_SYNC_BRANCH = "agent-zy-data";
const MODULES: DataSyncModule[] = ["history", "mhxy", "browser-automation"];
const DISABLED_MESSAGE =
  "数据同步未启用，请确认仓库已设为 Private 后设置 AGENT_ZY_DATA_SYNC_ENABLED=true";

interface PersistedDataSyncState {
  schemaVersion: 1;
  modules: Partial<Record<DataSyncModule, { lastCommit: string; lastSyncedAt: string }>>;
}

function statePath(dataDir: string) {
  return join(dataDir, "data-sync", "state.json");
}

function readState(dataDir: string): PersistedDataSyncState {
  const path = statePath(dataDir);
  if (!existsSync(path)) return { schemaVersion: 1, modules: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PersistedDataSyncState;
  if (parsed.schemaVersion !== 1 || !parsed.modules || typeof parsed.modules !== "object") {
    throw new Error(`数据同步状态格式无效：${path}`);
  }
  return parsed;
}

function writeState(dataDir: string, state: PersistedDataSyncState) {
  const path = statePath(dataDir);
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function same(left: SyncRecord | undefined, right: SyncRecord | undefined) {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

function changedCount(from: SyncRecordMap, to: SyncRecordMap) {
  const keys = new Set([...from.keys(), ...to.keys()]);
  return [...keys].filter((key) => !same(from.get(key), to.get(key))).length;
}

function toConflict(conflict: {
  key: string;
  baseline: SyncRecord | undefined;
  local: SyncRecord | undefined;
  remote: SyncRecord | undefined;
}): DataSyncConflict {
  const separator = conflict.key.indexOf(":");
  return {
    key: conflict.key,
    recordType: separator >= 0 ? conflict.key.slice(0, separator) : "record",
    recordId: separator >= 0 ? conflict.key.slice(separator + 1) : conflict.key,
    baseline: conflict.baseline ?? null,
    local: conflict.local ?? null,
    remote: conflict.remote ?? null
  };
}

export interface DataSyncService {
  getStatus(): DataSyncStatusResponse;
  sync(
    module: DataSyncModule,
    request?: { conflictToken?: string; resolutions?: DataSyncResolution[] }
  ): Promise<DataSyncResult>;
}

export function createDataSyncService(options: {
  dataDir: string;
  enabled: boolean;
  adapters: LocalDataSyncAdapters;
  transport: GitDataSyncTransport;
  now?: () => string;
  createToken?: () => string;
}): DataSyncService {
  const now = options.now ?? (() => new Date().toISOString());
  const createToken = options.createToken ?? randomUUID;
  const persisted = readState(options.dataDir);
  const statuses = Object.fromEntries(
    MODULES.map((module) => {
      const saved = persisted.modules[module];
      return [module, {
        module,
        status: saved ? "synced" : "idle",
        lastSyncedAt: saved?.lastSyncedAt ?? null,
        lastCommit: saved?.lastCommit ?? null,
        error: null
      } satisfies DataSyncModuleStatus];
    })
  ) as Record<DataSyncModule, DataSyncModuleStatus>;
  const pendingConflicts = new Map<
    string,
    { module: DataSyncModule; remoteCommit: string | null; expiresAt: number }
  >();
  let locked = false;

  function setStatus(module: DataSyncModule, patch: Partial<DataSyncModuleStatus>) {
    statuses[module] = { ...statuses[module], ...patch };
  }

  return {
    getStatus() {
      return {
        enabled: options.enabled,
        branch: DATA_SYNC_BRANCH,
        modules: structuredClone(statuses)
      };
    },
    async sync(module, request = {}) {
      if (!options.enabled) return { status: "failed", module, error: DISABLED_MESSAGE };
      if (locked) return { status: "failed", module, error: "已有数据同步任务正在执行，请稍后重试" };
      locked = true;
      setStatus(module, { status: "syncing", error: null });
      const lastCommit = persisted.modules[module]?.lastCommit ?? null;

      async function syncOnce(): Promise<DataSyncResult> {
        const workspace = await options.transport.open(lastCommit);
        try {
          const local = options.adapters[module].read();
          const remote = readModuleSnapshot(workspace.rootDir, module);
          const baseline = workspace.baselineRootDir
            ? readModuleSnapshot(workspace.baselineRootDir, module)
            : new Map();
          const pending = request.conflictToken
            ? pendingConflicts.get(request.conflictToken)
            : undefined;
          const tokenValid = Boolean(
            pending &&
              pending.module === module &&
              pending.remoteCommit === workspace.remoteCommit &&
              pending.expiresAt > Date.now()
          );
          const resolutions = tokenValid
            ? Object.fromEntries((request.resolutions ?? []).map((item) => [item.key, item.choice]))
            : undefined;
          const merged = mergeRecordMaps({
            hasBaseline: Boolean(lastCommit && workspace.baselineRootDir),
            baseline,
            local,
            remote,
            resolutions
          });

          if (merged.conflicts.length > 0) {
            const conflictToken = createToken();
            pendingConflicts.set(conflictToken, {
              module,
              remoteCommit: workspace.remoteCommit,
              expiresAt: Date.now() + 15 * 60_000
            });
            setStatus(module, { status: "conflict", error: null });
            return {
              status: "conflict",
              module,
              conflictToken,
              remoteCommitSha: workspace.remoteCommit,
              conflicts: merged.conflicts.map(toConflict)
            };
          }

          writeModuleSnapshot(workspace.rootDir, module, merged.records);
          const commitSha = await options.transport.commitAndPush(workspace, module);
          options.adapters[module].write(merged.records);
          const lastSyncedAt = now();
          persisted.modules[module] = { lastCommit: commitSha, lastSyncedAt };
          writeState(options.dataDir, persisted);
          if (request.conflictToken) pendingConflicts.delete(request.conflictToken);
          setStatus(module, {
            status: "synced",
            lastSyncedAt,
            lastCommit: commitSha,
            error: null
          });
          return {
            status: "synced",
            module,
            commitSha,
            pulledCount: changedCount(local, merged.records),
            pushedCount: changedCount(remote, merged.records),
            deletedCount: [...remote.keys()].filter((key) => !merged.records.has(key)).length,
            lastSyncedAt
          };
        } finally {
          await options.transport.close(workspace).catch(() => undefined);
        }
      }

      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await syncOnce();
          } catch (error) {
            if (error instanceof GitNonFastForwardError && attempt === 0) continue;
            throw error;
          }
        }
        throw new Error("远端数据分支持续发生变化，请稍后重试");
      } catch (error) {
        const message = error instanceof Error ? error.message : "数据同步失败";
        setStatus(module, { status: "failed", error: message });
        return { status: "failed", module, error: message };
      } finally {
        locked = false;
      }
    }
  };
}
