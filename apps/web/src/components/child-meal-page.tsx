import { useEffect, useState, type FormEvent } from "react";

import type { ChildMealOverview, ChildMealPlan, ChildMealPlanType, ChildMealRecord, ChildNote, ChildProfile } from "@agent-zy/shared-types";

import {
  convertChildMealPlanMeal,
  createChildMealNote,
  createChildMealRecord,
  deleteChildMealNote,
  deleteChildMealRecord,
  fetchChildMealOverview,
  generateChildMealPlan,
  saveChildMealPlan,
  saveChildMealProfile,
  updateChildMealNote,
  updateChildMealRecord
} from "../api";
import { CommandRail, useHomeLayoutPreferences, useLiveClock, useThemePreference } from "./dashboard-page";
import { ToolsBackLink } from "./tools-page";

type Props = {
  fetchAction?: () => Promise<ChildMealOverview>;
  saveProfileAction?: (input: Partial<ChildProfile>) => Promise<ChildMealOverview>;
  createNoteAction?: (input: Partial<ChildNote>) => Promise<unknown>;
  deleteNoteAction?: (id: string) => Promise<unknown>;
  updateNoteAction?: (id: string, input: Partial<ChildNote>) => Promise<unknown>;
  createRecordAction?: (input: Partial<ChildMealRecord>) => Promise<unknown>;
  deleteRecordAction?: (id: string) => Promise<unknown>;
  updateRecordAction?: (id: string, input: Partial<ChildMealRecord>) => Promise<unknown>;
  generatePlanAction?: (input: { planType: ChildMealPlanType; userExtraRequest?: string }) => Promise<ChildMealPlan>;
  savePlanAction?: (plan: ChildMealPlan) => Promise<unknown>;
  convertMealAction?: (input: { date: string; meal: ChildMealPlan["days"][number]["meals"][number] }) => Promise<unknown>;
};

const join = (values: string[]) => values.join("、");
const split = (value: string) => value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
const errorText = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试";

