const { api } = require("../../utils/api");
const { money, dateOnly, today } = require("../../utils/format");

const tradeTypes = [
  { value: "buy", label: "买入" },
  { value: "sell", label: "卖出" }
];
const currencies = [
  { value: "rmb", label: "人民币" },
  { value: "gameCoin", label: "游戏币" }
];
const assetCategories = [
  { value: "role", label: "角色" },
  { value: "summon", label: "召唤兽" },
  { value: "equipment", label: "装备" }
];

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyTradeForm() {
  return {
    type: "buy",
    itemName: "",
    quantity: "1",
    unitPrice: "",
    currency: "rmb",
    feeRmb: "0",
    rmbPerGameCoinWan: "",
    occurredAt: today(),
    serverName: "",
    characterName: "",
    note: ""
  };
}

function emptyAssetForm() {
  return {
    category: "role",
    name: "",
    buyAt: today(),
    buyPriceRmb: "",
    sellAt: "",
    sellPriceRmb: "",
    serverName: "",
    characterName: "",
    note: ""
  };
}

function summarizeDashboard(dashboard) {
  const total = dashboard && dashboard.overviewSummary && dashboard.overviewSummary.total;
  const summary = dashboard && dashboard.summary;

  return [
    { label: "总持仓成本", value: `${money(total && total.holdingCostRmb)} 元` },
    { label: "预期估值", value: `${money(total && total.expectedValueRmb)} 元` },
    { label: "已实现收益", value: `${money(total && total.realizedProfitRmb)} 元` },
    { label: "待估价", value: `${(summary && summary.pendingValuationCount) || 0} 项` }
  ];
}

function mapTrade(trade) {
  return {
    id: trade.id,
    title: `${trade.type === "buy" ? "买入" : "卖出"} ${trade.itemName}`,
    amount: trade.rmbAmount === null ? "待折算" : `${money(trade.rmbAmount)} 元`,
    meta: `${dateOnly(trade.occurredAt)} / ${trade.serverName || "未填服务器"} / ${trade.characterName || "未填角色"}`,
    note: trade.note || ""
  };
}

function mapAsset(asset) {
  return {
    id: asset.id,
    title: `${asset.name} / ${asset.category}`,
    amount: asset.status === "sold" && asset.profitRmb !== null
      ? `收益 ${money(asset.profitRmb)} 元`
      : `成本 ${money(asset.buyPriceRmb)} 元`,
    meta: `${dateOnly(asset.buyAt)} / ${asset.serverName || "未填服务器"} / ${asset.characterName || "未填角色"}`,
    status: asset.status === "sold" ? "已卖出" : "持有中"
  };
}

function mapInventory(item) {
  return {
    key: `${item.itemName}-${item.serverName}-${item.characterName}`,
    title: item.itemName,
    quantity: item.quantity,
    meta: `${item.serverName || "未填服务器"} / ${item.characterName || "未填角色"}`,
    cost: `${money(item.inventoryCostRmb)} 元`,
    value: item.marketValueRmb === null ? "待估价" : `${money(item.marketValueRmb)} 元`
  };
}

