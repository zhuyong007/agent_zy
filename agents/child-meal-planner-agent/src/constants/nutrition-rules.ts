export const PROTEIN_FOODS = ["鸡肉", "猪肉", "牛肉", "鱼", "鱼肉", "虾", "鸡蛋", "蛋", "豆腐"];
export const VEGETABLE_FOODS = ["菠菜", "油菜", "莴笋", "芦笋", "豌豆", "西红柿", "番茄", "黄瓜", "丝瓜", "冬瓜", "茄子", "西葫芦", "南瓜", "山药", "莲藕", "胡萝卜", "白萝卜", "白菜", "娃娃菜", "土豆"];
export const FRUIT_FOODS = ["草莓", "梨", "苹果", "桃", "西瓜", "蓝莓", "葡萄", "橙子", "水果"];
export const STAPLE_FOODS = ["米饭", "大米", "面条", "粥", "燕麦", "玉米", "馒头", "软饭"];
export const FORBIDDEN_TERMS = ["药物", "保健品", "补剂", "营养补充剂", "蜂蜜", "整颗坚果", "高盐", "高糖", "重油", "辛辣"];

export function feedingStage(monthAge: number) {
  if (monthAge < 6) return "未进入常规辅食阶段";
  if (monthAge <= 8) return "6-8月龄泥糊辅食阶段";
  if (monthAge <= 11) return "9-11月龄碎末与手指食物阶段";
  if (monthAge <= 24) return "12-24月龄幼儿软饭阶段";
  return "家庭清淡饮食过渡阶段";
}
