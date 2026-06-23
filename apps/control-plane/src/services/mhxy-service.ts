import { randomUUID } from "node:crypto";

import type {
  MhxyAssetFlipInput,
  MhxyAssetFlipRecord,
  MhxyAssetFlipSummary,
  MhxyGameCoinPurchaseInput,
  MhxyGameCoinPurchasePosition,
  MhxyGameCoinPurchaseRecord,
  MhxyDashboard,
  MhxyInventoryPosition,
  MhxyInventoryTarget,
  MhxyInventoryTransferInput,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshot,
  MhxyPriceSnapshotInput,
  MhxyTradeInput,
  MhxyTradeRecord,
  MhxyTradeResult
} from "@agent-zy/shared-types";

import { createMhxyRepository } from "./mhxy-repository";

type ReplayEvent =
  | { kind: "trade"; record: MhxyTradeRecord }
  | { kind: "transfer"; record: MhxyInventoryTransferRecord };

const roundRmb = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const nowIso = () => new Date().toISOString();
const normalizeLabel = (value: string | undefined) => value?.trim() ?? "";
const inventoryKey = (itemName: string, serverName?: string, characterName?: string) =>
  JSON.stringify([itemName.trim(), normalizeLabel(serverName), normalizeLabel(characterName)]);

function assertFiniteNonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name}不能小于 0`);
}

function assertFinitePositive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}必须大于 0`);
}

