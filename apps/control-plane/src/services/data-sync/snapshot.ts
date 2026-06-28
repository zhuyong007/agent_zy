import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import type { DataSyncModule } from "@agent-zy/shared-types";

import type { SyncRecordMap } from "./merge";

const SNAPSHOT_SCHEMA_VERSION = 1;

export function recordFileName(syncKey: string) {
  return `${createHash("sha256").update(syncKey).digest("hex")}.json`;
}

function modulePath(rootDir: string, module: DataSyncModule) {
  return join(rootDir, "sync-data", module);
}

function parseJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function readModuleSnapshot(rootDir: string, module: DataSyncModule): SyncRecordMap {
  const dir = modulePath(rootDir, module);
  if (!existsSync(dir)) return new Map();

  const manifest = parseJson(join(dir, "manifest.json")) as {
    schemaVersion?: unknown;
    module?: unknown;
  };
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || manifest.module !== module) {
    throw new Error(`不支持的 ${module} 数据快照版本`);
  }

  const records = new Map();
  const recordsDir = join(dir, "records");
  if (!existsSync(recordsDir)) return records;

  for (const fileName of readdirSync(recordsDir).filter((item) => item.endsWith(".json")).sort()) {
    const path = join(recordsDir, fileName);
    const parsed = parseJson(path) as { syncKey?: unknown; value?: unknown };
    if (typeof parsed.syncKey !== "string" || !parsed.value || typeof parsed.value !== "object") {
      throw new Error(`无效的数据快照记录：${path}`);
    }
    if (recordFileName(parsed.syncKey) !== fileName) {
      throw new Error(`快照记录文件名与 syncKey 不匹配：${path}`);
    }
    if (records.has(parsed.syncKey)) throw new Error(`数据快照存在重复记录：${parsed.syncKey}`);
    records.set(parsed.syncKey, parsed.value as Record<string, unknown>);
  }

  return records;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeModuleSnapshot(
  rootDir: string,
  module: DataSyncModule,
  records: SyncRecordMap
) {
  const finalDir = modulePath(rootDir, module);
  const parentDir = dirname(finalDir);
  const tempDir = join(parentDir, `.${module}-${randomUUID()}.tmp`);
  const backupDir = join(parentDir, `.${module}-${randomUUID()}.bak`);
  mkdirSync(join(tempDir, "records"), { recursive: true });

  try {
    writeJson(join(tempDir, "manifest.json"), {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      module
    });
    for (const [syncKey, value] of [...records.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      writeJson(join(tempDir, "records", recordFileName(syncKey)), { syncKey, value });
    }

    if (existsSync(finalDir)) renameSync(finalDir, backupDir);
    try {
      renameSync(tempDir, finalDir);
    } catch (error) {
      if (existsSync(backupDir)) renameSync(backupDir, finalDir);
      throw error;
    }
    rmSync(backupDir, { recursive: true, force: true });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
