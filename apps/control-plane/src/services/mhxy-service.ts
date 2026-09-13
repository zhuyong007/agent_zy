import { createHash, randomUUID } from "node:crypto";

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
  MhxyPriceCatalogItem,
  MhxyPriceCatalogItemInput,
  MhxyPriceCatalogItemPatch,
  MhxyPriceMarket,
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
import {
  MHXY_DEFAULT_PRICE_CATALOG,
  MHXY_DEFAULT_PRICE_SOURCE_NAME
} from "./mhxy-price-catalog";
import { createMhxyTransferStatusResolver } from "./mhxy-transfer-status";

type ReplayEvent =
  | { kind: "trade"; record: MhxyTradeRecord }
  | { kind: "transfer"; record: MhxyInventoryTransferRecord };

export interface MhxyPriceCollectorImportInput {
  sourcePageUrl: string;
  capturedAt: string;
  records: Array<{
    watchKey?: string;
    itemName?: string;
    candidates: Array<{
      rmbPrice: number;
      itemLevel?: number;
      listingId?: string;
      serverId?: string;
      serverName?: string;
      regionName?: string;
    }>;
  }>;
}

const PRICE_COLLECTOR_NOTE_PREFIX = "浏览器自动采集最低价";
const LEVEL_SENSITIVE_ITEM_NAME = "百炼精铁";
const ALLOWED_EXISTING_PRICE_SOURCES = new Set([
  "藏宝阁（兽决）",
  "藏宝阁（高内丹）",
  "藏宝阁（附魔）"
]);

const toRmbCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromRmbCents = (value: number) => value / 100;
const roundRmb = (value: number) => fromRmbCents(toRmbCents(value));
const roundRate = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const nowIso = () => new Date().toISOString();
const normalizeLabel = (value: string | undefined) => value?.trim() ?? "";
const inventoryKey = (itemName: string, serverName?: string, characterName?: string) =>
  JSON.stringify([itemName.trim(), normalizeLabel(serverName), normalizeLabel(characterName)]);
const priceCollectorWatchKey = (itemName: string, serverName?: string) =>
  JSON.stringify([normalizeLabel(serverName) || null, itemName.trim()]);

function priceCollectorDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function priceCollectorFingerprint(
  watchKey: string,
  price: number,
  capturedAt: string,
  serverId?: string,
  serverName?: string,
  itemLevel?: number
) {
  return createHash("sha256")
    .update(JSON.stringify([
      watchKey,
      normalizeLabel(serverId) || normalizeLabel(serverName) || null,
      itemLevel ?? null,
      roundRmb(price),
      priceCollectorDay(capturedAt)
    ]))
    .digest("hex")
    .slice(0, 20);
}

function ironLevelFromName(itemName: string) {
  const normalized = itemName.trim();
  const suffixMatch = normalized.match(/^百炼精铁(?:[（(]?\s*(\d{1,3})\s*级[）)]?)?$/);
  const prefixMatch = normalized.match(/^(\d{1,3})\s*级百炼精铁$/);
  const value = suffixMatch?.[1] ?? prefixMatch?.[1];
  return value ? Number(value) : undefined;
}

function normalizeIronLevel(value: number | undefined) {
  if (!Number.isSafeInteger(value) || (value as number) < 10 || (value as number) > 160 || (value as number) % 10 !== 0) {
    throw new Error("百炼精铁等级必须是 10 到 160 之间的整十等级");
  }
  return value as number;
}

function normalizePriceItemIdentity(itemName: string, itemLevel?: number) {
  const normalizedName = itemName.trim();
  const nameLevel = ironLevelFromName(normalizedName);
  const isIron = normalizedName === LEVEL_SENSITIVE_ITEM_NAME || nameLevel !== undefined;
  if (!isIron) {
    return {
      itemName: normalizedName,
      ...(itemLevel !== undefined ? { itemLevel } : {})
    };
  }
  if (itemLevel !== undefined && nameLevel !== undefined && itemLevel !== nameLevel) {
    throw new Error("百炼精铁名称中的等级与等级字段不一致");
  }
  const level = normalizeIronLevel(itemLevel ?? nameLevel);
  return { itemName: `${LEVEL_SENSITIVE_ITEM_NAME}（${level}级）`, itemLevel: level };
}

