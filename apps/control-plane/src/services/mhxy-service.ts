import { randomUUID } from "node:crypto";

import type {
  MhxyAssetFlipInput,
  MhxyAssetFlipRecord,
  MhxyAssetFlipSummary,
  MhxyDataSet,
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

const toRmbCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromRmbCents = (value: number) => value / 100;
const roundRmb = (value: number) => fromRmbCents(toRmbCents(value));
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
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name}必须是大于 0 的安全整数`);
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
  if (input.category !== "role" && input.category !== "summon" && input.category !== "equipment") {
    throw new Error("资产类型必须是角色、召唤兽或装备");
  }
  const name = input.name.trim();
  if (!name) throw new Error("名称不能为空");
  if (!input.buyAt || Number.isNaN(Date.parse(input.buyAt))) throw new Error("买入时间无效");
  const purchaseCurrency = input.purchaseCurrency ?? existing?.purchaseCurrency ?? "rmb";
  if (purchaseCurrency !== "rmb" && purchaseCurrency !== "gameCoin") {
    throw new Error("买入方式必须是人民币或游戏币库存");
  }
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
  const buyAt = new Date(input.buyAt).toISOString();
  const sellAt = hasSellAt ? normalizeOptionalDate(input.sellAt, "卖出时间") : undefined;
  if (sellAt && sellAt < buyAt) throw new Error("卖出时间不能早于买入时间");
  const preservedGameCoinAllocations =
    purchaseCurrency === "gameCoin" &&
    existing?.purchaseCurrency === "gameCoin" &&
    existing.buyAt === buyAt &&
    existing.gameCoinCost === input.gameCoinCost
      ? existing.gameCoinAllocations
      : undefined;

  const buyPriceRmb = purchaseCurrency === "rmb" ? roundRmb(input.buyPriceRmb as number) : 0;
  const sellPriceRmb = hasSellPrice ? roundRmb(input.sellPriceRmb as number) : undefined;
  const timestamp = nowIso();
  const status = hasSellPrice ? "sold" : "holding";

  return {
    id: existing?.id ?? randomUUID(),
    category: input.category,
    name,
    buyAt,
    purchaseCurrency,
    buyPriceRmb,
    ...(purchaseCurrency === "gameCoin" ? { gameCoinCost: input.gameCoinCost } : {}),
    ...(preservedGameCoinAllocations?.length
      ? { gameCoinAllocations: preservedGameCoinAllocations.map((allocation) => ({ ...allocation })) }
      : {}),
    ...(sellAt ? { sellAt } : {}),
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
  const orderedPurchases = [...purchases].sort((left, right) => {
    const acquiredAt = left.acquiredAt.localeCompare(right.acquiredAt);
    if (acquiredAt !== 0) return acquiredAt;
    const createdAt = left.createdAt.localeCompare(right.createdAt);
    return createdAt !== 0 ? createdAt : left.id.localeCompare(right.id);
  });
  const purchaseById = new Map(orderedPurchases.map((purchase) => [purchase.id, purchase]));
  const remainingGameCoin = new Map(
    orderedPurchases.map((purchase) => [purchase.id, purchase.gameCoinAmount])
  );
  const remainingRmbCents = new Map(
    orderedPurchases.map((purchase) => [purchase.id, toRmbCents(purchase.rmbCost)])
  );
  const orderedRecords = [...records]
    .map((record) => ({ ...record, purchaseCurrency: record.purchaseCurrency ?? "rmb" }))
    .sort((left, right) => {
      const buyAt = left.buyAt.localeCompare(right.buyAt);
      if (buyAt !== 0) return buyAt;
      const createdAt = left.createdAt.localeCompare(right.createdAt);
      return createdAt !== 0 ? createdAt : left.id.localeCompare(right.id);
    });

  function consume(purchaseId: string, amount: number, buyAt: string) {
    const purchase = purchaseById.get(purchaseId);
    if (!purchase) throw new Error(`游戏币批次不存在：${purchaseId}`);
    if (purchase.acquiredAt > buyAt) throw new Error("资产不能使用买入时间之后购入的游戏币");
    const available = remainingGameCoin.get(purchaseId) ?? 0;
    const availableCents = remainingRmbCents.get(purchaseId) ?? 0;
    if (amount > available) throw new Error(`游戏币批次余额不足：${purchaseId}`);
    const costCents = amount === available
      ? availableCents
      : Math.round(availableCents * amount / available);
    remainingGameCoin.set(purchaseId, available - amount);
    remainingRmbCents.set(purchaseId, availableCents - costCents);
    return costCents;
  }

  const recalculatedById = new Map<string, MhxyAssetFlipRecord>();

  // Existing allocation IDs are historical facts. Reserve them before allocating new or edited records.
  for (const record of orderedRecords) {
    if (record.purchaseCurrency !== "gameCoin" || !record.gameCoinAllocations?.length) continue;
    const gameCoinCost = record.gameCoinCost ?? 0;
    assertPositiveInteger(gameCoinCost, "游戏币花费");
    const allocatedGameCoin = record.gameCoinAllocations.reduce(
      (sum, allocation) => sum + allocation.gameCoinAmount,
      0
    );
    if (allocatedGameCoin !== gameCoinCost) throw new Error(`游戏币批次分配不完整：${record.name}`);
    let buyCostCents = 0;
    const allocations = record.gameCoinAllocations.map((allocation) => {
      assertPositiveInteger(allocation.gameCoinAmount, "批次分配游戏币数量");
      const costCents = consume(allocation.gameCoinPurchaseId, allocation.gameCoinAmount, record.buyAt);
      buyCostCents += costCents;
      return { ...allocation, rmbCost: fromRmbCents(costCents) };
    });
    const buyPriceRmb = fromRmbCents(buyCostCents);
    recalculatedById.set(record.id, {
      ...record,
      purchaseCurrency: "gameCoin",
      gameCoinCost,
      buyPriceRmb,
      gameCoinAllocations: allocations,
      profitRmb:
        record.sellPriceRmb === undefined ? null : roundRmb(record.sellPriceRmb - buyPriceRmb)
    });
  }

  for (const record of orderedRecords) {
    if (recalculatedById.has(record.id)) continue;
    if (record.purchaseCurrency !== "gameCoin") {
      recalculatedById.set(record.id, {
        ...record,
        purchaseCurrency: "rmb",
        profitRmb:
          record.sellPriceRmb === undefined
            ? null
            : roundRmb(record.sellPriceRmb - record.buyPriceRmb),
        gameCoinCost: undefined,
        gameCoinAllocations: undefined
      });
      continue;
    }

    const gameCoinCost = record.gameCoinCost ?? 0;
    assertPositiveInteger(gameCoinCost, "游戏币花费");
    let needed = gameCoinCost;
    let buyCostCents = 0;
    const allocations = [] as NonNullable<MhxyAssetFlipRecord["gameCoinAllocations"]>;
    for (const purchase of orderedPurchases) {
      if (purchase.acquiredAt > record.buyAt || needed === 0) continue;
      const available = remainingGameCoin.get(purchase.id) ?? 0;
      if (available <= 0) continue;
      const used = Math.min(available, needed);
      const costCents = consume(purchase.id, used, record.buyAt);
      allocations.push({
        gameCoinPurchaseId: purchase.id,
        gameCoinAmount: used,
        rmbCost: fromRmbCents(costCents)
      });
      buyCostCents += costCents;
      needed -= used;
    }
    if (needed > 0) {
      throw new Error(`游戏币余额不足：${record.name} 需要 ${gameCoinCost}，买入时缺少 ${needed}`);
    }
    const buyPriceRmb = fromRmbCents(buyCostCents);
    recalculatedById.set(record.id, {
      ...record,
      purchaseCurrency: "gameCoin",
      gameCoinCost,
      buyPriceRmb,
      gameCoinAllocations: allocations,
      profitRmb:
        record.sellPriceRmb === undefined ? null : roundRmb(record.sellPriceRmb - buyPriceRmb)
    });
  }

  const recalculated = orderedRecords.map((record) => recalculatedById.get(record.id) as MhxyAssetFlipRecord);

  return {
    records: recalculated,
    purchases: orderedPurchases.map((purchase) => {
      const remainingGameCoinAmount = remainingGameCoin.get(purchase.id) ?? 0;
      return {
        ...purchase,
        remainingGameCoinAmount,
        remainingRmbCost: fromRmbCents(remainingRmbCents.get(purchase.id) ?? 0)
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
  if (input.type !== "buy" && input.type !== "sell") throw new Error("交易类型必须是买入或卖出");
  if (input.currency !== "rmb" && input.currency !== "gameCoin") {
    throw new Error("交易币种必须是人民币或游戏币");
  }
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  assertPositiveInteger(input.quantity);
  assertFiniteNonNegative(input.unitPrice, "单价");
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) throw new Error("发生时间无效");

  const rmbAmount =
    input.currency === "gameCoin"
      ? (() => {
          if (!Number.isFinite(input.rmbPerGameCoinWan) || (input.rmbPerGameCoinWan ?? 0) <= 0) {
            throw new Error("游戏币交易必须填写大于 0 的兑换比例");
          }
          return roundRmb(input.quantity * input.unitPrice * (input.rmbPerGameCoinWan as number));
        })()
      : roundRmb(input.quantity * input.unitPrice);
  if (!Number.isFinite(rmbAmount)) throw new Error("折算人民币金额超出有效范围");
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

function normalizeSnapshot(
  input: MhxyPriceSnapshotInput,
  existing?: MhxyPriceSnapshot
): MhxyPriceSnapshot {
  if (input.currency !== "rmb" && input.currency !== "gameCoin") {
    throw new Error("快照币种必须是人民币或游戏币");
  }
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  if (!input.capturedAt || Number.isNaN(Date.parse(input.capturedAt))) throw new Error("快照时间无效");
  let rmbUnitPrice: number;
  if (input.currency === "gameCoin") {
    if (!Number.isFinite(input.rmbPerGameCoinWan) || input.rmbPerGameCoinWan <= 0) {
      throw new Error("游戏币价格快照必须填写大于 0 的当时兑换比例");
    }
    if (!Number.isFinite(input.gameCoinUnitPriceWan)) throw new Error("游戏币单价必须是有效数字");
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
    id: existing?.id ?? randomUUID(),
    itemName,
    rmbUnitPrice,
    capturedAt: new Date(input.capturedAt).toISOString(),
    ...(normalizeLabel(input.serverName) ? { serverName: normalizeLabel(input.serverName) } : {}),
    createdAt: existing?.createdAt ?? timestamp,
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
  if (
    input.sourceServerName.trim() === input.targetServerName.trim() &&
    input.sourceCharacterName.trim() === input.targetCharacterName.trim()
  ) {
    throw new Error("源库存和目标库存不能相同");
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

function normalizeInventoryTarget(
  input: Omit<MhxyInventoryTarget, "updatedAt">,
  updatedAt = nowIso()
): MhxyInventoryTarget {
  if (!input.itemName.trim() || !input.expectedSellServerName.trim()) {
    throw new Error("道具名和预期卖出区服不能为空");
  }
  return {
    itemName: input.itemName.trim(),
    serverName: input.serverName.trim(),
    characterName: input.characterName.trim(),
    expectedSellServerName: input.expectedSellServerName.trim(),
    updatedAt
  };
}

interface InventoryAccumulator {
  itemName: string;
  serverName: string;
  characterName: string;
  quantity: number;
  inventoryCostCents: number;
}

function replay(
  trades: MhxyTradeRecord[],
  transfers: MhxyInventoryTransferRecord[]
): { inventory: Map<string, InventoryAccumulator>; tradeResults: MhxyTradeResult[] } {
  const inventory = new Map<string, InventoryAccumulator>();
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
    const created: InventoryAccumulator = {
      itemName,
      serverName: normalizeLabel(serverName),
      characterName: normalizeLabel(characterName),
      quantity: 0,
      inventoryCostCents: 0
    };
    inventory.set(key, created);
    return created;
  };

  const remove = (position: InventoryAccumulator, quantity: number, label: string) => {
    if (position.quantity < quantity) throw new Error(`库存不足：${label}`);
    const costCents = quantity === position.quantity
      ? position.inventoryCostCents
      : Math.round(position.inventoryCostCents * quantity / position.quantity);
    position.quantity -= quantity;
    position.inventoryCostCents -= costCents;
    return costCents;
  };

  for (const event of events) {
    if (event.kind === "trade") {
      const trade = event.record;
      const position = getPosition(trade.itemName, trade.serverName, trade.characterName);
      if (trade.type === "buy") {
        position.quantity += trade.quantity;
        position.inventoryCostCents += toRmbCents(trade.rmbAmount) + toRmbCents(trade.feeRmb);
      } else {
        const costBasisRmb = fromRmbCents(
          remove(position, trade.quantity, `${trade.itemName} ${trade.serverName ?? ""}`)
        );
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
    const movedCostCents = remove(
      source,
      transfer.quantity,
      `${transfer.itemName} ${transfer.sourceServerName}`
    );
    const target = getPosition(
      transfer.itemName,
      transfer.targetServerName,
      transfer.targetCharacterName
    );
    target.quantity += transfer.quantity;
    target.inventoryCostCents += movedCostCents + toRmbCents(transfer.transferCostRmb);
  }

  return { inventory, tradeResults };
}

function assertRecordMetadata(
  record: { id?: unknown; createdAt?: unknown; updatedAt?: unknown },
  label: string
) {
  if (typeof record.id !== "string" || !record.id) throw new Error(`${label}缺少有效 ID`);
  for (const [value, name] of [
    [record.createdAt, "创建时间"],
    [record.updatedAt, "更新时间"]
  ] as const) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new Error(`${label}${name}无效`);
    }
  }
}

function normalizeDataSet(input: MhxyDataSet): MhxyDataSet {
  for (const [records, label] of [
    [input.trades, "交易记录"],
    [input.priceSnapshots, "价格快照"],
    [input.inventoryTransfers, "库存转移"],
    [input.inventoryTargets, "库存目标"],
    [input.assetFlips, "资产记录"],
    [input.gameCoinPurchases, "游戏币购入记录"]
  ] as const) {
    if (!Array.isArray(records)) throw new Error(`${label}必须是数组`);
  }

  const trades = input.trades.map((record) => {
    assertRecordMetadata(record, "交易记录");
    const normalized = normalizeTrade(record, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  const priceSnapshots = input.priceSnapshots.map((record) => {
    assertRecordMetadata(record, "价格快照");
    const snapshotInput: MhxyPriceSnapshotInput = record.currency === "gameCoin"
      ? {
          itemName: record.itemName,
          currency: "gameCoin",
          gameCoinUnitPriceWan: record.gameCoinUnitPriceWan,
          rmbPerGameCoinWan: record.rmbPerGameCoinWan,
          capturedAt: record.capturedAt,
          serverName: record.serverName,
          note: record.note
        }
      : {
          itemName: record.itemName,
          currency: "rmb",
          rmbUnitPrice: record.rmbUnitPrice,
          capturedAt: record.capturedAt,
          serverName: record.serverName,
          note: record.note
        };
    const normalized = normalizeSnapshot(snapshotInput, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  const inventoryTransfers = input.inventoryTransfers.map((record) => {
    assertRecordMetadata(record, "库存转移记录");
    const normalized = normalizeTransfer(record, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  const inventoryTargets = input.inventoryTargets.map((record) => {
    if (!record.updatedAt || Number.isNaN(Date.parse(record.updatedAt))) {
      throw new Error("库存目标更新时间无效");
    }
    return normalizeInventoryTarget(record, record.updatedAt);
  });
  const gameCoinPurchases = input.gameCoinPurchases.map((record) => {
    assertRecordMetadata(record, "游戏币购入记录");
    const normalized = normalizeGameCoinPurchase(record, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  const assetFlips = input.assetFlips.map((record) => {
    assertRecordMetadata(record, "资产记录");
    const normalized = normalizeAssetFlip(record, record);
    const allocations = record.gameCoinAllocations?.map((allocation) => {
      if (typeof allocation.gameCoinPurchaseId !== "string" || !allocation.gameCoinPurchaseId) {
        throw new Error(`游戏币批次分配 ID 无效：${record.name}`);
      }
      assertPositiveInteger(allocation.gameCoinAmount, "批次分配游戏币数量");
      return { ...allocation, rmbCost: roundRmb(allocation.rmbCost) };
    });
    return {
      ...normalized,
      ...(normalized.purchaseCurrency === "gameCoin" && allocations?.length
        ? { gameCoinAllocations: allocations }
        : {}),
      updatedAt: record.updatedAt
    };
  });

  replay(trades, inventoryTransfers);
  const assetReplay = replayAssetFlips(assetFlips, gameCoinPurchases);
  return {
    trades,
    priceSnapshots,
    inventoryTransfers,
    inventoryTargets,
    assetFlips: assetReplay.records,
    gameCoinPurchases
  };
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
        const inventoryCostRmb = fromRmbCents(position.inventoryCostCents);
        const averageUnitCostRmb = roundRmb(inventoryCostRmb / position.quantity);
        const latest = priceSnapshots
          .filter(
            (snapshot) =>
              snapshot.itemName === position.itemName &&
              normalizeLabel(snapshot.serverName) === expectedSellServerName
          )
          .sort((left, right) => {
            const capturedAt = right.capturedAt.localeCompare(left.capturedAt);
            if (capturedAt !== 0) return capturedAt;
            const createdAt = right.createdAt.localeCompare(left.createdAt);
            return createdAt !== 0 ? createdAt : right.id.localeCompare(left.id);
          })[0];
        return {
          itemName: position.itemName,
          serverName: position.serverName,
          characterName: position.characterName,
          quantity: position.quantity,
          inventoryCostRmb,
          averageUnitCostRmb,
          expectedSellServerName,
          latestRmbUnitPrice: latest?.rmbUnitPrice ?? null,
          marketValueRmb: latest ? roundRmb(position.quantity * latest.rmbUnitPrice) : null,
          unrealizedProfitRmb: latest
            ? roundRmb(position.quantity * latest.rmbUnitPrice - inventoryCostRmb)
            : null
        } satisfies MhxyInventoryPosition;
      });
    const summary = {
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
    };
    const assetFlipSummary = summarizeAssetFlips(assetFlips);
    const gameCoinBalance = {
      gameCoinAmount: gameCoinPurchasePositions.reduce(
        (sum, item) => sum + item.remainingGameCoinAmount,
        0
      ),
      rmbCost: roundRmb(
        gameCoinPurchasePositions.reduce((sum, item) => sum + item.remainingRmbCost, 0)
      )
    };
    return {
      trades: [...trades].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      tradeResults: replayed.tradeResults,
      priceSnapshots: [...priceSnapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
      inventoryTransfers: [...inventoryTransfers].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      inventoryTargets,
      inventory,
      summary,
      assetFlips,
      assetFlipSummary,
      gameCoinPurchases: gameCoinPurchasePositions,
      gameCoinBalance,
      combinedSummary: {
        holdingCostRmb: roundRmb(
          summary.inventoryCostRmb + assetFlipSummary.holdingCostRmb + gameCoinBalance.rmbCost
        ),
        realizedProfitRmb: roundRmb(
          summary.realizedProfitRmb + assetFlipSummary.realizedProfitRmb
        ),
        gameCoinBalanceCostRmb: gameCoinBalance.rmbCost,
        mainLedgerMarketValueRmb: summary.marketValueRmb,
        mainLedgerUnrealizedProfitRmb: summary.unrealizedProfitRmb
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
    deleteTrade(id: string) {
      const trades = repository.readTrades();
      if (!trades.some((record) => record.id === id)) throw new Error("交易记录不存在");
      const next = trades.filter((record) => record.id !== id);
      validateHistory(next, repository.readInventoryTransfers());
      repository.writeTrades(next);
      return { id };
    },
    createPriceSnapshot(input: MhxyPriceSnapshotInput) {
      const record = normalizeSnapshot(input);
      repository.writePriceSnapshots([...repository.readPriceSnapshots(), record]);
      return record;
    },
    deletePriceSnapshot(id: string) {
      const records = repository.readPriceSnapshots();
      if (!records.some((record) => record.id === id)) throw new Error("价格快照不存在");
      repository.writePriceSnapshots(records.filter((record) => record.id !== id));
      return { id };
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
    deleteInventoryTransfer(id: string) {
      const transfers = repository.readInventoryTransfers();
      if (!transfers.some((record) => record.id === id)) throw new Error("库存转移记录不存在");
      const next = transfers.filter((record) => record.id !== id);
      validateHistory(repository.readTrades(), next);
      repository.writeInventoryTransfers(next);
      return { id };
    },
    setInventoryTarget(input: Omit<MhxyInventoryTarget, "updatedAt">) {
      const record = normalizeInventoryTarget(input);
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
      if (!existing) throw new Error("资产记录不存在");
      const record = normalizeAssetFlip({ ...existing, ...patch }, existing);
      const replayed = replayAssetFlips(
        records.map((item) => (item.id === id ? record : item)),
        repository.readGameCoinPurchases()
      );
      repository.writeAssetFlips(replayed.records);
      return replayed.records.find((item) => item.id === id) as MhxyAssetFlipRecord;
    },
    deleteAssetFlip(id: string) {
      const records = repository.readAssetFlips();
      if (!records.some((record) => record.id === id)) throw new Error("资产记录不存在");
      const replayed = replayAssetFlips(
        records.filter((record) => record.id !== id),
        repository.readGameCoinPurchases()
      );
      repository.writeAssetFlips(replayed.records);
      return { id };
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
    },
    deleteGameCoinPurchase(id: string) {
      const purchases = repository.readGameCoinPurchases();
      if (!purchases.some((record) => record.id === id)) throw new Error("游戏币购入批次不存在");
      const next = purchases.filter((record) => record.id !== id);
      const replayed = replayAssetFlips(repository.readAssetFlips(), next);
      repository.writeGameCoinPurchases(next);
      repository.writeAssetFlips(replayed.records);
      return { id };
    },
    replaceAllData(input: MhxyDataSet) {
      const next = normalizeDataSet(input);
      const current: MhxyDataSet = {
        trades: repository.readTrades(),
        priceSnapshots: repository.readPriceSnapshots(),
        inventoryTransfers: repository.readInventoryTransfers(),
        inventoryTargets: repository.readInventoryTargets(),
        assetFlips: repository.readAssetFlips(),
        gameCoinPurchases: repository.readGameCoinPurchases()
      };
      try {
        repository.writeTrades(next.trades);
        repository.writePriceSnapshots(next.priceSnapshots);
        repository.writeInventoryTransfers(next.inventoryTransfers);
        repository.writeInventoryTargets(next.inventoryTargets);
        repository.writeAssetFlips(next.assetFlips);
        repository.writeGameCoinPurchases(next.gameCoinPurchases);
      } catch (error) {
        repository.writeTrades(current.trades);
        repository.writePriceSnapshots(current.priceSnapshots);
        repository.writeInventoryTransfers(current.inventoryTransfers);
        repository.writeInventoryTargets(current.inventoryTargets);
        repository.writeAssetFlips(current.assetFlips);
        repository.writeGameCoinPurchases(current.gameCoinPurchases);
        throw error;
      }
      return getDashboard();
    }
  };
}
