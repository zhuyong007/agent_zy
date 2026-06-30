import type {
  MhxyGameCoinAllocation,
  MhxyGameCoinCashoutRecord,
  MhxyGameCoinCashoutSummary,
  MhxyGameCoinPurchasePosition,
  MhxyGameCoinWalletPosition,
  MhxyInventoryTransferRecord,
  MhxyRoleInventoryTransferRecord,
  MhxyTradeRecord,
  MhxyTradeResult
} from "@agent-zy/shared-types";

const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromCents = (value: number) => value / 100;
const roundRmb = (value: number) => fromCents(toCents(value));
const roundRate = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const label = (value: string | undefined) => value?.trim() ?? "";
const locationKey = (serverName?: string, characterName?: string) =>
  JSON.stringify([label(serverName), label(characterName)]);
const inventoryKey = (itemName: string, serverName?: string, characterName?: string) =>
  JSON.stringify([itemName.trim(), label(serverName), label(characterName)]);
const isRoleTransfer = (
  transfer: MhxyInventoryTransferRecord
): transfer is MhxyRoleInventoryTransferRecord =>
  "scope" in transfer && transfer.scope === "role";

export interface MhxyLedgerInventoryPosition {
  itemName: string;
  serverName: string;
  characterName: string;
  quantity: number;
  inventoryCostCents: number;
  directQuantity: number;
  directCostCents: number;
  transferredQuantity: number;
  transferredCostCents: number;
}

interface CoinLot {
  sourceId: string;
  serverName: string;
  characterName: string;
  acquiredAt: string;
  gameCoinAmount: number;
  rmbCostCents: number;
  purchaseId?: string;
}

interface LiquidationBalance {
  serverName: string;
  characterName: string;
  gameCoinAmount: number;
  rmbCostCents: number;
}

type LedgerEvent =
  | { kind: "trade"; date: string; createdAt: string; id: string; record: MhxyTradeRecord }
  | { kind: "transfer"; date: string; createdAt: string; id: string; record: MhxyInventoryTransferRecord }
  | { kind: "cashout"; date: string; createdAt: string; id: string; record: MhxyGameCoinCashoutRecord };

export interface ReplayCrossServerLedgerInput {
  trades: MhxyTradeRecord[];
  transfers: MhxyInventoryTransferRecord[];
  purchasePositions: MhxyGameCoinPurchasePosition[];
  cashouts: MhxyGameCoinCashoutRecord[];
}

export interface ReplayCrossServerLedgerResult {
  trades: MhxyTradeRecord[];
  inventory: Map<string, MhxyLedgerInventoryPosition>;
  tradeResults: MhxyTradeResult[];
  purchasePositions: MhxyGameCoinPurchasePosition[];
  cashouts: MhxyGameCoinCashoutRecord[];
  wallets: MhxyGameCoinWalletPosition[];
  cashoutSummary: MhxyGameCoinCashoutSummary;
}

function proportionalCost(amount: number, available: number, availableCents: number) {
  return amount === available ? availableCents : Math.round(availableCents * amount / available);
}

function rawGameCoinAmount(trade: MhxyTradeRecord) {
  const amount = (trade.gameCoinAmountWan ?? trade.quantity * trade.unitPrice) * 10_000;
  const rounded = Math.round(amount);
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(amount - rounded) > 1e-9) {
    throw new Error("游戏币数量必须换算为大于 0 的整数个");
  }
  return rounded;
}

