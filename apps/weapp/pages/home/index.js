const { getApiBase, setApiBase, resetApiBase } = require("../../config");
const { api } = require("../../utils/api");
const { money, integer } = require("../../utils/format");

function buildStats(dashboard, mhxy, childMeal) {
  const total = mhxy && mhxy.overviewSummary && mhxy.overviewSummary.total;
  const childSummary = childMeal && childMeal.childSummary;

  return [
    {
      label: "近期任务",
      value: integer((dashboard && dashboard.recentTasks && dashboard.recentTasks.length) || 0)
    },
    {
      label: "梦幻持仓成本",
      value: `${money(total && total.holdingCostRmb)} 元`
    },
    {
      label: "梦幻已实现收益",
      value: `${money(total && total.realizedProfitRmb)} 元`
    },
    {
      label: "宝宝年龄",
      value: (childSummary && childSummary.ageText) || "-"
    }
  ];
}

Page({
  data: {
    apiBase: "",
    loading: false,
    checking: false,
    error: "",
    healthText: "未检测",
    stats: [],
    recentTasks: [],
    childWarnings: [],
    todayMeals: []
  },

  onLoad() {
    this.setData({ apiBase: getApiBase() });
    this.refreshAll();
  },

  onShow() {
    this.setData({ apiBase: getApiBase() });
  },

  onApiBaseInput(event) {
    this.setData({ apiBase: event.detail.value });
  },

  saveApiBase() {
    const apiBase = setApiBase(this.data.apiBase);
    this.setData({ apiBase });
    wx.showToast({ title: "已保存", icon: "success" });
    this.refreshAll();
  },

  resetApiBase() {
    const apiBase = resetApiBase();
    this.setData({ apiBase });
    wx.showToast({ title: "已恢复默认", icon: "success" });
  },

  async checkConnection() {
    this.setData({ checking: true, error: "" });
    try {
      await api.health();
      this.setData({ healthText: "连接正常" });
      wx.showToast({ title: "后端可访问", icon: "success" });
    } catch (error) {
      this.setData({
        healthText: "连接失败",
        error: error.message || "后端连接失败"
      });
    } finally {
      this.setData({ checking: false });
    }
  },

  async refreshAll() {
    this.setData({ loading: true, error: "" });
    try {
      const dashboard = await api.dashboard();
      const mhxy = await api.mhxy();
      const childMeal = await api.childMealOverview();
      const recentTasks = (dashboard.recentTasks || []).slice(0, 5).map((task) => ({
        id: task.id,
        summary: task.summary,
        status: task.status,
        updatedAt: String(task.updatedAt || "").slice(0, 16).replace("T", " ")
      }));
      const todayMeals = (childMeal.todayRecords || []).slice(0, 4).map((record) => ({
        id: record.id,
        title: record.foodName,
        meta: `${record.mealType} / ${record.acceptance}`
      }));

      this.setData({
        healthText: "连接正常",
        stats: buildStats(dashboard, mhxy, childMeal),
        recentTasks,
        childWarnings: childMeal.warnings || [],
        todayMeals
      });
    } catch (error) {
      this.setData({
        healthText: "连接失败",
        error: error.message || "读取首页失败"
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goPage(event) {
    wx.switchTab({
      url: event.currentTarget.dataset.url
    });
  }
});
