import { z, type ZodType } from "zod";

const dateTime = z.string().min(1, "时间不能为空").refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "时间格式无效"
);
const finiteNonNegative = z.number().finite().min(0);
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const tradeShape = {
  type: z.enum(["buy", "sell"]),
  itemName: z.string(),
  quantity: positiveSafeInteger,
  unitPrice: finiteNonNegative,
  currency: z.enum(["rmb", "gameCoin"]),
  feeRmb: finiteNonNegative.optional(),
  rmbPerGameCoinWan: z.number().finite().positive().optional(),
  occurredAt: dateTime,
  serverName: z.string().optional(),
  characterName: z.string().optional(),
  note: z.string().optional()
};

export const mhxyTradeInputSchema = z.object(tradeShape).strict();
export const mhxyTradePatchSchema = z.object(tradeShape).partial().strict();

const snapshotBase = {
  itemName: z.string(),
  capturedAt: dateTime,
  serverName: z.string().optional(),
  note: z.string().optional()
};

export const mhxyPriceSnapshotInputSchema = z.discriminatedUnion("currency", [
  z.object({ ...snapshotBase, currency: z.literal("rmb"), rmbUnitPrice: finiteNonNegative }).strict(),
  z.object({
    ...snapshotBase,
    currency: z.literal("gameCoin"),
    gameCoinUnitPriceWan: finiteNonNegative,
    rmbPerGameCoinWan: z
      .number({ required_error: "游戏币价格快照必须填写当时兑换比例" })
      .finite()
      .positive("当时兑换比例必须大于 0")
  }).strict()
]);

const transferShape = {
  itemName: z.string(),
  quantity: positiveSafeInteger,
  sourceServerName: z.string(),
  sourceCharacterName: z.string(),
  targetServerName: z.string(),
  targetCharacterName: z.string(),
  transferCostRmb: finiteNonNegative,
  occurredAt: dateTime,
  note: z.string().optional()
};

export const mhxyInventoryTransferInputSchema = z.object(transferShape).strict();
export const mhxyInventoryTransferPatchSchema = z.object(transferShape).partial().strict();

const assetFlipShape = {
  category: z.enum(["role", "summon", "equipment"]),
  name: z.string(),
  buyAt: dateTime,
  purchaseCurrency: z.enum(["rmb", "gameCoin"]).optional(),
  buyPriceRmb: finiteNonNegative.optional(),
  gameCoinCost: positiveSafeInteger.optional(),
  sellAt: z.union([dateTime, z.literal("")]).optional(),
  sellPriceRmb: finiteNonNegative.optional(),
  serverName: z.string().optional(),
  characterName: z.string().optional(),
  note: z.string().optional()
};

export const mhxyAssetFlipInputSchema = z.object(assetFlipShape).strict();
export const mhxyAssetFlipPatchSchema = z.object(assetFlipShape).partial().strict();

const gameCoinPurchaseShape = {
  acquiredAt: dateTime,
  gameCoinAmount: positiveSafeInteger,
  rmbCost: z.number().finite().positive(),
  serverName: z.string().trim().min(1),
  characterName: z.string().trim().min(1),
  note: z.string().optional()
};

export const mhxyGameCoinPurchaseInputSchema = z.object(gameCoinPurchaseShape).strict();
export const mhxyGameCoinPurchasePatchSchema = z.object(gameCoinPurchaseShape).partial().strict();

const gameCoinCashoutShape = {
  occurredAt: dateTime,
  serverName: z.string().min(1),
  characterName: z.string().min(1),
  gameCoinAmount: positiveSafeInteger,
  rmbReceived: z.number().finite().positive(),
  note: z.string().optional()
};

export const mhxyGameCoinCashoutInputSchema = z.object(gameCoinCashoutShape).strict();
export const mhxyGameCoinCashoutPatchSchema = z.object(gameCoinCashoutShape).partial().strict();

export const mhxyInventoryTargetSchema = z.object({
  itemName: z.string(),
  serverName: z.string(),
  characterName: z.string(),
  expectedSellServerName: z.string()
}).strict();

export function parseMhxyInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new Error(result.error.issues[0]?.message ?? "梦幻西游账本输入无效");
}