export function replayCrossServerLedger(
  input: ReplayCrossServerLedgerInput
): ReplayCrossServerLedgerResult {
  const inventory = new Map<string, MhxyLedgerInventoryPosition>();
  const tradeResults: MhxyTradeResult[] = [];
  const tradeById = new Map(input.trades.map((trade) => [trade.id, { ...trade }]));
  const cashoutById = new Map(input.cashouts.map((cashout) => [cashout.id, { ...cashout }]));
  const purchaseById = new Map(input.purchasePositions.map((purchase) => [purchase.id, { ...purchase }]));
  const procurementLots: CoinLot[] = input.purchasePositions
    .filter((purchase) => purchase.remainingGameCoinAmount > 0 && label(purchase.serverName) && label(purchase.characterName))
    .map((purchase) => ({
      sourceId: purchase.id,
      purchaseId: purchase.id,
      serverName: label(purchase.serverName),
      characterName: label(purchase.characterName),
      acquiredAt: purchase.acquiredAt,
      gameCoinAmount: purchase.remainingGameCoinAmount,
      rmbCostCents: toCents(purchase.remainingRmbCost)
    }));
  const liquidation = new Map<string, LiquidationBalance>();

  const getPosition = (itemName: string, serverName?: string, characterName?: string) => {
    const key = inventoryKey(itemName, serverName, characterName);
    const existing = inventory.get(key);
    if (existing) return existing;
    const created: MhxyLedgerInventoryPosition = {
      itemName,
      serverName: label(serverName),
      characterName: label(characterName),
      quantity: 0,
      inventoryCostCents: 0,
      directQuantity: 0,
      directCostCents: 0,
      transferredQuantity: 0,
      transferredCostCents: 0
    };
    inventory.set(key, created);
    return created;
  };

  const removeBucket = (
    position: MhxyLedgerInventoryPosition,
    bucket: "direct" | "transferred",
    quantity: number
  ) => {
    const quantityKey = bucket === "direct" ? "directQuantity" : "transferredQuantity";
    const costKey = bucket === "direct" ? "directCostCents" : "transferredCostCents";
    const available = position[quantityKey];
    const availableCost = position[costKey];
    const cost = proportionalCost(quantity, available, availableCost);
    position[quantityKey] -= quantity;
    position[costKey] -= cost;
    position.quantity -= quantity;
    position.inventoryCostCents -= cost;
    return cost;
  };

  const removeInventory = (
    position: MhxyLedgerInventoryPosition,
    quantity: number,
    order: Array<"direct" | "transferred">,
    context: string
  ) => {
    if (position.quantity < quantity) throw new Error(`库存不足：${context}`);
    let needed = quantity;
    let directQuantity = 0;
    let transferredQuantity = 0;
    let directCostCents = 0;
    let transferredCostCents = 0;
    for (const bucket of order) {
      if (needed === 0) break;
      const available = bucket === "direct" ? position.directQuantity : position.transferredQuantity;
      const used = Math.min(available, needed);
      if (used === 0) continue;
      const cost = removeBucket(position, bucket, used);
      if (bucket === "direct") {
        directQuantity += used;
        directCostCents += cost;
      } else {
        transferredQuantity += used;
        transferredCostCents += cost;
      }
      needed -= used;
    }
    return { directQuantity, transferredQuantity, directCostCents, transferredCostCents };
  };

  const consumeCoin = (
    trade: MhxyTradeRecord,
    rawAmount: number,
    allocations?: MhxyGameCoinAllocation[]
  ) => {
    const serverName = label(trade.serverName);
    const characterName = label(trade.characterName);
    if (!serverName || !characterName) throw new Error("游戏币交易必须填写区服和角色");
    let needed = rawAmount;
    let costCents = 0;
    const consumed: MhxyGameCoinAllocation[] = [];
    const consumeLot = (lot: CoinLot, amount: number) => {
      if (lot.acquiredAt > trade.occurredAt) throw new Error("不能使用交易时间之后获得的游戏币");
      const cents = proportionalCost(amount, lot.gameCoinAmount, lot.rmbCostCents);
      lot.gameCoinAmount -= amount;
      lot.rmbCostCents -= cents;
      costCents += cents;
      needed -= amount;
      consumed.push({ gameCoinPurchaseId: lot.sourceId, gameCoinAmount: amount, rmbCost: fromCents(cents) });
    };

    if (allocations?.length) {
      for (const allocation of allocations) {
        const lot = procurementLots.find((candidate) =>
          candidate.sourceId === allocation.gameCoinPurchaseId &&
          candidate.serverName === serverName &&
          candidate.characterName === characterName
        );
        if (!lot || lot.gameCoinAmount < allocation.gameCoinAmount) {
          throw new Error(`游戏币批次余额不足：${allocation.gameCoinPurchaseId}`);
        }
        consumeLot(lot, allocation.gameCoinAmount);
      }
      if (needed !== 0) throw new Error(`游戏币批次分配不完整：${trade.itemName}`);
      return { costCents, allocations: consumed };
    }

    const eligible = procurementLots
      .filter((lot) =>
        lot.serverName === serverName &&
        lot.characterName === characterName &&
        lot.acquiredAt <= trade.occurredAt &&
        lot.gameCoinAmount > 0
      )
      .sort((left, right) => {
        const date = left.acquiredAt.localeCompare(right.acquiredAt);
        return date !== 0 ? date : left.sourceId.localeCompare(right.sourceId);
      });
    for (const lot of eligible) {
      if (needed === 0) break;
      consumeLot(lot, Math.min(lot.gameCoinAmount, needed));
    }
    if (needed > 0) {
      throw new Error(`游戏币余额不足：${serverName}/${characterName} 缺少 ${needed} 个`);
    }
    return { costCents, allocations: consumed };
  };

  const addProcurement = (
    sourceId: string,
    serverName: string,
    characterName: string,
    acquiredAt: string,
    gameCoinAmount: number,
    rmbCostCents: number
  ) => procurementLots.push({ sourceId, serverName, characterName, acquiredAt, gameCoinAmount, rmbCostCents });

  const addLiquidation = (
    serverName: string,
    characterName: string,
    gameCoinAmount: number,
    rmbCostCents: number
  ) => {
    const key = locationKey(serverName, characterName);
    const current = liquidation.get(key) ?? { serverName, characterName, gameCoinAmount: 0, rmbCostCents: 0 };
    current.gameCoinAmount += gameCoinAmount;
    current.rmbCostCents += rmbCostCents;
    liquidation.set(key, current);
  };

  const events: LedgerEvent[] = [
    ...input.trades.map((record): LedgerEvent => ({ kind: "trade", date: record.occurredAt, createdAt: record.createdAt, id: record.id, record })),
    ...input.transfers.map((record): LedgerEvent => ({ kind: "transfer", date: record.occurredAt, createdAt: record.createdAt, id: record.id, record })),
    ...input.cashouts.map((record): LedgerEvent => ({ kind: "cashout", date: record.occurredAt, createdAt: record.createdAt, id: record.id, record }))
  ].sort((left, right) => {
    const date = left.date.localeCompare(right.date);
    if (date !== 0) return date;
    const created = left.createdAt.localeCompare(right.createdAt);
    return created !== 0 ? created : left.id.localeCompare(right.id);
  });

  for (const event of events) {
    if (event.kind === "transfer") {
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
          const movedQuantity = source.quantity;
          const removed = removeInventory(
            source,
            movedQuantity,
            ["direct", "transferred"],
            `${source.itemName} ${transfer.sourceServerName}`
          );
          const movedCost = removed.directCostCents + removed.transferredCostCents;
          const target = getPosition(
            source.itemName,
            transfer.targetServerName,
            transfer.characterName
          );
          target.quantity += movedQuantity;
          target.inventoryCostCents += movedCost;
          target.transferredQuantity += movedQuantity;
          target.transferredCostCents += movedCost;
        }
        continue;
      }
      const source = getPosition(transfer.itemName, transfer.sourceServerName, transfer.sourceCharacterName);
      const removed = removeInventory(source, transfer.quantity, ["direct", "transferred"], `${transfer.itemName} ${transfer.sourceServerName}`);
      const target = getPosition(transfer.itemName, transfer.targetServerName, transfer.targetCharacterName);
      const movedCost = removed.directCostCents + removed.transferredCostCents + toCents(transfer.transferCostRmb);
      target.quantity += transfer.quantity;
      target.inventoryCostCents += movedCost;
      target.transferredQuantity += transfer.quantity;
      target.transferredCostCents += movedCost;
      continue;
    }

    if (event.kind === "cashout") {
      const cashout = event.record;
      const key = locationKey(cashout.serverName, cashout.characterName);
      const balance = liquidation.get(key);
      if (!balance || balance.gameCoinAmount < cashout.gameCoinAmount) {
        throw new Error(`准备卖出的游戏币余额不足：${cashout.serverName}/${cashout.characterName}`);
      }
      const costBasisCents = proportionalCost(cashout.gameCoinAmount, balance.gameCoinAmount, balance.rmbCostCents);
      balance.gameCoinAmount -= cashout.gameCoinAmount;
      balance.rmbCostCents -= costBasisCents;
      const normalized = {
        ...cashout,
        rmbPerGameCoinWan: roundRate(cashout.rmbReceived / (cashout.gameCoinAmount / 10_000)),
        costBasisRmb: fromCents(costBasisCents),
        realizedProfitRmb: roundRmb(cashout.rmbReceived - fromCents(costBasisCents))
      };
      cashoutById.set(cashout.id, normalized);
      continue;
    }

    const trade = { ...event.record };
    const position = getPosition(trade.itemName, trade.serverName, trade.characterName);
    if (trade.type === "buy") {
      let costCents: number;
      if (trade.currency === "gameCoin" && trade.accountingMode === "wallet") {
        const rawAmount = rawGameCoinAmount(trade);
        const consumed = consumeCoin(trade, rawAmount, trade.gameCoinAllocations);
        costCents = consumed.costCents;
        trade.rmbAmount = fromCents(costCents);
        trade.effectiveRmbPerGameCoinWan = roundRate(trade.rmbAmount / (rawAmount / 10_000));
        trade.gameCoinAllocations = consumed.allocations;
      } else {
        costCents = toCents(trade.rmbAmount ?? 0) + toCents(trade.feeRmb);
      }
      position.quantity += trade.quantity;
      position.inventoryCostCents += costCents;
      position.directQuantity += trade.quantity;
      position.directCostCents += costCents;
      tradeById.set(trade.id, trade);
      continue;
    }

    const removed = removeInventory(position, trade.quantity, ["transferred", "direct"], `${trade.itemName} ${trade.serverName ?? ""}`);
    const totalCostCents = removed.directCostCents + removed.transferredCostCents;
    if (trade.currency === "gameCoin" && trade.accountingMode === "wallet") {
      const rawAmount = rawGameCoinAmount(trade);
      const transferredCoins = removed.transferredQuantity === 0
        ? 0
        : Math.round(rawAmount * removed.transferredQuantity / trade.quantity);
      const directCoins = rawAmount - transferredCoins;
      if (transferredCoins > 0) {
        addLiquidation(label(trade.serverName), label(trade.characterName), transferredCoins, removed.transferredCostCents);
      }
      if (directCoins > 0) {
        addProcurement(`trade:${trade.id}`, label(trade.serverName), label(trade.characterName), trade.occurredAt, directCoins, removed.directCostCents);
      }
      trade.rmbAmount = null;
      trade.feeRmb = 0;
      tradeById.set(trade.id, trade);
      continue;
    }

    const netIncomeRmb = roundRmb((trade.rmbAmount ?? 0) - trade.feeRmb);
    tradeResults.push({
      tradeId: trade.id,
      costBasisRmb: fromCents(totalCostCents),
      netIncomeRmb,
      realizedProfitRmb: roundRmb(netIncomeRmb - fromCents(totalCostCents))
    });
  }

  for (const lot of procurementLots) {
    if (!lot.purchaseId) continue;
    const purchase = purchaseById.get(lot.purchaseId);
    if (!purchase) continue;
    purchase.remainingGameCoinAmount = lot.gameCoinAmount;
    purchase.remainingRmbCost = fromCents(lot.rmbCostCents);
  }

  const procurementWallets = new Map<string, LiquidationBalance>();
  for (const lot of procurementLots) {
    if (lot.gameCoinAmount <= 0) continue;
    const key = locationKey(lot.serverName, lot.characterName);
    const current = procurementWallets.get(key) ?? {
      serverName: lot.serverName,
      characterName: lot.characterName,
      gameCoinAmount: 0,
      rmbCostCents: 0
    };
    current.gameCoinAmount += lot.gameCoinAmount;
    current.rmbCostCents += lot.rmbCostCents;
    procurementWallets.set(key, current);
  }

  const asWallet = (purpose: "procurement" | "liquidation", balance: LiquidationBalance): MhxyGameCoinWalletPosition => ({
    purpose,
    serverName: balance.serverName,
    characterName: balance.characterName,
    gameCoinAmount: balance.gameCoinAmount,
    rmbCostBasis: fromCents(balance.rmbCostCents),
    averageRmbPerGameCoinWan: balance.gameCoinAmount === 0
      ? 0
      : roundRate(fromCents(balance.rmbCostCents) / (balance.gameCoinAmount / 10_000))
  });
  const wallets = [
    ...[...procurementWallets.values()].map((balance) => asWallet("procurement", balance)),
    ...[...liquidation.values()].filter((balance) => balance.gameCoinAmount > 0).map((balance) => asWallet("liquidation", balance))
  ];
  const cashouts = input.cashouts.map((cashout) => cashoutById.get(cashout.id) as MhxyGameCoinCashoutRecord);
  const cashoutSummary = cashouts.reduce<MhxyGameCoinCashoutSummary>((summary, cashout) => ({
    gameCoinAmount: summary.gameCoinAmount + cashout.gameCoinAmount,
    rmbReceived: roundRmb(summary.rmbReceived + cashout.rmbReceived),
    realizedProfitRmb: roundRmb(summary.realizedProfitRmb + cashout.realizedProfitRmb)
  }), { gameCoinAmount: 0, rmbReceived: 0, realizedProfitRmb: 0 });

  return {
    trades: input.trades.map((trade) => tradeById.get(trade.id) as MhxyTradeRecord),
    inventory,
    tradeResults,
    purchasePositions: input.purchasePositions.map((purchase) => purchaseById.get(purchase.id) as MhxyGameCoinPurchasePosition),
    cashouts,
    wallets,
    cashoutSummary
  };
}