function assertPositiveInteger(value: number, name = "数量") {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name}必须是大于 0 的整数`);
}

function normalizeOptionalDate(value: string | undefined, name: string) {
  if (value === undefined || value.trim() === "") return undefined;
  if (Number.isNaN(Date.parse(value))) throw new Error(`${name}无效`);
  return new Date(value).toISOString();
}

function normalizeAssetFlip(
  input: MhxyAssetFlipInput,
  existing?: MhxyAssetFlipRecord
): MhxyAssetFlipRecord {
  if (input.category !== "summon" && input.category !== "equipment") {
    throw new Error("资产类型必须是召唤兽或装备");
  }
  const name = input.name.trim();
  if (!name) throw new Error("名称不能为空");
  if (!input.buyAt || Number.isNaN(Date.parse(input.buyAt))) throw new Error("买入时间无效");
  const purchaseCurrency = input.purchaseCurrency ?? existing?.purchaseCurrency ?? "rmb";
  if (purchaseCurrency === "rmb") {
    if (input.buyPriceRmb === undefined) throw new Error("人民币买入价格不能为空");
    assertFiniteNonNegative(input.buyPriceRmb, "买入价格");
  } else {
    if (input.gameCoinCost === undefined) throw new Error("游戏币花费不能为空");
    assertPositiveInteger(input.gameCoinCost, "游戏币花费");
  }
  const hasSellAt = Boolean(input.sellAt?.trim());
  const hasSellPrice = input.sellPriceRmb !== undefined && input.sellPriceRmb !== null;
  if (hasSellAt !== hasSellPrice) {
    throw new Error("卖出时间和卖出价格必须同时填写");
  }
  if (hasSellPrice) assertFiniteNonNegative(input.sellPriceRmb as number, "卖出价格");

  const buyPriceRmb = purchaseCurrency === "rmb" ? roundRmb(input.buyPriceRmb as number) : 0;
  const sellPriceRmb = hasSellPrice ? roundRmb(input.sellPriceRmb as number) : undefined;
  const timestamp = nowIso();
  const status = hasSellPrice ? "sold" : "holding";

  return {
    id: existing?.id ?? randomUUID(),
    category: input.category,
    name,
    buyAt: new Date(input.buyAt).toISOString(),
    purchaseCurrency,
    buyPriceRmb,
    ...(purchaseCurrency === "gameCoin" ? { gameCoinCost: input.gameCoinCost } : {}),
    ...(hasSellAt ? { sellAt: normalizeOptionalDate(input.sellAt, "卖出时间") } : {}),
    ...(sellPriceRmb !== undefined ? { sellPriceRmb } : {}),
    status,
    profitRmb: sellPriceRmb === undefined ? null : roundRmb(sellPriceRmb - buyPriceRmb),
    ...(normalizeLabel(input.serverName) ? { serverName: normalizeLabel(input.serverName) } : {}),
    ...(normalizeLabel(input.characterName) ? { characterName: normalizeLabel(input.characterName) } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeGameCoinPurchase(
  input: MhxyGameCoinPurchaseInput,
  existing?: MhxyGameCoinPurchaseRecord
): MhxyGameCoinPurchaseRecord {
  if (!input.acquiredAt || Number.isNaN(Date.parse(input.acquiredAt))) {
    throw new Error("游戏币购入时间无效");
  }
  assertPositiveInteger(input.gameCoinAmount, "购入游戏币数量");
  assertFinitePositive(input.rmbCost, "购币人民币成本");
  const timestamp = nowIso();
  return {
    id: existing?.id ?? randomUUID(),
    acquiredAt: new Date(input.acquiredAt).toISOString(),
    gameCoinAmount: input.gameCoinAmount,
    rmbCost: roundRmb(input.rmbCost),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function replayAssetFlips(
  records: MhxyAssetFlipRecord[],
  purchases: MhxyGameCoinPurchaseRecord[]
): { records: MhxyAssetFlipRecord[]; purchases: MhxyGameCoinPurchasePosition[] } {
  const remaining = new Map(purchases.map((purchase) => [purchase.id, purchase.gameCoinAmount]));
  const orderedPurchases = [...purchases].sort((left, right) => {
    const acquiredAt = left.acquiredAt.localeCompare(right.acquiredAt);
    if (acquiredAt !== 0) return acquiredAt;
    const createdAt = left.createdAt.localeCompare(right.createdAt);
    return createdAt !== 0 ? createdAt : left.id.localeCompare(right.id);
  });
  const recalculated = [...records]
    .map((record) => ({ ...record, purchaseCurrency: record.purchaseCurrency ?? "rmb" }))
    .sort((left, right) => {
      const buyAt = left.buyAt.localeCompare(right.buyAt);
      if (buyAt !== 0) return buyAt;
      const createdAt = left.createdAt.localeCompare(right.createdAt);
      return createdAt !== 0 ? createdAt : left.id.localeCompare(right.id);
    })
    .map((record) => {
      if (record.purchaseCurrency !== "gameCoin") {
        return {
          ...record,
          purchaseCurrency: "rmb" as const,
          profitRmb:
            record.sellPriceRmb === undefined
              ? null
              : roundRmb(record.sellPriceRmb - record.buyPriceRmb),
          gameCoinCost: undefined,
          gameCoinAllocations: undefined
        };
      }

      const gameCoinCost = record.gameCoinCost ?? 0;
      assertPositiveInteger(gameCoinCost, "游戏币花费");
      let needed = gameCoinCost;
      let rawRmbCost = 0;
      const allocations = [] as NonNullable<MhxyAssetFlipRecord["gameCoinAllocations"]>;
      for (const purchase of orderedPurchases) {
        if (purchase.acquiredAt > record.buyAt || needed === 0) continue;
        const available = remaining.get(purchase.id) ?? 0;
        if (available <= 0) continue;
        const used = Math.min(available, needed);
        const allocationRmbCost = used * purchase.rmbCost / purchase.gameCoinAmount;
        allocations.push({
          gameCoinPurchaseId: purchase.id,
          gameCoinAmount: used,
          rmbCost: roundRmb(allocationRmbCost)
        });
        rawRmbCost += allocationRmbCost;
        remaining.set(purchase.id, available - used);
        needed -= used;
      }
      if (needed > 0) {
        throw new Error(
          `游戏币余额不足：${record.name} 需要 ${gameCoinCost}，买入时缺少 ${needed}`
        );
      }
      const buyPriceRmb = roundRmb(rawRmbCost);
      const allocatedRmb = roundRmb(allocations.reduce((sum, item) => sum + item.rmbCost, 0));
      if (allocations.length > 0 && allocatedRmb !== buyPriceRmb) {
        const last = allocations[allocations.length - 1];
        last.rmbCost = roundRmb(last.rmbCost + buyPriceRmb - allocatedRmb);
      }
      return {
        ...record,
        purchaseCurrency: "gameCoin" as const,
        gameCoinCost,
        buyPriceRmb,
        gameCoinAllocations: allocations,
        profitRmb:
          record.sellPriceRmb === undefined
            ? null
            : roundRmb(record.sellPriceRmb - buyPriceRmb)
      };
    });

  return {
    records: recalculated,
    purchases: orderedPurchases.map((purchase) => {
      const remainingGameCoinAmount = remaining.get(purchase.id) ?? 0;
      return {
        ...purchase,
        remainingGameCoinAmount,
        remainingRmbCost: roundRmb(
          remainingGameCoinAmount * purchase.rmbCost / purchase.gameCoinAmount
        )
      };
    })
  };
}

function summarizeAssetFlips(records: MhxyAssetFlipRecord[]): MhxyAssetFlipSummary {
  return records.reduce<MhxyAssetFlipSummary>(
    (summary, record) => {
      if (record.status === "holding") {
        summary.holdingCount += 1;
        summary.holdingCostRmb = roundRmb(summary.holdingCostRmb + record.buyPriceRmb);
        return summary;
      }
      summary.soldCount += 1;
      summary.realizedRevenueRmb = roundRmb(summary.realizedRevenueRmb + (record.sellPriceRmb ?? 0));
      summary.realizedProfitRmb = roundRmb(summary.realizedProfitRmb + (record.profitRmb ?? 0));
      return summary;
    },
    {
      holdingCount: 0,
      soldCount: 0,
      holdingCostRmb: 0,
      realizedProfitRmb: 0,
      realizedRevenueRmb: 0
    }
  );
}

function normalizeTrade(input: MhxyTradeInput, existing?: MhxyTradeRecord): MhxyTradeRecord {
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  assertPositiveInteger(input.quantity);
  assertFiniteNonNegative(input.unitPrice, "单价");
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) throw new Error("发生时间无效");

  const rmbAmount =
    input.currency === "gameCoin"
      ? (() => {
          if (!input.rmbPerGameCoinWan || input.rmbPerGameCoinWan <= 0) {
            throw new Error("游戏币交易必须填写大于 0 的兑换比例");
          }
          return roundRmb(input.quantity * input.unitPrice * input.rmbPerGameCoinWan);
        })()
      : roundRmb(input.quantity * input.unitPrice);
  const feeRmb =
    input.currency === "gameCoin"
      ? input.type === "sell"
        ? roundRmb(rmbAmount * 0.05)
        : 0
      : roundRmb(input.feeRmb ?? 0);
  assertFiniteNonNegative(feeRmb, "人民币手续费");
  const timestamp = nowIso();

  return {
    id: existing?.id ?? randomUUID(),
    type: input.type,
    itemName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currency: input.currency,
    rmbAmount,
    feeRmb,
    ...(input.currency === "gameCoin"
      ? {
          gameCoinAmountWan: input.quantity * input.unitPrice,
          rmbPerGameCoinWan: input.rmbPerGameCoinWan
        }
      : {}),
    occurredAt: new Date(input.occurredAt).toISOString(),
    ...(normalizeLabel(input.serverName) ? { serverName: normalizeLabel(input.serverName) } : {}),
    ...(normalizeLabel(input.characterName) ? { characterName: normalizeLabel(input.characterName) } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeSnapshot(input: MhxyPriceSnapshotInput): MhxyPriceSnapshot {
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  if (!input.capturedAt || Number.isNaN(Date.parse(input.capturedAt))) throw new Error("快照时间无效");
  let rmbUnitPrice: number;
  if (input.currency === "gameCoin") {
    if (!input.rmbPerGameCoinWan || input.rmbPerGameCoinWan <= 0) {
      throw new Error("游戏币价格快照必须填写大于 0 的兑换比例");
    }
    if (input.gameCoinUnitPriceWan === undefined) throw new Error("游戏币单价不能为空");
    assertFiniteNonNegative(input.gameCoinUnitPriceWan, "游戏币单价");
    rmbUnitPrice = roundRmb(input.gameCoinUnitPriceWan * input.rmbPerGameCoinWan);
  } else {
    if (input.rmbUnitPrice === undefined) throw new Error("人民币单价不能为空");
    assertFiniteNonNegative(input.rmbUnitPrice, "人民币单价");
    rmbUnitPrice = roundRmb(input.rmbUnitPrice);
  }
  const timestamp = nowIso();
  return {
    ...input,
    id: randomUUID(),
    itemName,
    rmbUnitPrice,
    capturedAt: new Date(input.capturedAt).toISOString(),
    ...(normalizeLabel(input.serverName) ? { serverName: normalizeLabel(input.serverName) } : {}),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeTransfer(
  input: MhxyInventoryTransferInput,
  existing?: MhxyInventoryTransferRecord
): MhxyInventoryTransferRecord {
  if (!input.itemName.trim()) throw new Error("道具名不能为空");
  assertPositiveInteger(input.quantity);
  assertFiniteNonNegative(input.transferCostRmb, "转移成本");
  for (const [value, name] of [
    [input.sourceServerName, "源区服"],
    [input.sourceCharacterName, "源角色"],
    [input.targetServerName, "目标区服"],
    [input.targetCharacterName, "目标角色"]
  ] as const) {
    if (!value.trim()) throw new Error(`${name}不能为空`);
  }
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) throw new Error("发生时间无效");
  const timestamp = nowIso();
  return {
    ...input,
    itemName: input.itemName.trim(),
    sourceServerName: input.sourceServerName.trim(),
    sourceCharacterName: input.sourceCharacterName.trim(),
    targetServerName: input.targetServerName.trim(),
    targetCharacterName: input.targetCharacterName.trim(),
    transferCostRmb: roundRmb(input.transferCostRmb),
    occurredAt: new Date(input.occurredAt).toISOString(),
    id: existing?.id ?? randomUUID(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function replay(
  trades: MhxyTradeRecord[],
  transfers: MhxyInventoryTransferRecord[]
): { inventory: Map<string, MhxyInventoryPosition>; tradeResults: MhxyTradeResult[] } {
  const inventory = new Map<string, MhxyInventoryPosition>();
  const tradeResults: MhxyTradeResult[] = [];
  const events: ReplayEvent[] = [
    ...trades.map((record): ReplayEvent => ({ kind: "trade", record })),
    ...transfers.map((record): ReplayEvent => ({ kind: "transfer", record }))
  ].sort((left, right) => {
    const date = left.record.occurredAt.localeCompare(right.record.occurredAt);
    if (date !== 0) return date;
    const created = left.record.createdAt.localeCompare(right.record.createdAt);
    return created !== 0 ? created : left.record.id.localeCompare(right.record.id);
  });

  const getPosition = (itemName: string, serverName?: string, characterName?: string) => {
    const key = inventoryKey(itemName, serverName, characterName);
    const current = inventory.get(key);
    if (current) return current;
    const created: MhxyInventoryPosition = {
      itemName,
      serverName: normalizeLabel(serverName),
      characterName: normalizeLabel(characterName),
      quantity: 0,
      inventoryCostRmb: 0,
      averageUnitCostRmb: 0,
      expectedSellServerName: normalizeLabel(serverName),
      latestRmbUnitPrice: null,
      marketValueRmb: null,
      unrealizedProfitRmb: null
    };
    inventory.set(key, created);
    return created;
  };

  const remove = (position: MhxyInventoryPosition, quantity: number, label: string) => {
    if (position.quantity < quantity) throw new Error(`库存不足：${label}`);
    const cost = roundRmb(position.averageUnitCostRmb * quantity);
    position.quantity -= quantity;
    position.inventoryCostRmb = roundRmb(position.inventoryCostRmb - cost);
    position.averageUnitCostRmb =
      position.quantity > 0 ? roundRmb(position.inventoryCostRmb / position.quantity) : 0;
    return cost;
  };

  for (const event of events) {
    if (event.kind === "trade") {
      const trade = event.record;
      const position = getPosition(trade.itemName, trade.serverName, trade.characterName);
      if (trade.type === "buy") {
        position.quantity += trade.quantity;
        position.inventoryCostRmb = roundRmb(position.inventoryCostRmb + trade.rmbAmount + trade.feeRmb);
        position.averageUnitCostRmb = roundRmb(position.inventoryCostRmb / position.quantity);
      } else {
        const costBasisRmb = remove(position, trade.quantity, `${trade.itemName} ${trade.serverName ?? ""}`);
        const netIncomeRmb = roundRmb(trade.rmbAmount - trade.feeRmb);
        tradeResults.push({
          tradeId: trade.id,
          costBasisRmb,
          netIncomeRmb,
          realizedProfitRmb: roundRmb(netIncomeRmb - costBasisRmb)
        });
      }
      continue;
    }

    const transfer = event.record;
    const source = getPosition(
      transfer.itemName,
      transfer.sourceServerName,
      transfer.sourceCharacterName
    );
    const movedCost = remove(source, transfer.quantity, `${transfer.itemName} ${transfer.sourceServerName}`);
    const target = getPosition(
      transfer.itemName,
      transfer.targetServerName,
      transfer.targetCharacterName
    );
    target.quantity += transfer.quantity;
    target.inventoryCostRmb = roundRmb(target.inventoryCostRmb + movedCost + transfer.transferCostRmb);
    target.averageUnitCostRmb = roundRmb(target.inventoryCostRmb / target.quantity);
  }

  return { inventory, tradeResults };
}

export function createMhxyService(dataDir: string) {
  const repository = createMhxyRepository(dataDir);

  function validateHistory(trades: MhxyTradeRecord[], transfers: MhxyInventoryTransferRecord[]) {
    replay(trades, transfers);
  }

  function getDashboard(): MhxyDashboard {
    const trades = repository.readTrades();
    const priceSnapshots = repository.readPriceSnapshots();
    const inventoryTransfers = repository.readInventoryTransfers();
    const inventoryTargets = repository.readInventoryTargets();
    const gameCoinPurchases = repository.readGameCoinPurchases();
    const assetReplay = replayAssetFlips(repository.readAssetFlips(), gameCoinPurchases);
    const assetFlips = assetReplay.records
      .sort((left, right) => {
        const buyAt = right.buyAt.localeCompare(left.buyAt);
        return buyAt !== 0 ? buyAt : right.createdAt.localeCompare(left.createdAt);
      });
    const gameCoinPurchasePositions = assetReplay.purchases.sort((left, right) =>
      right.acquiredAt.localeCompare(left.acquiredAt)
    );
    const replayed = replay(trades, inventoryTransfers);
    const targets = new Map(
      inventoryTargets.map((target) => [
        inventoryKey(target.itemName, target.serverName, target.characterName),
        target.expectedSellServerName
      ])
    );
    const inventory = [...replayed.inventory.entries()]
      .filter(([, position]) => position.quantity > 0)
      .map(([key, position]) => {
        const expectedSellServerName = targets.get(key) ?? position.serverName;
        const latest = priceSnapshots
          .filter(
            (snapshot) =>
              snapshot.itemName === position.itemName &&
              normalizeLabel(snapshot.serverName) === expectedSellServerName
          )
          .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
        return {
          ...position,
          expectedSellServerName,
          latestRmbUnitPrice: latest?.rmbUnitPrice ?? null,
          marketValueRmb: latest ? roundRmb(position.quantity * latest.rmbUnitPrice) : null,
          unrealizedProfitRmb: latest
            ? roundRmb(position.quantity * latest.rmbUnitPrice - position.inventoryCostRmb)
            : null
        };
      });
    return {
      trades: [...trades].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      tradeResults: replayed.tradeResults,
      priceSnapshots: [...priceSnapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
      inventoryTransfers: [...inventoryTransfers].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      inventoryTargets,
      inventory,
      summary: {
        inventoryCostRmb: roundRmb(inventory.reduce((sum, item) => sum + item.inventoryCostRmb, 0)),
        realizedProfitRmb: roundRmb(
          replayed.tradeResults.reduce((sum, item) => sum + item.realizedProfitRmb, 0)
        ),
        marketValueRmb: roundRmb(
          inventory.reduce((sum, item) => sum + (item.marketValueRmb ?? 0), 0)
        ),
        unrealizedProfitRmb: roundRmb(
          inventory.reduce((sum, item) => sum + (item.unrealizedProfitRmb ?? 0), 0)
        ),
        pendingValuationCount: inventory.filter((item) => item.marketValueRmb === null).length
      },
      assetFlips,
      assetFlipSummary: summarizeAssetFlips(assetFlips),
      gameCoinPurchases: gameCoinPurchasePositions,
      gameCoinBalance: {
        gameCoinAmount: gameCoinPurchasePositions.reduce(
          (sum, item) => sum + item.remainingGameCoinAmount,
          0
        ),
        rmbCost: roundRmb(
          gameCoinPurchasePositions.reduce((sum, item) => sum + item.remainingRmbCost, 0)
        )
      }
    };
  }

  return {
    getDashboard,
    createTrade(input: MhxyTradeInput) {
      const record = normalizeTrade(input);
      const next = [...repository.readTrades(), record];
      validateHistory(next, repository.readInventoryTransfers());
      repository.writeTrades(next);
      return record;
    },
    updateTrade(id: string, patch: Partial<MhxyTradeInput>) {
      const trades = repository.readTrades();
      const existing = trades.find((record) => record.id === id);
      if (!existing) throw new Error("交易记录不存在");
      const record = normalizeTrade({ ...existing, ...patch }, existing);
      const next = trades.map((item) => (item.id === id ? record : item));
      validateHistory(next, repository.readInventoryTransfers());
      repository.writeTrades(next);
      return record;
    },
    createPriceSnapshot(input: MhxyPriceSnapshotInput) {
      const record = normalizeSnapshot(input);
      repository.writePriceSnapshots([...repository.readPriceSnapshots(), record]);
      return record;
    },
    createInventoryTransfer(input: MhxyInventoryTransferInput) {
      const record = normalizeTransfer(input);
      const next = [...repository.readInventoryTransfers(), record];
      validateHistory(repository.readTrades(), next);
      repository.writeInventoryTransfers(next);
      return record;
    },
    updateInventoryTransfer(id: string, patch: Partial<MhxyInventoryTransferInput>) {
      const transfers = repository.readInventoryTransfers();
      const existing = transfers.find((record) => record.id === id);
      if (!existing) throw new Error("库存转移记录不存在");
      const record = normalizeTransfer({ ...existing, ...patch }, existing);
      const next = transfers.map((item) => (item.id === id ? record : item));
      validateHistory(repository.readTrades(), next);
      repository.writeInventoryTransfers(next);
      return record;
    },
    setInventoryTarget(input: Omit<MhxyInventoryTarget, "updatedAt">) {
      if (!input.itemName.trim() || !input.expectedSellServerName.trim()) {
        throw new Error("道具名和预期卖出区服不能为空");
      }
      const record: MhxyInventoryTarget = {
        ...input,
        itemName: input.itemName.trim(),
        serverName: input.serverName.trim(),
        characterName: input.characterName.trim(),
        expectedSellServerName: input.expectedSellServerName.trim(),
        updatedAt: nowIso()
      };
      const key = inventoryKey(record.itemName, record.serverName, record.characterName);
      repository.writeInventoryTargets([
        ...repository
          .readInventoryTargets()
          .filter((target) => inventoryKey(target.itemName, target.serverName, target.characterName) !== key),
        record
      ]);
      return record;
    },
    createAssetFlip(input: MhxyAssetFlipInput) {
      const record = normalizeAssetFlip(input);
      const replayed = replayAssetFlips(
        [...repository.readAssetFlips(), record],
        repository.readGameCoinPurchases()
      );
      repository.writeAssetFlips(replayed.records);
      return replayed.records.find((item) => item.id === record.id) as MhxyAssetFlipRecord;
    },
    updateAssetFlip(id: string, patch: Partial<MhxyAssetFlipInput>) {
      const records = repository.readAssetFlips();
      const existing = records.find((record) => record.id === id);
      if (!existing) throw new Error("召唤兽装备记录不存在");
      const record = normalizeAssetFlip({ ...existing, ...patch }, existing);
      const replayed = replayAssetFlips(
        records.map((item) => (item.id === id ? record : item)),
        repository.readGameCoinPurchases()
      );
      repository.writeAssetFlips(replayed.records);
      return replayed.records.find((item) => item.id === id) as MhxyAssetFlipRecord;
    },
    createGameCoinPurchase(input: MhxyGameCoinPurchaseInput) {
      const record = normalizeGameCoinPurchase(input);
      const purchases = [...repository.readGameCoinPurchases(), record];
      const replayed = replayAssetFlips(repository.readAssetFlips(), purchases);
      repository.writeGameCoinPurchases(purchases);
      repository.writeAssetFlips(replayed.records);
      return record;
    },
    updateGameCoinPurchase(id: string, patch: Partial<MhxyGameCoinPurchaseInput>) {
      const purchases = repository.readGameCoinPurchases();
      const existing = purchases.find((record) => record.id === id);
      if (!existing) throw new Error("游戏币购入批次不存在");
      const record = normalizeGameCoinPurchase({ ...existing, ...patch }, existing);
      const next = purchases.map((item) => (item.id === id ? record : item));
      const replayed = replayAssetFlips(repository.readAssetFlips(), next);
      repository.writeGameCoinPurchases(next);
      repository.writeAssetFlips(replayed.records);
      return record;
    }
  };
}
