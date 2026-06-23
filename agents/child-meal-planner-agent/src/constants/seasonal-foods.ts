export const SEASONAL_FOODS = {
  spring: ["菠菜", "油菜", "莴笋", "芦笋", "豌豆", "草莓", "梨", "苹果", "鸡肉", "鱼肉", "鸡蛋"],
  summer: ["西红柿", "黄瓜", "丝瓜", "冬瓜", "茄子", "西葫芦", "玉米", "毛豆", "桃", "西瓜", "蓝莓", "鸡肉", "鱼肉", "虾", "鸡蛋"],
  autumn: ["南瓜", "山药", "莲藕", "胡萝卜", "白萝卜", "苹果", "梨", "葡萄", "牛肉", "猪肉", "鸡蛋", "鱼肉"],
  winter: ["白菜", "娃娃菜", "土豆", "胡萝卜", "白萝卜", "南瓜", "山药", "苹果", "橙子", "牛肉", "猪肉", "鸡肉", "鸡蛋"]
} as const;

export const YEAR_ROUND_FOODS = ["鸡蛋", "米饭", "面条", "猪肉", "鸡肉", "胡萝卜", "土豆"];

export function getSeasonalFoodPool(date: Date, _region = "") {
  const month = date.getUTCMonth() + 1;
  const season = month >= 3 && month <= 5 ? "spring" : month <= 8 ? "summer" : month <= 11 ? "autumn" : "winter";
  return [...new Set([...SEASONAL_FOODS[season], ...YEAR_ROUND_FOODS])];
}