export function ChildMealWorkspace({
  fetchAction = fetchChildMealOverview,
  saveProfileAction = saveChildMealProfile,
  createNoteAction = createChildMealNote,
  deleteNoteAction = deleteChildMealNote,
  updateNoteAction = updateChildMealNote,
  createRecordAction = createChildMealRecord,
  deleteRecordAction = deleteChildMealRecord,
  updateRecordAction = updateChildMealRecord,
  generatePlanAction = generateChildMealPlan,
  savePlanAction = saveChildMealPlan,
  convertMealAction = convertChildMealPlanMeal
}: Props) {
  const [overview, setOverview] = useState<ChildMealOverview | null>(null);
  const [profile, setProfile] = useState<Partial<ChildProfile>>({});
  const [noteContent, setNoteContent] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [mealName, setMealName] = useState("");
  const [mealIngredients, setMealIngredients] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [acceptance, setAcceptance] = useState("一般");
  const [discomfort, setDiscomfort] = useState(false);
  const [planType, setPlanType] = useState<ChildMealPlanType>("today");
  const [extraRequest, setExtraRequest] = useState("");
  const [plan, setPlan] = useState<ChildMealPlan | null>(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await fetchAction();
    setOverview(data);
    setProfile(data.profile);
  }

  useEffect(() => {
    void refresh().catch((nextError) => setError(errorText(nextError))).finally(() => setStatus("idle"));
  }, [fetchAction]);

  async function run(action: () => Promise<unknown>, success: string, shouldRefresh = true) {
    setStatus("working");
    setError(null);
    setMessage(null);
    try {
      await action();
      if (shouldRefresh) await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(errorText(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await run(() => saveProfileAction(profile), "孩子信息已保存");
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!noteContent.trim()) return;
    await run(() => createNoteAction({ content: noteContent, tags: split(noteTags) }), "备注已保存");
    setNoteContent("");
    setNoteTags("");
  }

  async function addRecord(event: FormEvent) {
    event.preventDefault();
    if (!mealName.trim()) return;
    await run(() => createRecordAction({
      mealType: mealType as ChildMealRecord["mealType"],
      foodName: mealName,
      ingredients: split(mealIngredients),
      cookingMethods: [],
      acceptance: acceptance as ChildMealRecord["acceptance"],
      discomfort
    }), "已记录，后续食谱会自动避开近期高频重复食材");
    setMealName("");
    setMealIngredients("");
  }

  async function generate() {
    setStatus("generating");
    setError(null);
    setMessage(null);
    try {
      setPlan(await generatePlanAction({ planType, userExtraRequest: extraRequest.trim() || undefined }));
    } catch (nextError) {
      setError(errorText(nextError));
    } finally {
      setStatus("idle");
    }
  }

  async function copyPlan() {
    if (!plan || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
    setMessage("食谱已复制");
  }

  async function editNote(note: ChildNote) {
    const content = window.prompt("修改备注", note.content);
    if (content?.trim()) await run(() => updateNoteAction(note.id, { content }), "备注已更新");
  }

  async function editRecord(record: ChildMealRecord) {
    const foodName = window.prompt("修改食物名称", record.foodName);
    if (foodName?.trim()) await run(() => updateRecordAction(record.id, { foodName }), "饮食记录已更新");
  }

  if (!overview) return <section className="child-meal-shell"><p>{error ?? "正在读取孩子食谱数据..."}</p></section>;

  const missing = [
    !profile.allergies?.length ? "过敏信息" : "",
    !profile.chewingAbility ? "咀嚼能力" : ""
  ].filter(Boolean);

  return (
    <section className="child-meal-shell">
      <header className="tools-page-header">
        <div><p className="eyebrow">Long-term Meal Planner</p><h1>孩子食谱</h1><p>记录每天吃过什么，让未来食谱更均衡、更少重复，也更方便做饭。</p></div>
        <ToolsBackLink />
      </header>
      {error ? <p className="tools-notice tools-notice--error">{error}</p> : null}
      {message ? <p className="tools-notice">{message}</p> : null}
      {overview.warnings.map((warning) => <p className="tools-notice tools-notice--error" key={warning}>{warning}</p>)}

      <section className="child-meal-summary">
        <div><span>年龄</span><strong>{overview.childSummary.ageText}</strong></div>
        <div><span>当前月龄</span><strong>{overview.childSummary.monthAge} 个月</strong></div>
        <div><span>喂养阶段</span><strong>{overview.childSummary.stage}</strong></div>
        <div><span>喝奶 / 睡眠</span><strong>{profile.milkNote || profile.sleepNote || "尚未填写"}</strong></div>
      </section>

      <form className="child-meal-panel" onSubmit={saveProfile}>
        <div className="child-meal-panel__title"><div><p className="eyebrow">Profile</p><h2>孩子信息</h2></div><button disabled={status !== "idle"}>保存信息</button></div>
        <p>填写越完整，食谱越准确。未填写时，系统会按当前月龄的一般饮食原则推荐。</p>
        <div className="child-meal-fields">
          <label><span>出生日期</span><input type="date" value={profile.birthDate ?? ""} onChange={(event) => setProfile({ ...profile, birthDate: event.target.value })} /></label>
          <label><span>身高</span><input value={profile.height ?? ""} onChange={(event) => setProfile({ ...profile, height: event.target.value })} placeholder="例如 82cm" /></label>
          <label><span>体重</span><input value={profile.weight ?? ""} onChange={(event) => setProfile({ ...profile, weight: event.target.value })} placeholder="例如 11kg" /></label>
          <label><span>地区</span><input value={profile.region ?? ""} onChange={(event) => setProfile({ ...profile, region: event.target.value })} /></label>
          <label><span>咀嚼能力</span><select value={profile.chewingAbility ?? ""} onChange={(event) => setProfile({ ...profile, chewingAbility: event.target.value })}><option value="">未填写</option><option>泥糊</option><option>碎末</option><option>小块</option><option>手指食物</option><option>接近成人软饭</option></select></label>
          <label><span>过敏食物</span><input value={join(profile.allergies ?? [])} onChange={(event) => setProfile({ ...profile, allergies: split(event.target.value) })} /></label>
          <label><span>不爱吃食物</span><input value={join(profile.dislikedFoods ?? [])} onChange={(event) => setProfile({ ...profile, dislikedFoods: split(event.target.value) })} /></label>
          <label><span>喜欢食物</span><input value={join(profile.favoriteFoods ?? [])} onChange={(event) => setProfile({ ...profile, favoriteFoods: split(event.target.value) })} /></label>
          <label><span>喝奶备注</span><input value={profile.milkNote ?? ""} onChange={(event) => setProfile({ ...profile, milkNote: event.target.value })} /></label>
          <label><span>睡眠备注</span><input value={profile.sleepNote ?? ""} onChange={(event) => setProfile({ ...profile, sleepNote: event.target.value })} /></label>
          <label><span>家庭常备食材</span><input value={join(profile.householdIngredients ?? [])} onChange={(event) => setProfile({ ...profile, householdIngredients: split(event.target.value) })} /></label>
          <label><span>做饭设备</span><input value={join(profile.cookingEquipment ?? [])} onChange={(event) => setProfile({ ...profile, cookingEquipment: split(event.target.value) })} /></label>
          <label><span>家庭忌口</span><input value={join(profile.householdRestrictions ?? [])} onChange={(event) => setProfile({ ...profile, householdRestrictions: split(event.target.value) })} /></label>
          <label><span>每天几点醒</span><input type="time" value={profile.wakeTime ?? ""} onChange={(event) => setProfile({ ...profile, wakeTime: event.target.value })} /></label>
          <label><span>每天几点睡</span><input type="time" value={profile.bedtime ?? ""} onChange={(event) => setProfile({ ...profile, bedtime: event.target.value })} /></label>
          <label><span>午睡时间</span><input value={profile.napNote ?? ""} onChange={(event) => setProfile({ ...profile, napNote: event.target.value })} /></label>
          <label className="child-meal-check"><input type="checkbox" checked={profile.premature ?? false} onChange={(event) => setProfile({ ...profile, premature: event.target.checked })} />是否早产</label>
        </div>
      </form>

      <div className="child-meal-columns">
        <section className="child-meal-panel">
          <h2>近期备注</h2>
          <form data-role="note-form" onSubmit={addNote}>
            <input name="noteContent" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="记录喝奶、睡眠、便便、胃口、偏好..." />
            <input value={noteTags} onChange={(event) => setNoteTags(event.target.value)} placeholder="标签，用顿号分隔" />
            <button disabled={status !== "idle"}>新增备注</button>
          </form>
          <div className="child-meal-list">{overview.recentNotes.length ? overview.recentNotes.map((note) => <article key={note.id}><strong>{note.content}</strong><span>{note.tags.join(" · ") || note.date}</span><div><button onClick={() => void editNote(note)}>编辑</button><button onClick={() => void run(() => deleteNoteAction(note.id), "备注已删除")}>删除</button></div></article>) : <p>还没有近期备注。</p>}</div>
        </section>
        <section className="child-meal-panel">
          <h2>今天吃了什么</h2>
          <form onSubmit={addRecord}>
            <select value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="breakfast">早餐</option><option value="lunch">午餐</option><option value="dinner">晚餐</option><option value="snack">加餐</option><option value="milk">奶</option><option value="fruit">水果</option></select>
            <input value={mealName} onChange={(event) => setMealName(event.target.value)} placeholder="食物名称" />
            <input value={mealIngredients} onChange={(event) => setMealIngredients(event.target.value)} placeholder="食材，用顿号分隔" />
            <select value={acceptance} onChange={(event) => setAcceptance(event.target.value)}><option>喜欢</option><option>一般</option><option>不喜欢</option><option>拒绝</option></select>
            <label className="child-meal-check"><input type="checkbox" checked={discomfort} onChange={(event) => setDiscomfort(event.target.checked)} />过敏或不适</label>
            <button disabled={status !== "idle"}>记录</button>
          </form>
          <div className="child-meal-list">{overview.todayRecords.length ? overview.todayRecords.map((record) => <article key={record.id}><strong>{record.foodName}</strong><span>{record.mealType} · {record.acceptance}{record.discomfort ? " · 有不适" : ""}</span><div><button onClick={() => void editRecord(record)}>编辑</button><button onClick={() => void run(() => deleteRecordAction(record.id), "记录已删除")}>删除</button></div></article>) : <p>今天还没有饮食记录。</p>}</div>
        </section>
      </div>

      <section className="child-meal-panel">
        <div className="child-meal-panel__title"><div><p className="eyebrow">Plan</p><h2>食谱生成</h2></div><div><button data-action="generate-plan" type="button" disabled={status !== "idle"} onClick={() => void generate()}>{status === "generating" ? "正在生成..." : plan ? "重新生成" : "生成食谱"}</button>{plan ? <><button data-action="save-plan" type="button" onClick={() => void run(() => savePlanAction(plan), "食谱计划已保存")}>保存为计划</button><button type="button" onClick={() => void copyPlan()}>复制食谱</button></> : null}</div></div>
        {missing.length ? <p className="tools-notice">这些信息未填写：{missing.join("、")}。系统将按当前月龄的一般情况生成，填写后会更准确。</p> : null}
        <div className="child-meal-generator"><select value={planType} onChange={(event) => setPlanType(event.target.value as ChildMealPlanType)}><option value="today">今日食谱</option><option value="tomorrow">明日食谱</option><option value="three_days">未来 3 天</option><option value="seven_days">未来 7 天</option></select><input value={extraRequest} onChange={(event) => setExtraRequest(event.target.value)} placeholder="额外要求，例如今天想吃鱼" /></div>
        {plan ? <div className="child-meal-plan">{plan.days.map((day) => <article key={day.date} className="child-meal-day"><h3>{day.date}</h3><p><strong>营养重点：</strong>{day.dailyNutritionFocus}</p><p><strong>避免重复：</strong>{day.avoidRepeatReason}</p>{day.meals.map((meal, index) => <div className="child-meal-meal" key={`${meal.mealType}-${index}`}><div><strong>{meal.mealName}</strong><span>{meal.mealType}</span></div><p>食材：{meal.ingredients.join("、")}</p><p>做法：{meal.simpleSteps.join("；")}</p><p>处理：{meal.textureAdvice}</p><p>营养目的：{meal.nutritionPurpose}</p><button type="button" onClick={() => void run(() => convertMealAction({ date: day.date, meal }), "已转为实际饮食记录")}>标记为实际吃了</button></div>)}<p><strong>做饭顺序：</strong>{day.cookingOrder.join("；")}</p></article>)}</div> : <p>选择计划范围后生成食谱。</p>}
      </section>

      <section className="child-meal-panel">
        <h2>历史记录与轮换</h2>
        <div className="child-meal-stats">
          <div><strong>30 天高频食材</strong><p>{overview.historyStats.frequentIngredients30d.map((item) => `${item.name}×${item.count}`).join("、") || "暂无"}</p></div>
          <div><strong>最近拒绝 / 不适</strong><p>{[...overview.historyStats.rejectedFoods, ...overview.historyStats.discomfortFoods].join("、") || "暂无"}</p></div>
          <div><strong>动物蛋白轮换</strong><p>{overview.historyStats.proteinRotation.join("、") || "暂无"}</p></div>
          <div><strong>蔬菜 / 水果轮换</strong><p>{[...overview.historyStats.vegetableRotation, ...overview.historyStats.fruitRotation].join("、") || "暂无"}</p></div>
        </div>
      </section>
    </section>
  );
}

export function ChildMealPage() {
  const clockLine = useLiveClock();
  const [themeKey, setThemeKey] = useThemePreference();
  const [railExpanded, setRailExpanded] = useState(true);
  const { layout } = useHomeLayoutPreferences();
  return <main className="workspace tools-workspace"><CommandRail activeSection="tools" expanded={railExpanded} onToggle={() => setRailExpanded((value) => !value)} themeKey={themeKey} onThemeChange={setThemeKey} clockLine={clockLine} navigationLayout={layout} rightMeta={[]} /><ChildMealWorkspace /></main>;
}
