import { randomUUID } from "node:crypto";

import type {
  MhxyAssetFlipInput,
  MhxyAssetFlipPatch,
  MhxyAssetFlipRecord,
  MhxyAssetFlipSummary,
  MhxyDataSet,
  MhxyDashboard,
  MhxyInventoryPosition,
  MhxyInventoryTarget,
  MhxyInventoryTransferInput,
  MhxyInventoryTransferPatch,
  MhxyInventoryTransferRecord,
  MhxyLegacyInventoryTransferRecord,
  MhxyPriceSeriesIdentity,
  MhxyPriceSeriesUpdateInput,
  MhxyPriceSeriesUpdateResult,
  MhxyPriceSnapshot,
  MhxyPriceSnapshotInput,
  MhxyRoleInventoryTransferRecord,
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
const roundRate = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const nowIso = () => new Date().toISOString();
const normalizeLabel = (value: string | undefined) => value?.trim() ?? "";
const inventoryKey = (itemName: string, serverName?: string, characterName?: string) =>
  JSON.stringify([itemName.trim(), normalizeLabel(serverName), normalizeLabel(characterName)]);

function assertFiniteNonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name}不能小于 0`);
}

function assertPositiveInteger(value: number, name = "数量") {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name}必须是大于 0 的安全整数`);
}

function normalizeOptionalDate(value: string | null | undefined, name: string) {
  if (value === undefined || value === null || value.trim() === "") return undefined;
  if (Number.isNaN(Date.parse(value))) throw new Error(`${name}无效`);
  return new Date(value).toISOString();
}

