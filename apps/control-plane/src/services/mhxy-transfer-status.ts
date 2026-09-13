import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { MhxyServerTransferStatus } from "@agent-zy/shared-types";

export interface MhxyTransferServerStatus {
  regionName: string;
  serverName: string;
  status: MhxyServerTransferStatus;
  snapshotDate: string;
}

const normalize = (value: string | undefined) => value?.trim() ?? "";

function defaultDatabasePath() {
  return process.env.MHXY_TRANSFER_DATABASE_PATH?.trim()
    || resolve(process.cwd(), "..", "mhxy-decision-miniapp", "data", "gold_prices.sqlite3");
}

export function createMhxyTransferStatusResolver(databasePath = defaultDatabasePath()) {
  let cachedMtimeMs = -1;
  let cachedSnapshotDate = "";
  let cachedRows: MhxyTransferServerStatus[] = [];

  function refresh() {
    if (!existsSync(databasePath)) {
      cachedMtimeMs = -1;
      cachedSnapshotDate = "";
      cachedRows = [];
      return;
    }
    const walPath = `${databasePath}-wal`;
    const mtimeMs = Math.max(
      statSync(databasePath).mtimeMs,
      existsSync(walPath) ? statSync(walPath).mtimeMs : 0
    );
    if (mtimeMs === cachedMtimeMs) return;

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const rows = database.prepare(`
        SELECT
          game_servers.region_name AS regionName,
          game_servers.server_name AS serverName,
          transfer_snapshots.status AS status,
          transfer_snapshots.snapshot_date AS snapshotDate
        FROM transfer_snapshots
        INNER JOIN game_servers ON game_servers.id = transfer_snapshots.server_id
        WHERE transfer_snapshots.snapshot_date = (
          SELECT MAX(snapshot_date) FROM transfer_snapshots
        )
          AND game_servers.active = 1
      `).all() as Array<Record<string, unknown>>;
      cachedRows = rows.map((row) => ({
        regionName: normalize(String(row.regionName ?? "")),
        serverName: normalize(String(row.serverName ?? "")),
        status: row.status === "flat" || row.status === "open" || row.status === "firework"
          ? row.status
          : "unknown",
        snapshotDate: normalize(String(row.snapshotDate ?? ""))
      }));
      cachedSnapshotDate = cachedRows[0]?.snapshotDate ?? "";
      cachedMtimeMs = mtimeMs;
    } finally {
      database.close();
    }
  }

  function all() {
    try {
      refresh();
    } catch {
      cachedRows = [];
      cachedSnapshotDate = "";
    }
    return cachedRows;
  }

  return {
    databasePath,
    get snapshotDate() {
      all();
      return cachedSnapshotDate || undefined;
    },
    find(serverName: string | undefined, regionName?: string) {
      const normalizedServerName = normalize(serverName);
      const normalizedRegionName = normalize(regionName);
      if (!normalizedServerName) return undefined;
      const rows = all().filter((row) => row.serverName === normalizedServerName);
      if (normalizedRegionName) {
        return rows.find((row) => row.regionName === normalizedRegionName);
      }
      return rows.length === 1 ? rows[0] : undefined;
    },
    all
  };
}

export type MhxyTransferStatusResolver = ReturnType<typeof createMhxyTransferStatusResolver>;
