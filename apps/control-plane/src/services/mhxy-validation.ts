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
  itemLevel: z.number().int().positive().max(200).optional(),
  capturedAt: dateTime,
  serverName: z.string().optional(),
  serverId: z.string().max(80).optional(),
  regionName: z.string().max(120).optional(),
  sourceName: z.string().max(160).optional(),
  transferStatus: z.enum(["flat", "open", "firework", "unknown"]).optional(),
  transferStatusDate: z.string().max(40).optional(),
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

export const mhxyPriceCollectorImportSchema = z.object({
  sourcePageUrl: z.string().url().max(2048),
  capturedAt: dateTime,
  records: z.array(z.object({
    watchKey: z.string().min(1).max(500).optional(),
    itemName: z.string().trim().min(1).max(160).optional(),
    candidates: z.array(z.object({
      rmbPrice: z.number().finite().positive(),
      itemLevel: z.number().int().positive().max(200).optional(),
      listingId: z.string().max(200).optional(),
      serverId: z.string().max(80).optional(),
      serverName: z.string().trim().min(1).max(120).optional(),
      regionName: z.string().trim().min(1).max(120).optional()
    }).strict()).min(1).max(5000)
  }).strict().refine((record) => Boolean(record.watchKey || record.itemName), {
    message: "采价记录必须包含关注标识或道具名"
  })).min(1).max(300)
}).strict();

const priceCatalogItemShape = {
  itemName: z.string().trim().min(1, "道具名不能为空").max(160),
  matchNames: z.array(z.string().trim().min(1).max(160)).min(1, "至少填写一个匹配名称").max(50),
  matchMode: z.enum(["exact", "contains"]),
  carryLimit: z.number().int().positive("携带上限必须是正整数").max(10000),
  transferLockDays: z.number().int().nonnegative().max(3650).nullable(),
  note: z.string().trim().max(500).optional(),
  cbgOverallKindIds: z.array(z.string().trim().regex(/^\d{1,12}$/, "全服检索编码必须是数字")).max(100).optional()
};

export const mhxyPriceCatalogItemInputSchema = z.object(priceCatalogItemShape).strict();
export const mhxyPriceCatalogItemPatchSchema = z.object(priceCatalogItemShape).partial().strict();

const priceSeriesIdentitySchema = z.object({
  itemName: z.string().trim().min(1, "道具名不能为空"),
  serverName: z.string().optional()
}).strict();

export const mhxyPriceSeriesUpdateSchema = z.object({
  current: priceSeriesIdentitySchema,
  next: priceSeriesIdentitySchema,
  confirmMerge: z.boolean().optional()
}).strict();

const transferShape = {
  scope: z.literal("role"),
  characterName: z.string(),
  sourceServerName: z.string(),
  targetServerName: z.string(),
  transferCostRmb: finiteNonNegative,
  occurredAt: dateTime,
  note: z.string().optional()
};

export const mhxyInventoryTransferInputSchema = z.object(transferShape).strict();
export const mhxyInventoryTransferPatchSchema = z.object({
  targetServerName: transferShape.targetServerName.optional(),
  transferCostRmb: transferShape.transferCostRmb.optional(),
  occurredAt: transferShape.occurredAt.optional(),
  note: transferShape.note
}).strict();

const assetFlipShape = {
  category: z.enum(["role", "summon", "equipment"]),
  name: z.string(),
  buyAt: dateTime,
  purchaseCurrency: z.literal("rmb").optional(),
  buyPriceRmb: finiteNonNegative.optional(),
  sellAt: z.union([dateTime, z.literal("")]).optional(),
  sellPriceRmb: finiteNonNegative.optional(),
  serverName: z.string().optional(),
  characterName: z.string().optional(),
  note: z.string().optional()
};

export const mhxyAssetFlipInputSchema = z.object(assetFlipShape).strict();
export const mhxyAssetFlipPatchSchema = z.object({
  ...assetFlipShape,
  sellAt: z.union([dateTime, z.literal(""), z.null()]).optional(),
  sellPriceRmb: finiteNonNegative.nullable().optional()
}).partial().strict();

export const mhxyInventoryTargetSchema = z.object({
  itemName: z.string(),
  serverName: z.string(),
  characterName: z.string(),
  expectedSellServerName: z.string()
}).strict();

export class MhxyInputError extends Error {}

export function parseMhxyInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new MhxyInputError(result.error.issues[0]?.message ?? "梦幻西游账本输入无效");
}
