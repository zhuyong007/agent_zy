import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  MhxyAssetFlipRecord,
  MhxyGameCoinCashoutRecord,
  MhxyGameCoinPurchaseRecord,
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
  readAssetFlips(): MhxyAssetFlipRecord[];
  writeAssetFlips(records: MhxyAssetFlipRecord[]): void;
  readGameCoinPurchases(): MhxyGameCoinPurchaseRecord[];
  writeGameCoinPurchases(records: MhxyGameCoinPurchaseRecord[]): void;
  readGameCoinCashouts(): MhxyGameCoinCashoutRecord[];
  writeGameCoinCashouts(records: MhxyGameCoinCashoutRecord[]): void;
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
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(records, null, 2), "utf8");
  renameSync(tempPath, path);
}

export function createMhxyRepository(dataDir: string): MhxyRepository {
  const dir = resolve(dataDir, "mhxy");
  mkdirSync(dir, { recursive: true });
  const trades = resolve(dir, "trades.json");
  const snapshots = resolve(dir, "price-snapshots.json");
  const transfers = resolve(dir, "inventory-transfers.json");
  const targets = resolve(dir, "inventory-targets.json");
  const assetFlips = resolve(dir, "asset-flips.json");
  const gameCoinPurchases = resolve(dir, "game-coin-purchases.json");
  const gameCoinCashouts = resolve(dir, "game-coin-cashouts.json");
  [trades, snapshots, transfers, targets, assetFlips, gameCoinPurchases, gameCoinCashouts].forEach(ensureArrayFile);

  return {
    readTrades: () => readArray(trades),
    writeTrades: (records) => writeArray(trades, records),
    readPriceSnapshots: () => readArray(snapshots),
    writePriceSnapshots: (records) => writeArray(snapshots, records),
    readInventoryTransfers: () => readArray(transfers),
    writeInventoryTransfers: (records) => writeArray(transfers, records),
    readInventoryTargets: () => readArray(targets),
    writeInventoryTargets: (records) => writeArray(targets, records),
    readAssetFlips: () => readArray(assetFlips),
    writeAssetFlips: (records) => writeArray(assetFlips, records),
    readGameCoinPurchases: () => readArray(gameCoinPurchases),
    writeGameCoinPurchases: (records) => writeArray(gameCoinPurchases, records),
    readGameCoinCashouts: () => readArray(gameCoinCashouts),
    writeGameCoinCashouts: (records) => writeArray(gameCoinCashouts, records)
  };
}
