import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createMhxyRepository } from "./mhxy-repository";

describe("mhxy repository transactions", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("restores every MHXY file when a multi-file write fails midway", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-repository-"));
    tempDirs.push(dataDir);
    const repository = createMhxyRepository(dataDir);
    const originalTrade = {
      id: "trade-1",
      type: "buy" as const,
      itemName: "Original",
      quantity: 1,
      unitPrice: 10,
      currency: "rmb" as const,
      accountingMode: "directRmb" as const,
      rmbAmount: 10,
      feeRmb: 0,
      occurredAt: "2026-06-01T00:00:00.000Z",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    };
    repository.writeTrades([originalTrade]);

    expect(() => repository.transaction(() => {
      repository.writeTrades([]);
      repository.writeGameCoinCashouts([{
        id: "cashout-1",
        occurredAt: "2026-06-02T00:00:00.000Z",
        serverName: "Server",
        characterName: "Seller",
        gameCoinAmount: 1,
        rmbReceived: 1,
        rmbPerGameCoinWan: 10_000,
        costBasisRmb: 0,
        realizedProfitRmb: 1,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z"
      }]);
      throw new Error("simulated disk failure");
    })).toThrow("simulated disk failure");

    expect(repository.readTrades()).toEqual([originalTrade]);
    expect(repository.readGameCoinCashouts()).toEqual([]);
  });
});