function normalizeCollectorSourceUrl(value: string) {
  const source = new URL(value);
  if (!/^https?:$/.test(source.protocol) || !source.hostname.endsWith(".cbg.163.com")) {
    throw new Error("自动采价只接受梦幻西游藏宝阁页面");
  }
  source.hash = "";
  return source.toString().slice(0, 1200);
}

function findPriceCatalogItem(catalog: MhxyPriceCatalogItem[], discoveredItemName: string) {
  const catalogName = discoveredItemName === LEVEL_SENSITIVE_ITEM_NAME || ironLevelFromName(discoveredItemName) !== undefined
    ? LEVEL_SENSITIVE_ITEM_NAME
    : discoveredItemName;
  return catalog.find((catalogItem) =>
    catalogItem.matchNames.some((matchName) =>
      catalogItem.matchMode === "contains"
        ? catalogName.includes(matchName)
        : catalogName === matchName
    )
  );
}

function normalizePriceCatalogItem(
  input: MhxyPriceCatalogItemInput,
  existing?: MhxyPriceCatalogItem,
  timestamp = nowIso()
): MhxyPriceCatalogItem {
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  if (input.matchMode !== "exact" && input.matchMode !== "contains") {
    throw new Error("匹配方式无效");
  }
  if (!Number.isSafeInteger(input.carryLimit) || input.carryLimit <= 0 || input.carryLimit > 10000) {
    throw new Error("携带上限必须是 1 到 10000 之间的整数");
  }
  if (
    input.transferLockDays !== null &&
    (!Number.isSafeInteger(input.transferLockDays) || input.transferLockDays < 0 || input.transferLockDays > 3650)
  ) {
    throw new Error("转服时间锁必须是 0 到 3650 之间的整数，或留空表示无");
  }
  const matchNames = [...new Set(input.matchNames.map((value) => value.trim()).filter(Boolean))];
  if (matchNames.length === 0) throw new Error("至少填写一个匹配名称");
  if (matchNames.length > 50 || matchNames.some((value) => value.length > 160)) {
    throw new Error("匹配名称数量或长度超出限制");
  }
  const cbgOverallKindIds = [...new Set((input.cbgOverallKindIds ?? [])
    .map((value) => value.trim())
    .filter(Boolean))];
  if (cbgOverallKindIds.length > 100 || cbgOverallKindIds.some((value) => !/^\d{1,12}$/.test(value))) {
    throw new Error("全服检索编码必须是数字，且最多填写 100 个");
  }
  const note = input.note?.trim();
  if (note && note.length > 500) throw new Error("说明不能超过 500 个字");
  return {
    id: existing?.id ?? randomUUID(),
    itemName,
    matchNames,
    matchMode: input.matchMode,
    carryLimit: input.carryLimit,
    transferLockDays: input.transferLockDays,
    ...(note ? { note } : {}),
    ...(cbgOverallKindIds.length ? { cbgOverallKindIds } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function initialPriceCatalog(timestamp: string): MhxyPriceCatalogItem[] {
  return MHXY_DEFAULT_PRICE_CATALOG.map((catalogItem) => normalizePriceCatalogItem(
    catalogItem,
    {
      ...catalogItem,
      id: `price-item-${createHash("sha256").update(catalogItem.itemName).digest("hex").slice(0, 16)}`,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    timestamp
  ));
}

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
  const rawItemName = input.itemName.trim();
  if (!rawItemName) throw new Error("道具名不能为空");
  const normalizedItem = normalizePriceItemIdentity(rawItemName, input.itemLevel);
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
  const {
    serverName,
    serverId,
    regionName,
    sourceName,
    transferStatus,
    transferStatusDate,
    itemLevel: _itemLevel,
    ...snapshotInput
  } = input;
  const normalizedServerName = normalizeLabel(serverName);
  const normalizedServerId = normalizeLabel(serverId);
  const normalizedRegionName = normalizeLabel(regionName);
  const normalizedSourceName = normalizeLabel(sourceName);
  const normalizedTransferStatus = transferStatus === "flat" || transferStatus === "open" || transferStatus === "firework"
    ? transferStatus
    : transferStatus === "unknown"
      ? "unknown"
      : undefined;
  const normalizedTransferStatusDate = normalizeLabel(transferStatusDate);
  const timestamp = nowIso();
  return {
    ...snapshotInput,
    id: existing?.id ?? randomUUID(),
    itemName: normalizedItem.itemName,
    ...(normalizedItem.itemLevel !== undefined ? { itemLevel: normalizedItem.itemLevel } : {}),
    rmbUnitPrice,
    capturedAt: new Date(input.capturedAt).toISOString(),
    ...(normalizedServerName ? { serverName: normalizedServerName } : {}),
    ...(normalizedServerId ? { serverId: normalizedServerId } : {}),
    ...(normalizedRegionName ? { regionName: normalizedRegionName } : {}),
    ...(normalizedSourceName ? { sourceName: normalizedSourceName } : {}),
    ...(normalizedTransferStatus ? { transferStatus: normalizedTransferStatus } : {}),
    ...(normalizedTransferStatusDate ? { transferStatusDate: normalizedTransferStatusDate } : {}),
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
    ...(input.priceCatalogItems === undefined
      ? []
      : [[input.priceCatalogItems, "道具表"]] as const),
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
          itemLevel: record.itemLevel,
          currency: "gameCoin",
          gameCoinUnitPriceWan: record.gameCoinUnitPriceWan,
          rmbPerGameCoinWan: record.rmbPerGameCoinWan,
          capturedAt: record.capturedAt,
          serverName: record.serverName,
          serverId: record.serverId,
          regionName: record.regionName,
          sourceName: record.sourceName,
          transferStatus: record.transferStatus,
          transferStatusDate: record.transferStatusDate,
          note: record.note
        }
      : {
          itemName: record.itemName,
          itemLevel: record.itemLevel,
          currency: "rmb",
          rmbUnitPrice: record.rmbUnitPrice,
          capturedAt: record.capturedAt,
          serverName: record.serverName,
          serverId: record.serverId,
          regionName: record.regionName,
          sourceName: record.sourceName,
          transferStatus: record.transferStatus,
          transferStatusDate: record.transferStatusDate,
          note: record.note
        };
    const normalized = normalizeSnapshot(snapshotInput, record);
    return { ...normalized, updatedAt: record.updatedAt };
  });
  const priceCatalogItems = input.priceCatalogItems?.map((record) => {
    assertRecordMetadata(record, "道具表记录");
    return normalizePriceCatalogItem(record, record, record.updatedAt);
  });
  if (priceCatalogItems && new Set(priceCatalogItems.map((item) => item.itemName)).size !== priceCatalogItems.length) {
    throw new Error("道具表中的道具名不能重复");
  }
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
    ...(priceCatalogItems ? { priceCatalogItems } : {}),
    inventoryTransfers,
    inventoryTargets,
    assetFlips: recalculateAssetFlips(assetFlips)
  };
}

