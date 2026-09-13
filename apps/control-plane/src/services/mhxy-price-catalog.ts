import type { MhxyPriceCatalogItemInput } from "@agent-zy/shared-types";

export type MhxyDefaultPriceCatalogItem = MhxyPriceCatalogItemInput;

const item = (
  itemName: string,
  carryLimit: number,
  transferLockDays: number | null,
  matchNames: string[] = [itemName],
  note?: string,
  matchMode: "exact" | "contains" = "exact",
  cbgOverallKindIds?: string[]
): MhxyDefaultPriceCatalogItem => ({
  itemName,
  matchNames,
  matchMode,
  carryLimit,
  transferLockDays,
  ...(note ? { note } : {}),
  ...(cbgOverallKindIds?.length ? { cbgOverallKindIds } : {})
});

const items = (
  names: string[],
  carryLimit: number,
  transferLockDays: number | null,
  note?: string
) => names.map((name) => item(name, carryLimit, transferLockDays, [name], note));

export const MHXY_DEFAULT_PRICE_SOURCE_NAME = "藏宝阁（全部道具）";

export const MHXY_DEFAULT_PRICE_CATALOG: MhxyDefaultPriceCatalogItem[] = [
  item("植物的种子", 10, 30, ["种子"], "不区分种类、等级", "contains"),
  item("彩果", 150, 30),
  item("青龙石/白虎石/朱雀石/玄武石", 495, 30, ["青龙石", "白虎石", "朱雀石", "玄武石"], "不区分种类"),
  item("炼兽珍经", 10, 30),
  item("神兜兜", 99, 180),
  ...items(["笔", "墨", "纸", "砚"], 20, 30),
  ...items(["月饼", "梦幻精品粽"], 10, 30),
  ...items(["芝麻沁香元宵", "桂花酒酿元宵", "细磨豆沙元宵", "蜜糖腰果元宵", "山楂拔丝元宵", "滑玉莲蓉元宵"], 30, 30),
  item("水晶糕", 5, 30),
  item("黄帝内经/奇异果/还魂密术/蚩尤武诀", 10, 30, ["黄帝内经", "奇异果", "还魂密术", "蚩尤武诀"], "不区分种类", "exact", ["606", "904", "905", "906"]),
  ...items([
    "太阳石", "月亮石", "光芒石", "神秘石", "红宝石", "黄宝石", "蓝宝石", "绿宝石", "黑宝石", "红玛瑙",
    "舍利子", "翡翠石", "精魄灵石", "星辉石", "钟灵石", "玄灵珠", "五色灵尘"
  ], 20, 90, "按官方等级及转服时间锁限制携带").map((catalogItem) => ({
    ...catalogItem,
    cbgOverallKindIds: ({
      "太阳石": ["4002"], "月亮石": ["4003"], "光芒石": ["4004"], "神秘石": ["4005"],
      "红宝石": ["4006"], "黄宝石": ["4007"], "蓝宝石": ["4008"], "绿宝石": ["4009"],
      "黑宝石": ["4010"], "红玛瑙": ["4011"], "舍利子": ["4012"], "翡翠石": ["4249"],
      "精魄灵石": ["4036", "4037", "4038"], "星辉石": ["4244"], "钟灵石": ["50344"],
      "玄灵珠": ["56973", "56974"], "五色灵尘": ["61719"]
    } as Record<string, string[]>)[catalogItem.itemName]
  })),
  item("百炼精铁", 6, 180, ["百炼精铁"], undefined, "exact", ["4001"]),
  item("制造指南书", 6, 180, ["制造指南书"], undefined, "exact", ["612"]),
  item("灵饰指南书", 6, 180, ["灵饰指南书"], undefined, "exact", ["18126"]),
  item("元灵晶石", 6, 180, ["元灵晶石"], undefined, "exact", ["4243"]),
  item("炼妖石/上古锻造图策/天眼珠/三眼天珠/九眼天珠", 10, 180, ["炼妖石", "上古锻造图策", "天眼珠", "三眼天珠", "九眼天珠"], "不区分种类、等级"),
  item("珍珠（≥130级）", 10, 90, ["珍珠"]),
  item("点化石", 10, 90, ["点化石"], undefined, "exact", ["4034"]),
  ...items(["高级魔兽要诀", "低级魔兽要诀"], 40, 90),
  item("高级藏宝图", 40, 90, ["高级藏宝图", "高宝图"]),
  item("特赦令牌", 20, 90),
  ...items(["金刚石", "定魂珠", "夜光珠"], 20, 30),
  item("高级内丹", 40, 90, ["高级内丹", "高级召唤兽内丹"], undefined, "exact", ["4103"]),
  item("低级内丹", 40, 90),
  ...items(["玄天残卷", "圣兽丹", "超级金柳露", "摇钱树苗", "修炼果"], 20, 30),
  item("未激活的符石", 20, 90, ["未激活的符石", "未激活符石"], "不区分一级、二级、三级"),
  ...items(["星力碎片", "未激活星石"], 20, 90),
  item("天眼通符", 60, null),
  item("金银锦盒", 20, null),
  item("陨铁", 6, 180),
  item("元身", 6, 180, ["元身"], "不区分部位", "contains", [
    "4221", "4222", "4223", "4224", "4225", "4226", "4227", "4228", "4229", "4230", "4231", "4232",
    "4233", "4234", "4235", "4236", "4237", "4238", "4239", "4240", "4241", "4242", "4246", "4247", "4248", "63232"
  ]),
  item("附魔宝珠", 5, 90, ["附魔宝珠"], "不区分部位", "exact", ["3995"]),
  ...items(["易经丹", "初级清灵仙露", "中级清灵仙露", "高级清灵仙露", "清灵净瓶", "玉葫灵髓"], 10, 90),
  item("钨金", 60, null, ["钨金"], "不区分等级"),
  item("归墟之证", 20, 180),
  item("灵犀之屑", 100, 180),
  item("灵犀玉", 10, 180, ["灵犀玉"], "1级、2级、未鉴定", "exact", ["6904"]),
  item("指定变身卡", 40, 90, ["混沌兽变身卡", "夜罗刹变身卡", "曼珠沙华变身卡"]),
  item("金砂丹", 10, null),
  item("法宝任务书", 40, 90),
  item("如意丹", 150, 90),
  item("考古物品", 40, null, ["考古铁铲", "考古宝盒", "古董秘宝", "未鉴定的古董", "古董鉴赏残篇", "檀木古董盒子", "金属碎片", "瓷器碎片", "木器碎片", "玉器碎片"], "不区分种类"),
  item("超级净瓶玉露", 40, 30),
  item("人参果", 40, 30),
  item("碎石锤", 40, 90),
  item("精致碎石锤", 20, 90),
  item("超级碎石锤", 5, 90),
  item("特殊千亿兽诀", 5, 30),
  item("女娲祝符", 40, 90, ["女娲祝符"], "区分种类", "contains"),
  item("女娲灵契", 40, 90, ["女娲灵契"], "区分种类", "contains")
];