function normalizeAssetFlip(
  input: Omit<MhxyAssetFlipInput, "sellAt" | "sellPriceRmb"> & {
    sellAt?: string | null;
    sellPriceRmb?: number | null;
  },
  existing?: MhxyAssetFlipRecord
): MhxyAssetFlipRecord {
  if (input.category !== "role" && input.category !== "summon" && input.category !== "equipment") {
    throw new Error("资产类型必须是角色、召唤兽或装备");
  }
  const name = input.name.trim();
  if (!name) throw new Error("名称不能为空");
  if (!input.buyAt || Number.isNaN(Date.parse(input.buyAt))) throw new Error("买入时间无效");
  const purchaseCurrency = "rmb" as const;
  if (input.buyPriceRmb === undefined) throw new Error("人民币买入价格不能为空");
  assertFiniteNonNegative(input.buyPriceRmb, "买入价格");
  const hasSellAt = typeof input.sellAt === "string" && Boolean(input.sellAt.trim());
  const hasSellPrice = input.sellPriceRmb !== undefined && input.sellPriceRmb !== null;
  if (hasSellAt !== hasSellPrice) {
    throw new Error("卖出时间和卖出价格必须同时填写");
  }
  if (hasSellPrice) assertFiniteNonNegative(input.sellPriceRmb as number, "卖出价格");
  const serverName = normalizeLabel(input.serverName);
  if (!serverName) throw new Error("区服不能为空");
  const characterName = normalizeLabel(input.characterName);
  if (input.category !== "role" && !characterName) {
    throw new Error("装备和召唤兽必须填写归属角色");
  }
  const buyAt = new Date(input.buyAt).toISOString();
  const sellAt = hasSellAt ? normalizeOptionalDate(input.sellAt, "卖出时间") : undefined;
  if (sellAt && sellAt < buyAt) throw new Error("卖出时间不能早于买入时间");
  const buyPriceRmb = roundRmb(input.buyPriceRmb);
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
    ...(sellAt ? { sellAt } : {}),
    ...(sellPriceRmb !== undefined ? { sellPriceRmb } : {}),
    status,
    profitRmb: sellPriceRmb === undefined ? null : roundRmb(sellPriceRmb - buyPriceRmb),
    serverName,
    ...(input.category !== "role" && characterName
      ? { characterName }
      : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function recalculateAssetFlips(records: MhxyAssetFlipRecord[]): MhxyAssetFlipRecord[] {
  return records.map((record) => {
    const buyPriceRmb = roundRmb(record.buyPriceRmb);
    return {
      ...record,
      purchaseCurrency: "rmb",
      buyPriceRmb,
      profitRmb: record.sellPriceRmb === undefined ? null : roundRmb(record.sellPriceRmb - buyPriceRmb)
    };
  });
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

function normalizeTrade(
  input: MhxyTradeInput,
  existing?: MhxyTradeRecord,
  options: { preserveImportedRmbAmount?: boolean } = {}
): MhxyTradeRecord {
  if (input.type !== "buy" && input.type !== "sell") throw new Error("交易类型必须是买入或卖出");
  if (input.currency !== "rmb" && input.currency !== "gameCoin") {
    throw new Error("交易币种必须是人民币或游戏币");
  }
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  assertPositiveInteger(input.quantity);
  assertFiniteNonNegative(input.unitPrice, "单价");
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) throw new Error("发生时间无效");

  const occurredAt = new Date(input.occurredAt).toISOString();
  const serverName = normalizeLabel(input.serverName);
  const characterName = normalizeLabel(input.characterName);
  const accountingMode = input.currency === "rmb" ? "directRmb" : "legacyRate";
  const rmbPerGameCoinWan = input.currency === "gameCoin"
    ? input.rmbPerGameCoinWan ?? existing?.rmbPerGameCoinWan
    : undefined;
  const shouldPreserveImportedRmbAmount =
    options.preserveImportedRmbAmount === true &&
    input.currency === "gameCoin" &&
    rmbPerGameCoinWan === undefined &&
    existing?.rmbAmount !== null &&
    existing?.rmbAmount !== undefined &&
    Number.isFinite(existing.rmbAmount) &&
    existing.rmbAmount >= 0;
  const rmbAmount = input.currency === "rmb"
    ? roundRmb(input.quantity * input.unitPrice)
    : (() => {
        if (Number.isFinite(rmbPerGameCoinWan) && (rmbPerGameCoinWan ?? 0) > 0) {
          return roundRmb(input.quantity * input.unitPrice * (rmbPerGameCoinWan as number));
        }
        if (shouldPreserveImportedRmbAmount) return roundRmb(existing.rmbAmount as number);
        throw new Error("游戏币交易必须填写大于 0 的兑换比例");
      })();
  if (!Number.isFinite(rmbAmount)) throw new Error("折算人民币金额超出有效范围");
  const feeRmb = roundRmb(input.feeRmb ?? 0);
  assertFiniteNonNegative(feeRmb, "人民币手续费");
  const timestamp = nowIso();

  return {
    id: existing?.id ?? randomUUID(),
    type: input.type,
    itemName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currency: input.currency,
    accountingMode,
    rmbAmount,
    feeRmb,
    ...(input.currency === "gameCoin"
      ? {
          gameCoinAmountWan: input.quantity * input.unitPrice,
          rmbPerGameCoinWan
        }
      : {}),
    occurredAt,
    ...(serverName ? { serverName } : {}),
    ...(characterName ? { characterName } : {}),
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
  const { serverName, ...snapshotInput } = input;
  const normalizedServerName = normalizeLabel(serverName);
  const timestamp = nowIso();
  return {
    ...snapshotInput,
    id: existing?.id ?? randomUUID(),
    itemName,
    rmbUnitPrice,
    capturedAt: new Date(input.capturedAt).toISOString(),
    ...(normalizedServerName ? { serverName: normalizedServerName } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function isRoleTransfer(
  record: MhxyInventoryTransferRecord
): record is MhxyRoleInventoryTransferRecord {
  return "scope" in record && record.scope === "role";
}

function normalizeRoleTransfer(
  input: MhxyInventoryTransferInput,
  existing?: MhxyRoleInventoryTransferRecord
): MhxyRoleInventoryTransferRecord {
  if (input.scope !== "role") throw new Error("库存转移范围必须是角色");
  assertFiniteNonNegative(input.transferCostRmb, "转移成本");
  for (const [value, name] of [
    [input.characterName, "角色"],
    [input.sourceServerName, "源区服"],
    [input.targetServerName, "目标区服"]
  ] as const) {
    if (!value.trim()) throw new Error(`${name}不能为空`);
  }
  if (input.sourceServerName.trim() === input.targetServerName.trim()) {
    throw new Error("源区服和目标区服不能相同");
  }
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) throw new Error("发生时间无效");
  const timestamp = nowIso();
  return {
    scope: "role",
    characterName: input.characterName.trim(),
    sourceServerName: input.sourceServerName.trim(),
    targetServerName: input.targetServerName.trim(),
    transferCostRmb: roundRmb(input.transferCostRmb),
    occurredAt: new Date(input.occurredAt).toISOString(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    id: existing?.id ?? randomUUID(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeLegacyTransfer(
  input: MhxyLegacyInventoryTransferRecord,
  existing?: MhxyLegacyInventoryTransferRecord
): MhxyLegacyInventoryTransferRecord {
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
        position.inventoryCostCents += toRmbCents(trade.rmbAmount ?? 0) + toRmbCents(trade.feeRmb);
      } else {
        const costBasisRmb = fromRmbCents(
          remove(position, trade.quantity, `${trade.itemName} ${trade.serverName ?? ""}`)
        );
        const netIncomeRmb = roundRmb((trade.rmbAmount ?? 0) - trade.feeRmb);
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
    if (isRoleTransfer(transfer)) {
      const sourcePositions = [...inventory.values()].filter((position) =>
        position.quantity > 0 &&
        position.serverName === transfer.sourceServerName &&
        position.characterName === transfer.characterName
      );
      if (sourcePositions.length === 0) {
        throw new Error(`角色没有可转移库存：${transfer.sourceServerName}/${transfer.characterName}`);
      }
      for (const source of sourcePositions) {
        const target = getPosition(
          source.itemName,
          transfer.targetServerName,
          transfer.characterName
        );
        target.quantity += source.quantity;
        target.inventoryCostCents += source.inventoryCostCents;
        source.quantity = 0;
        source.inventoryCostCents = 0;
      }
      continue;
    }
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
    [input.assetFlips, "资产记录"]
  ] as const) {
    if (!Array.isArray(records)) throw new Error(`${label}必须是数组`);
  }

  const trades = input.trades.map((record) => {
    assertRecordMetadata(record, "交易记录");
    const normalized = normalizeTrade(record, record, { preserveImportedRmbAmount: true });
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
    const normalized = isRoleTransfer(record)
      ? normalizeRoleTransfer(record, record)
      : normalizeLegacyTransfer(record, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  const inventoryTargets = input.inventoryTargets.map((record) => {
    if (!record.updatedAt || Number.isNaN(Date.parse(record.updatedAt))) {
      throw new Error("库存目标更新时间无效");
    }
    return normalizeInventoryTarget(record, record.updatedAt);
  });
  const assetFlips = input.assetFlips.map((record) => {
    assertRecordMetadata(record, "资产记录");
    const normalized = normalizeAssetFlip(record, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  replay(trades, inventoryTransfers);

  return {
    trades,
    priceSnapshots,
    inventoryTransfers,
    inventoryTargets,
    assetFlips: recalculateAssetFlips(assetFlips)
  };
}

export function createMhxyService(dataDir: string, now: () => Date = () => new Date()) {
  const repository = createMhxyRepository(dataDir);

  function replayAll(
    trades = repository.readTrades(),
    transfers = repository.readInventoryTransfers(),
    assetRecords = repository.readAssetFlips()
  ) {
    return {
      assetRecords: recalculateAssetFlips(assetRecords),
      crossServer: replay(trades, transfers)
    };
  }

  function validateHistory(trades: MhxyTradeRecord[], transfers: MhxyInventoryTransferRecord[]) {
    return replayAll(trades, transfers);
  }

  function getDashboard(): MhxyDashboard {
    const trades = repository.readTrades();
    const priceSnapshots = repository.readPriceSnapshots();
    const inventoryTransfers = repository.readInventoryTransfers();
    const inventoryTargets = repository.readInventoryTargets();
    const assetRecords = repository.readAssetFlips();
    const asOf = now().toISOString();
    const occurred = (value: string) => value <= asOf;
    const currentAssetRecords = assetRecords
      .filter((record) => occurred(record.buyAt))
      .map((record) => {
        if (!record.sellAt || occurred(record.sellAt)) return record;
        const { sellAt: _sellAt, sellPriceRmb: _sellPriceRmb, ...holding } = record;
        return { ...holding, status: "holding" as const, profitRmb: null };
      });
    const replayed = replayAll(
      trades.filter((record) => occurred(record.occurredAt)),
      inventoryTransfers.filter((record) => occurred(record.occurredAt)),
      currentAssetRecords
    );
    const assetFlips = replayed.assetRecords
      .sort((left, right) => {
        const buyAt = right.buyAt.localeCompare(left.buyAt);
        return buyAt !== 0 ? buyAt : right.createdAt.localeCompare(left.createdAt);
      });
    const targets = new Map(
      inventoryTargets.map((target) => [
        inventoryKey(target.itemName, target.serverName, target.characterName),
        target.expectedSellServerName
      ])
    );
    const latestPriceByItem = new Map<string, MhxyPriceSnapshot>();
    const latestPriceByItemAndServer = new Map<string, MhxyPriceSnapshot>();
    const sortedPriceSnapshots = [...priceSnapshots].sort((left, right) => {
      const capturedAt = right.capturedAt.localeCompare(left.capturedAt);
      if (capturedAt !== 0) return capturedAt;
      const createdAt = right.createdAt.localeCompare(left.createdAt);
      return createdAt !== 0 ? createdAt : right.id.localeCompare(left.id);
    });
    for (const snapshot of sortedPriceSnapshots) {
      if (!latestPriceByItem.has(snapshot.itemName)) {
        latestPriceByItem.set(snapshot.itemName, snapshot);
      }
      const serverKey = JSON.stringify([snapshot.itemName, normalizeLabel(snapshot.serverName)]);
      if (!latestPriceByItemAndServer.has(serverKey)) {
        latestPriceByItemAndServer.set(serverKey, snapshot);
      }
    }
    const inventory = [...replayed.crossServer.inventory.entries()]
      .filter(([, position]) => position.quantity > 0)
      .map(([key, position]) => {
        const expectedSellServerName = targets.get(key) ?? position.serverName;
        const inventoryCostRmb = fromRmbCents(position.inventoryCostCents);
        const averageUnitCostRmb = roundRmb(inventoryCostRmb / position.quantity);
        const latest = latestPriceByItemAndServer.get(
          JSON.stringify([position.itemName, normalizeLabel(expectedSellServerName)])
        ) ?? latestPriceByItem.get(position.itemName);
        return {
          itemName: position.itemName,
          serverName: position.serverName,
          characterName: position.characterName,
          quantity: position.quantity,
          inventoryCostRmb,
          averageUnitCostRmb,
          expectedSellServerName,
          latestRmbUnitPrice: latest?.rmbUnitPrice ?? null,
          valuationSourceName: latest ? normalizeLabel(latest.serverName) || null : null,
          marketValueRmb: latest ? roundRmb(position.quantity * latest.rmbUnitPrice) : null,
          unrealizedProfitRmb: latest
            ? roundRmb(position.quantity * latest.rmbUnitPrice - inventoryCostRmb)
            : null
        } satisfies MhxyInventoryPosition;
      });
    const transferExpenseRmb = roundRmb(
      inventoryTransfers
        .filter((transfer) => occurred(transfer.occurredAt) && isRoleTransfer(transfer))
        .reduce((sum, transfer) => sum + transfer.transferCostRmb, 0)
    );
    const summary = {
      inventoryCostRmb: roundRmb(inventory.reduce((sum, item) => sum + item.inventoryCostRmb, 0)),
      realizedProfitRmb: roundRmb(
        replayed.crossServer.tradeResults.reduce((sum, item) => sum + item.realizedProfitRmb, 0) -
        transferExpenseRmb
      ),
      marketValueRmb: roundRmb(
        inventory.reduce((sum, item) => sum + (item.marketValueRmb ?? 0), 0)
      ),
      unrealizedProfitRmb: roundRmb(
        inventory.reduce((sum, item) => sum + (item.unrealizedProfitRmb ?? 0), 0)
      ),
      pendingValuationCount: inventory.filter((item) => item.marketValueRmb === null).length
    };
    const assetFlipSummary = summarizeAssetFlips(replayed.assetRecords);
    const crossServerHoldingCostRmb = summary.inventoryCostRmb;
    const crossServerExpectedValueRmb = roundRmb(
      inventory.reduce(
        (sum, item) => sum + (item.marketValueRmb ?? item.inventoryCostRmb),
        0
      )
    );
    const overviewSummary = {
      crossServer: {
        holdingCostRmb: crossServerHoldingCostRmb,
        expectedValueRmb: crossServerExpectedValueRmb,
        realizedProfitRmb: summary.realizedProfitRmb,
        transferExpenseRmb
      },
      assetTrading: {
        holdingCostRmb: assetFlipSummary.holdingCostRmb,
        expectedValueRmb: assetFlipSummary.holdingCostRmb,
        realizedProfitRmb: assetFlipSummary.realizedProfitRmb
      },
      total: {
        holdingCostRmb: roundRmb(crossServerHoldingCostRmb + assetFlipSummary.holdingCostRmb),
        expectedValueRmb: roundRmb(crossServerExpectedValueRmb + assetFlipSummary.holdingCostRmb),
        realizedProfitRmb: roundRmb(summary.realizedProfitRmb + assetFlipSummary.realizedProfitRmb)
      }
    };
    return {
      trades: [...trades].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      tradeResults: replayed.crossServer.tradeResults,
      priceSnapshots: [...priceSnapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
      inventoryTransfers: [...inventoryTransfers].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      inventoryTargets,
      inventory,
      summary,
      assetFlips,
      assetFlipSummary,
      combinedSummary: {
        holdingCostRmb: overviewSummary.total.holdingCostRmb,
        realizedProfitRmb: overviewSummary.total.realizedProfitRmb,
        mainLedgerMarketValueRmb: summary.marketValueRmb,
        mainLedgerUnrealizedProfitRmb: summary.unrealizedProfitRmb
      },
      overviewSummary
    };
  }

  return {
    getDashboard,
    createTrade(input: MhxyTradeInput) {
      const record = normalizeTrade(input);
      const next = [...repository.readTrades(), record];
      validateHistory(next, repository.readInventoryTransfers());
      repository.transaction(() => {
        repository.writeTrades(next);
      });
      return record;
    },
    updateTrade(id: string, patch: Partial<MhxyTradeInput>) {
      const trades = repository.readTrades();
      const existing = trades.find((record) => record.id === id);
      if (!existing) throw new Error("交易记录不存在");
      const record = normalizeTrade({ ...existing, ...patch }, existing);
      const next = trades.map((item) => (item.id === id ? record : item));
      validateHistory(next, repository.readInventoryTransfers());
      repository.transaction(() => {
        repository.writeTrades(next);
      });
      return record;
    },
    deleteTrade(id: string) {
      const trades = repository.readTrades();
      if (!trades.some((record) => record.id === id)) throw new Error("交易记录不存在");
      const next = trades.filter((record) => record.id !== id);
      validateHistory(next, repository.readInventoryTransfers());
      repository.transaction(() => {
        repository.writeTrades(next);
      });
      return { id };
    },
    createPriceSnapshot(input: MhxyPriceSnapshotInput) {
      const record = normalizeSnapshot(input);
      repository.writePriceSnapshots([...repository.readPriceSnapshots(), record]);
      return record;
    },
    updatePriceSeries(input: MhxyPriceSeriesUpdateInput): MhxyPriceSeriesUpdateResult {
      const normalizeIdentity = (identity: MhxyPriceSeriesIdentity) => {
        const itemName = identity.itemName.trim();
        if (!itemName) throw new Error("道具名不能为空");
        const serverName = normalizeLabel(identity.serverName);
        return { itemName, ...(serverName ? { serverName } : {}) };
      };
      const matchesIdentity = (record: MhxyPriceSnapshot, identity: MhxyPriceSeriesIdentity) =>
        record.itemName === identity.itemName &&
        normalizeLabel(record.serverName) === normalizeLabel(identity.serverName);

      const current = normalizeIdentity(input.current);
      const next = normalizeIdentity(input.next);
      const records = repository.readPriceSnapshots();
      const currentRecords = records.filter((record) => matchesIdentity(record, current));
      if (currentRecords.length === 0) throw new Error("价格序列不存在");
      if (matchesIdentity(currentRecords[0], next)) {
        return { records: currentRecords, updatedCount: 0, targetRecordCount: 0, merged: false };
      }

      const targetRecords = records.filter((record) => matchesIdentity(record, next));
      if (targetRecords.length > 0 && input.confirmMerge !== true) {
        throw new Error("目标价格序列已存在，请确认合并");
      }

      const updatedAt = nowIso();
      const updatedRecords = records.map((record) => {
        if (!matchesIdentity(record, current)) return record;
        const updatedRecord: MhxyPriceSnapshot = {
          ...record,
          itemName: next.itemName,
          updatedAt
        };
        if (next.serverName) updatedRecord.serverName = next.serverName;
        else delete updatedRecord.serverName;
        return updatedRecord;
      });
      repository.writePriceSnapshots(updatedRecords);

      return {
        records: updatedRecords.filter((record) => matchesIdentity(record, next)),
        updatedCount: currentRecords.length,
        targetRecordCount: targetRecords.length,
        merged: targetRecords.length > 0
      };
    },
    deletePriceSnapshot(id: string) {
      const records = repository.readPriceSnapshots();
      if (!records.some((record) => record.id === id)) throw new Error("价格快照不存在");
      repository.writePriceSnapshots(records.filter((record) => record.id !== id));
      return { id };
    },
    createInventoryTransfer(input: MhxyInventoryTransferInput) {
      const record = normalizeRoleTransfer(input);
      const next = [...repository.readInventoryTransfers(), record];
      validateHistory(repository.readTrades(), next);
      repository.transaction(() => {
        repository.writeInventoryTransfers(next);
      });
      return record;
    },
    updateInventoryTransfer(id: string, patch: MhxyInventoryTransferPatch) {
      const transfers = repository.readInventoryTransfers();
      const existing = transfers.find((record) => record.id === id);
      if (!existing) throw new Error("库存转移记录不存在");
      if (!isRoleTransfer(existing)) throw new Error("历史单道具转移不支持编辑");
      const record = normalizeRoleTransfer({ ...existing, ...patch }, existing);
      const next = transfers.map((item) => (item.id === id ? record : item));
      validateHistory(repository.readTrades(), next);
      repository.transaction(() => {
        repository.writeInventoryTransfers(next);
      });
      return record;
    },
    deleteInventoryTransfer(id: string) {
      const transfers = repository.readInventoryTransfers();
      if (!transfers.some((record) => record.id === id)) throw new Error("库存转移记录不存在");
      const next = transfers.filter((record) => record.id !== id);
      validateHistory(repository.readTrades(), next);
      repository.transaction(() => {
        repository.writeInventoryTransfers(next);
      });
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
      const records = recalculateAssetFlips([...repository.readAssetFlips(), record]);
      repository.transaction(() => {
        repository.writeAssetFlips(records);
      });
      return records.find((item) => item.id === record.id) as MhxyAssetFlipRecord;
    },
    updateAssetFlip(id: string, patch: MhxyAssetFlipPatch) {
      const records = repository.readAssetFlips();
      const existing = records.find((record) => record.id === id);
      if (!existing) throw new Error("资产记录不存在");
      const record = normalizeAssetFlip({ ...existing, ...patch }, existing);
      const next = recalculateAssetFlips(records.map((item) => (item.id === id ? record : item)));
      repository.transaction(() => {
        repository.writeAssetFlips(next);
      });
      return next.find((item) => item.id === id) as MhxyAssetFlipRecord;
    },
    deleteAssetFlip(id: string) {
      const records = repository.readAssetFlips();
      if (!records.some((record) => record.id === id)) throw new Error("资产记录不存在");
      const next = recalculateAssetFlips(records.filter((record) => record.id !== id));
      repository.transaction(() => {
        repository.writeAssetFlips(next);
      });
      return { id };
    },
    replaceAllData(input: MhxyDataSet) {
      const next = normalizeDataSet(input);
      repository.transaction(() => {
        repository.writeTrades(next.trades);
        repository.writePriceSnapshots(next.priceSnapshots);
        repository.writeInventoryTransfers(next.inventoryTransfers);
        repository.writeInventoryTargets(next.inventoryTargets);
        repository.writeAssetFlips(next.assetFlips);
      });
      return getDashboard();
    }
  };
}

export type MhxyService = ReturnType<typeof createMhxyService>;
