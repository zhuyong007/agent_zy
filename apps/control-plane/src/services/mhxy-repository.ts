import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  MhxyInventoryTarget,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshot,
  MhxyTradeRecord
} from "@agent-zy/shared-types";

export interface MhxyRepository {
  readTrades(): MhxyTradeRecord[];
  writeTrades(records: MhxyTradeRecord[]): void;
  readPriceSnapshots(): MhxyPriceSnapshot[];
  writePriceSnapshots(records: MhxyPriceSnapshot[]): void;
  readInventoryTransfers(): MhxyInventoryTransferRecord[];
  writeInventoryTransfers(records: MhxyInventoryTransferRecord[]): void;
  readInventoryTargets(): MhxyInventoryTarget[];
  writeInventoryTargets(records: MhxyInventoryTarget[]): void;
}

function ensureArrayFile(path: string) {
  try {
    readFileSync(path, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
    writeFileSync(path, "[]", "utf8");
  }
}

function readArray<T>(path: string): T[] {
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

function writeArray<T>(path: string, records: T[]) {
  writeFileSync(path, JSON.stringify(records, null, 2), "utf8");
}

export function createMhxyRepository(dataDir: string): MhxyRepository {
  const dir = resolve(dataDir, "mhxy");
  mkdirSync(dir, { recursive: true });
  const trades = resolve(dir, "trades.json");
  const snapshots = resolve(dir, "price-snapshots.json");
  const transfers = resolve(dir, "inventory-transfers.json");
  const targets = resolve(dir, "inventory-targets.json");
  [trades, snapshots, transfers, targets].forEach(ensureArrayFile);

  return {
    readTrades: () => readArray(trades),
    writeTrades: (records) => writeArray(trades, records),
    readPriceSnapshots: () => readArray(snapshots),
    writePriceSnapshots: (records) => writeArray(snapshots, records),
    readInventoryTransfers: () => readArray(transfers),
    writeInventoryTransfers: (records) => writeArray(transfers, records),
    readInventoryTargets: () => readArray(targets),
    writeInventoryTargets: (records) => writeArray(targets, records)
  };
}
