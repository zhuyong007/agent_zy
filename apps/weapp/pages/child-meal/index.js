const { api } = require("../../utils/api");
const { dateOnly, today, splitList } = require("../../utils/format");

const mealTypes = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
  { value: "snack", label: "加餐" },
  { value: "milk", label: "奶" },
  { value: "fruit", label: "水果" }
];
const acceptances = [
  { value: "喜欢", label: "喜欢" },
  { value: "一般", label: "一般" },
  { value: "不喜欢", label: "不喜欢" },
  { value: "拒绝", label: "拒绝" }
];
const planTypes = [
  { value: "today", label: "今天" },
  { value: "tomorrow", label: "明天" },
  { value: "three_days", label: "三天" },
  { value: "seven_days", label: "七天" }
];

function emptyRecordForm() {
  return {
    date: today(),
    mealType: "lunch",
    foodName: "",
    ingredients: "",
    cookingMethods: "",
    amount: "",
    acceptance: "喜欢",
    discomfort: false,
    note: ""
  };
}

function mapRecord(record) {
  return {
    id: record.id,
    title: record.foodName,
    meta: `${dateOnly(record.date)} / ${record.mealType} / ${record.acceptance}`,
    note: record.note || ""
  };
}

function mapPlan(plan) {
  if (!plan) return null;
  return {
    title: `${dateOnly(plan.dateRange && plan.dateRange.start)} 至 ${dateOnly(plan.dateRange && plan.dateRange.end)}`,
    focus: plan.days && plan.days[0] ? plan.days[0].dailyNutritionFocus : "",
    warnings: plan.warnings || [],
    days: (plan.days || []).slice(0, 3).map((day) => ({
      date: dateOnly(day.date),
      focus: day.dailyNutritionFocus,
      meals: (day.meals || []).map((meal) => ({
        key: `${day.date}-${meal.mealType}-${meal.mealName}`,
        name: meal.mealName,
        type: meal.mealType,
        ingredients: (meal.ingredients || []).join("、")
      }))
    }))
  };
}

Page({
  data: {
    loading: false,
    savingRecord: false,
    savingNote: false,
    generatingPlan: false,
    savingPlan: false,
    error: "",
    childName: "-",
    ageText: "-",
    stage: "-",
    todayRecords: [],
    recentRecords: [],
    notes: [],
    savedPlan: null,
    generatedPlan: null,
    generatedPlanView: null,
    mealTypes,
    acceptances,
    planTypes,
    mealTypeIndex: 1,
    acceptanceIndex: 0,
    planTypeIndex: 0,
    recordForm: emptyRecordForm(),
    noteForm: {
      date: today(),
      content: "",
      tags: ""
    },
    planForm: {
      planType: "today",
      userExtraRequest: ""
    }
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
      const overview = await api.childMealOverview();
      const profile = overview.profile || {};
      const childSummary = overview.childSummary || {};
      const savedPlan = (overview.savedPlans || [])[0] || null;

      this.setData({
        childName: profile.name || "-",
        ageText: childSummary.ageText || "-",
        stage: childSummary.stage || "-",
        todayRecords: (overview.todayRecords || []).map(mapRecord),
        recentRecords: (overview.recentRecords || []).slice(0, 12).map(mapRecord),
        notes: (overview.recentNotes || []).slice(0, 6).map((note) => ({
          id: note.id,
          title: note.content,
          meta: `${dateOnly(note.date)} / ${(note.tags || []).join("、") || "无标签"}`
        })),
        savedPlan: mapPlan(savedPlan)
      });
    } catch (error) {
      this.setData({ error: error.message || "读取食谱数据失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRecordInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`recordForm.${field}`]: event.detail.value });
  },

  onRecordDateChange(event) {
    this.setData({ "recordForm.date": event.detail.value });
  },

  onMealTypeChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      mealTypeIndex: index,
      "recordForm.mealType": mealTypes[index].value
    });
  },

  onAcceptanceChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      acceptanceIndex: index,
      "recordForm.acceptance": acceptances[index].value
    });
  },

  onDiscomfortChange(event) {
    this.setData({ "recordForm.discomfort": event.detail.value });
  },

  async submitRecord() {
    const form = this.data.recordForm;
    if (!String(form.foodName).trim()) {
      wx.showToast({ title: "请填写食物名称", icon: "none" });
      return;
    }

    this.setData({ savingRecord: true, error: "" });
    try {
      await api.createChildMealRecord({
        date: form.date,
        mealType: form.mealType,
        foodName: String(form.foodName).trim(),
        ingredients: splitList(form.ingredients),
        cookingMethods: splitList(form.cookingMethods),
        amount: String(form.amount || "").trim(),
        acceptance: form.acceptance,
        discomfort: Boolean(form.discomfort),
        note: String(form.note || "").trim()
      });
      this.setData({
        recordForm: emptyRecordForm(),
        mealTypeIndex: 1,
        acceptanceIndex: 0
      });
      wx.showToast({ title: "已记录", icon: "success" });
      await this.refresh();
    } catch (error) {
      this.setData({ error: error.message || "保存餐食失败" });
    } finally {
      this.setData({ savingRecord: false });
    }
  },

  onNoteInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`noteForm.${field}`]: event.detail.value });
  },

  onNoteDateChange(event) {
    this.setData({ "noteForm.date": event.detail.value });
  },

  async submitNote() {
    const form = this.data.noteForm;
    if (!String(form.content).trim()) {
      wx.showToast({ title: "请填写备注", icon: "none" });
      return;
    }

    this.setData({ savingNote: true, error: "" });
    try {
      await api.createChildMealNote({
        date: form.date,
        content: String(form.content).trim(),
        tags: splitList(form.tags)
      });
      this.setData({
        noteForm: {
          date: today(),
          content: "",
          tags: ""
        }
      });
      wx.showToast({ title: "已保存", icon: "success" });
      await this.refresh();
    } catch (error) {
      this.setData({ error: error.message || "保存备注失败" });
    } finally {
      this.setData({ savingNote: false });
    }
  },

  onPlanTypeChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      planTypeIndex: index,
      "planForm.planType": planTypes[index].value
    });
  },

  onPlanInput(event) {
    this.setData({ "planForm.userExtraRequest": event.detail.value });
  },

  async generatePlan() {
    const form = this.data.planForm;
    this.setData({ generatingPlan: true, error: "" });
    try {
      const plan = await api.generateChildMealPlan({
        planType: form.planType,
        userExtraRequest: String(form.userExtraRequest || "").trim()
      });
      this.setData({
        generatedPlan: plan,
        generatedPlanView: mapPlan(plan)
      });
      wx.showToast({ title: "已生成", icon: "success" });
    } catch (error) {
      this.setData({ error: error.message || "生成计划失败" });
    } finally {
      this.setData({ generatingPlan: false });
    }
  },

  async saveGeneratedPlan() {
    if (!this.data.generatedPlan) return;
    this.setData({ savingPlan: true, error: "" });
    try {
      await api.saveChildMealPlan(this.data.generatedPlan);
      wx.showToast({ title: "已保存", icon: "success" });
      await this.refresh();
    } catch (error) {
      this.setData({ error: error.message || "保存计划失败" });
    } finally {
      this.setData({ savingPlan: false });
    }
  }
});