export function createMhxyService(dataDir: string, now: () => Date = () => new Date()) {
  const repository = createMhxyRepository(dataDir, initialPriceCatalog(now().toISOString()));
  const transferStatusResolver = createMhxyTransferStatusResolver();

  function getPriceMarket(): MhxyPriceMarket {
    const priceCatalog = repository.readPriceCatalogItems();
    const latest = new Map<string, MhxyPriceSnapshot>();
    const ordered = repository.readPriceSnapshots().sort((left, right) => {
      const capturedAt = right.capturedAt.localeCompare(left.capturedAt);
      return capturedAt !== 0 ? capturedAt : right.createdAt.localeCompare(left.createdAt);
    });
    for (const snapshot of ordered) {
      const serverName = normalizeLabel(snapshot.serverName);
      if (!serverName || ALLOWED_EXISTING_PRICE_SOURCES.has(serverName) || serverName === MHXY_DEFAULT_PRICE_SOURCE_NAME) {
        continue;
      }
      const serverIdentity = normalizeLabel(snapshot.serverId)
        || JSON.stringify([normalizeLabel(snapshot.regionName), serverName]);
      const key = JSON.stringify([snapshot.itemName, serverIdentity]);
      if (!latest.has(key)) latest.set(key, snapshot);
    }

    const quotes = [...latest.values()].map((snapshot) => {
      const currentTransfer = transferStatusResolver.find(snapshot.serverName, snapshot.regionName);
      return {
        itemName: snapshot.itemName,
        ...(snapshot.itemLevel !== undefined ? { itemLevel: snapshot.itemLevel } : {}),
        rmbUnitPrice: snapshot.rmbUnitPrice,
        capturedAt: snapshot.capturedAt,
        serverName: snapshot.serverName as string,
        ...(snapshot.serverId ? { serverId: snapshot.serverId } : {}),
        ...(snapshot.regionName || currentTransfer?.regionName
          ? { regionName: snapshot.regionName || currentTransfer?.regionName }
          : {}),
        ...(snapshot.sourceName ? { sourceName: snapshot.sourceName } : {}),
        transferStatus: currentTransfer?.status ?? snapshot.transferStatus ?? "unknown",
        ...(currentTransfer?.snapshotDate || snapshot.transferStatusDate
          ? { transferStatusDate: currentTransfer?.snapshotDate || snapshot.transferStatusDate }
          : {}),
        snapshotId: snapshot.id
      };
    }).sort((left, right) =>
      left.itemName.localeCompare(right.itemName, "zh-CN")
      || left.rmbUnitPrice - right.rmbUnitPrice
      || left.serverName.localeCompare(right.serverName, "zh-CN")
    );

    return {
      generatedAt: now().toISOString(),
      ...(transferStatusResolver.snapshotDate
        ? { transferStatusDate: transferStatusResolver.snapshotDate }
        : {}),
      catalogCount: priceCatalog.length,
      allServerSearchableCount: priceCatalog
        .filter((item) => item.cbgOverallKindIds?.length).length,
      unsupportedItemNames: priceCatalog
        .filter((item) => !item.cbgOverallKindIds?.length)
        .map((item) => item.itemName),
      itemCount: new Set(quotes.map((quote) => quote.itemName)).size,
      serverCount: new Set(quotes.map((quote) => JSON.stringify([
        quote.regionName ?? "",
        quote.serverName
      ]))).size,
      quotes
    };
  }

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
    getPriceMarket,
    getPriceCatalogItems() {
      return repository.readPriceCatalogItems()
        .sort((left, right) => left.itemName.localeCompare(right.itemName, "zh-CN"));
    },
    createPriceCatalogItem(input: MhxyPriceCatalogItemInput) {
      const records = repository.readPriceCatalogItems();
      const record = normalizePriceCatalogItem(input);
      if (records.some((item) => item.itemName === record.itemName)) {
        throw new Error("道具表中已存在同名道具");
      }
      repository.writePriceCatalogItems([...records, record]);
      return record;
    },
    updatePriceCatalogItem(id: string, patch: MhxyPriceCatalogItemPatch) {
      const records = repository.readPriceCatalogItems();
      const existing = records.find((item) => item.id === id);
      if (!existing) throw new Error("道具表记录不存在");
      const record = normalizePriceCatalogItem({ ...existing, ...patch }, existing);
      if (records.some((item) => item.id !== id && item.itemName === record.itemName)) {
        throw new Error("道具表中已存在同名道具");
      }
      repository.writePriceCatalogItems(records.map((item) => item.id === id ? record : item));
      return record;
    },
    deletePriceCatalogItem(id: string) {
      const records = repository.readPriceCatalogItems();
      if (!records.some((item) => item.id === id)) throw new Error("道具表记录不存在");
      repository.writePriceCatalogItems(records.filter((item) => item.id !== id));
      return { id };
    },
    getPriceCollectorWatchlist() {
      const priceCatalog = repository.readPriceCatalogItems();
      const snapshots = repository.readPriceSnapshots();
      const items = priceCatalog.map((catalogItem) => {
        const latest = snapshots
          .filter((snapshot) => findPriceCatalogItem(priceCatalog, snapshot.itemName)?.itemName === catalogItem.itemName)
          .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
        return {
          watchKey: priceCollectorWatchKey(catalogItem.itemName, MHXY_DEFAULT_PRICE_SOURCE_NAME),
          itemName: catalogItem.itemName,
          serverName: MHXY_DEFAULT_PRICE_SOURCE_NAME,
          sourceName: MHXY_DEFAULT_PRICE_SOURCE_NAME,
          matchNames: catalogItem.matchNames,
          matchMode: catalogItem.matchMode,
          catalog: true as const,
          carryLimit: catalogItem.carryLimit,
          transferLockDays: catalogItem.transferLockDays,
          ...(catalogItem.note ? { catalogNote: catalogItem.note } : {}),
          ...(catalogItem.cbgOverallKindIds?.length
            ? {
                allServerSearch: {
                  searchType: "overall_search_equip" as const,
                  kindIds: catalogItem.cbgOverallKindIds
                }
              }
            : {}),
          ...(latest
            ? {
                latestRmbUnitPrice: latest.rmbUnitPrice,
                latestCapturedAt: latest.capturedAt
              }
            : {})
        };
      });

      return {
        priceRule: "lowest" as const,
        catalogCount: priceCatalog.length,
        allServerSearchableCount: items.filter((item) => item.allServerSearch).length,
        items: items.sort((left, right) => left.itemName.localeCompare(right.itemName, "zh-CN"))
      };
    },
    importCollectedLowestPrices(input: MhxyPriceCollectorImportInput) {
      const sourcePageUrl = normalizeCollectorSourceUrl(input.sourcePageUrl);
      const existing = repository.readPriceSnapshots();
      const priceCatalog = repository.readPriceCatalogItems();
      const watchlist = new Map<string, MhxyPriceCatalogItem>();
      for (const catalogItem of priceCatalog) {
        const watchKey = priceCollectorWatchKey(catalogItem.itemName, MHXY_DEFAULT_PRICE_SOURCE_NAME);
        watchlist.set(watchKey, catalogItem);
      }

      const imported: MhxyPriceSnapshot[] = [];
      const skipped: Array<{
        watchKey: string;
        reason: "not-watched" | "not-allowed" | "duplicate" | "missing-required-level";
      }> = [];
      const existingSeriesKeys = new Set(existing.map((record) => JSON.stringify([
        record.itemName,
        normalizeLabel(record.serverId) || normalizeLabel(record.serverName)
      ])));
      const createdSeriesKeys = new Set<string>();

      for (const collectedRecord of input.records) {
        const discoveredItemName = normalizeLabel(collectedRecord.itemName);
        let resolvedWatchKey = collectedRecord.watchKey?.trim() || "";
        let watched = resolvedWatchKey ? watchlist.get(resolvedWatchKey) : undefined;
        if (!watched && discoveredItemName) watched = findPriceCatalogItem(priceCatalog, discoveredItemName);
        if (watched) {
          resolvedWatchKey = priceCollectorWatchKey(watched.itemName, MHXY_DEFAULT_PRICE_SOURCE_NAME);
        }
        const resultWatchKey = resolvedWatchKey || discoveredItemName || "unknown";
        if (!watched) {
          skipped.push({
            watchKey: resultWatchKey,
            reason: discoveredItemName ? "not-allowed" : "not-watched"
          });
          continue;
        }

        const candidatesByServer = new Map<string, typeof collectedRecord.candidates>();
        for (const candidate of collectedRecord.candidates) {
          const serverName = normalizeLabel(candidate.serverName);
          const regionName = normalizeLabel(candidate.regionName);
          const serverId = normalizeLabel(candidate.serverId);
          let itemLevel: number | undefined;
          if (watched.itemName === LEVEL_SENSITIVE_ITEM_NAME) {
            try {
              itemLevel = normalizeIronLevel(candidate.itemLevel);
            } catch {
              skipped.push({
                watchKey: serverName ? `${resolvedWatchKey} · ${serverName}` : resolvedWatchKey,
                reason: "missing-required-level"
              });
              continue;
            }
          }
          const serverKey = serverName
            ? JSON.stringify([serverId || null, regionName || null, serverName, itemLevel ?? null])
            : JSON.stringify(["legacy-page", itemLevel ?? null]);
          const group = candidatesByServer.get(serverKey) ?? [];
          group.push(candidate);
          candidatesByServer.set(serverKey, group);
        }

        for (const candidates of candidatesByServer.values()) {
          const orderedCandidates = [...candidates]
            .sort((left, right) => left.rmbPrice - right.rmbPrice);
          const lowestCandidate = orderedCandidates[0];
          const lowestRmbPrice = roundRmb(lowestCandidate.rmbPrice);
          const itemLevel = watched.itemName === LEVEL_SENSITIVE_ITEM_NAME
            ? normalizeIronLevel(lowestCandidate.itemLevel)
            : lowestCandidate.itemLevel;
          const normalizedItem = normalizePriceItemIdentity(watched.itemName, itemLevel);
          const actualServerName = normalizeLabel(lowestCandidate.serverName);
          const serverName = actualServerName || MHXY_DEFAULT_PRICE_SOURCE_NAME;
          const serverId = normalizeLabel(lowestCandidate.serverId);
          const regionName = normalizeLabel(lowestCandidate.regionName);
          const fingerprint = priceCollectorFingerprint(
            resolvedWatchKey,
            lowestRmbPrice,
            input.capturedAt,
            serverId,
            serverName,
            normalizedItem.itemLevel
          );
          if ([...existing, ...imported].some((record) => record.note?.includes(`采集指纹 ${fingerprint}`))) {
            skipped.push({
              watchKey: actualServerName ? `${resolvedWatchKey} · ${actualServerName}` : resolvedWatchKey,
              reason: "duplicate"
            });
            continue;
          }

          const transferStatus = actualServerName
            ? transferStatusResolver.find(actualServerName, regionName)
            : undefined;
          const listing = lowestCandidate.listingId?.trim();
          const note = [
            PRICE_COLLECTOR_NOTE_PREFIX,
            ...(normalizedItem.itemLevel !== undefined ? [`等级 ${normalizedItem.itemLevel}`] : []),
            `样本 ${candidates.length}`,
            ...(listing ? [`最低价商品 ${listing.slice(0, 160)}`] : []),
            `采集指纹 ${fingerprint}`,
            `来源 ${sourcePageUrl}`
          ].join("｜");
          imported.push(normalizeSnapshot({
            itemName: normalizedItem.itemName,
            ...(normalizedItem.itemLevel !== undefined ? { itemLevel: normalizedItem.itemLevel } : {}),
            serverName,
            ...(serverId ? { serverId } : {}),
            ...(regionName || transferStatus?.regionName
              ? { regionName: regionName || transferStatus?.regionName }
              : {}),
            ...(actualServerName ? { sourceName: MHXY_DEFAULT_PRICE_SOURCE_NAME } : {}),
            ...(transferStatus
              ? {
                  transferStatus: transferStatus.status,
                  transferStatusDate: transferStatus.snapshotDate
                }
              : actualServerName
                ? { transferStatus: "unknown" as const }
                : {}),
            currency: "rmb",
            rmbUnitPrice: lowestRmbPrice,
            capturedAt: input.capturedAt,
            note
          }));
          const seriesKey = JSON.stringify([normalizedItem.itemName, serverId || serverName]);
          if (!existingSeriesKeys.has(seriesKey)) createdSeriesKeys.add(seriesKey);
        }
      }

      if (imported.length > 0) {
        repository.writePriceSnapshots([...existing, ...imported]);
      }

      return {
        priceRule: "lowest" as const,
        imported,
        skipped,
        importedCount: imported.length,
        skippedCount: skipped.length,
        createdSeriesCount: createdSeriesKeys.size
      };
    },
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
        if (next.priceCatalogItems) repository.writePriceCatalogItems(next.priceCatalogItems);
        repository.writeInventoryTransfers(next.inventoryTransfers);
        repository.writeInventoryTargets(next.inventoryTargets);
        repository.writeAssetFlips(next.assetFlips);
      });
      return getDashboard();
    }
  };
}

export type MhxyService = ReturnType<typeof createMhxyService>;