Page({
  data: {
    loading: false,
    savingTrade: false,
    savingAsset: false,
    error: "",
    summaryRows: [],
    recentTrades: [],
    inventory: [],
    assetFlips: [],
    tradeTypes,
    currencies,
    assetCategories,
    tradeTypeIndex: 0,
    currencyIndex: 0,
    assetCategoryIndex: 0,
    tradeForm: emptyTradeForm(),
    assetForm: emptyAssetForm()
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      const dashboard = await api.mhxy();
      const recentTrades = (dashboard.trades || [])
        .slice()
        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
        .slice(0, 12)
        .map(mapTrade);
      const assetFlips = (dashboard.assetFlips || [])
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 8)
        .map(mapAsset);

      this.setData({
        summaryRows: summarizeDashboard(dashboard),
        recentTrades,
        assetFlips,
        inventory: (dashboard.inventory || []).slice(0, 12).map(mapInventory)
      });
    } catch (error) {
      this.setData({ error: error.message || "读取梦幻数据失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onTradeInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`tradeForm.${field}`]: event.detail.value });
  },

  onTradeTypeChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      tradeTypeIndex: index,
      "tradeForm.type": tradeTypes[index].value
    });
  },

  onCurrencyChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      currencyIndex: index,
      "tradeForm.currency": currencies[index].value
    });
  },

  onTradeDateChange(event) {
    this.setData({ "tradeForm.occurredAt": event.detail.value });
  },

  async submitTrade() {
    const form = this.data.tradeForm;
    if (!String(form.itemName).trim()) {
      wx.showToast({ title: "请填写物品名", icon: "none" });
      return;
    }

    if (numberValue(form.quantity) <= 0 || numberValue(form.unitPrice) <= 0) {
      wx.showToast({ title: "数量和单价必须大于 0", icon: "none" });
      return;
    }

    if (form.currency === "gameCoin" && numberValue(form.rmbPerGameCoinWan) <= 0) {
      wx.showToast({ title: "请填写游戏币汇率", icon: "none" });
      return;
    }

    const input = {
      type: form.type,
      itemName: String(form.itemName).trim(),
      quantity: numberValue(form.quantity),
      unitPrice: numberValue(form.unitPrice),
      currency: form.currency,
      feeRmb: numberValue(form.feeRmb),
      occurredAt: form.occurredAt,
      serverName: String(form.serverName || "").trim(),
      characterName: String(form.characterName || "").trim(),
      note: String(form.note || "").trim()
    };

    if (form.currency === "gameCoin") {
      input.rmbPerGameCoinWan = numberValue(form.rmbPerGameCoinWan);
    }

    this.setData({ savingTrade: true, error: "" });
    try {
      await api.createMhxyTrade(input);
      this.setData({
        tradeForm: Object.assign(emptyTradeForm(), {
          serverName: form.serverName,
          characterName: form.characterName
        }),
        tradeTypeIndex: 0,
        currencyIndex: 0
      });
      wx.showToast({ title: "已记录", icon: "success" });
      await this.refresh();
    } catch (error) {
      this.setData({ error: error.message || "保存交易失败" });
    } finally {
      this.setData({ savingTrade: false });
    }
  },

  deleteTrade(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除交易",
      content: "确认删除这条梦幻交易记录？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteMhxyTrade(id);
          wx.showToast({ title: "已删除", icon: "success" });
          await this.refresh();
        } catch (error) {
          this.setData({ error: error.message || "删除交易失败" });
        }
      }
    });
  },

  onAssetInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`assetForm.${field}`]: event.detail.value });
  },

  onAssetCategoryChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      assetCategoryIndex: index,
      "assetForm.category": assetCategories[index].value
    });
  },

  onAssetBuyDateChange(event) {
    this.setData({ "assetForm.buyAt": event.detail.value });
  },

  onAssetSellDateChange(event) {
    this.setData({ "assetForm.sellAt": event.detail.value });
  },

  async submitAsset() {
    const form = this.data.assetForm;
    if (!String(form.name).trim() || numberValue(form.buyPriceRmb) <= 0) {
      wx.showToast({ title: "请填写名称和买入价", icon: "none" });
      return;
    }

    const input = {
      category: form.category,
      name: String(form.name).trim(),
      buyAt: form.buyAt,
      buyPriceRmb: numberValue(form.buyPriceRmb),
      serverName: String(form.serverName || "").trim(),
      characterName: String(form.characterName || "").trim(),
      note: String(form.note || "").trim()
    };

    if (String(form.sellAt || "").trim() && numberValue(form.sellPriceRmb) > 0) {
      input.sellAt = form.sellAt;
      input.sellPriceRmb = numberValue(form.sellPriceRmb);
    }

    this.setData({ savingAsset: true, error: "" });
    try {
      await api.createMhxyAssetFlip(input);
      this.setData({
        assetForm: Object.assign(emptyAssetForm(), {
          serverName: form.serverName,
          characterName: form.characterName
        }),
        assetCategoryIndex: 0
      });
      wx.showToast({ title: "已记录", icon: "success" });
      await this.refresh();
    } catch (error) {
      this.setData({ error: error.message || "保存资产失败" });
    } finally {
      this.setData({ savingAsset: false });
    }
  },

  deleteAsset(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除资产",
      content: "确认删除这条资产交易记录？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteMhxyAssetFlip(id);
          wx.showToast({ title: "已删除", icon: "success" });
          await this.refresh();
        } catch (error) {
          this.setData({ error: error.message || "删除资产失败" });
        }
      }
    });
  }
});
