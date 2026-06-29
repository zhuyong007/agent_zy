# 梦幻西游当前道具快捷新增物价记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前道具价格走势中直接追加一期价格，只填写币种、价格和采集时间，并自动继承道具名与来源。

**Architecture:** 保持现有价格快照 API 与“来源 + 道具名”聚合规则不变。在 `PriceTrendWorkspace` 内增加受控快捷入口，并新增拥有本地币种状态的 `QuickSnapshotForm`。切换序列时通过序列键重建表单；成功后关闭，失败时保留原生表单值。

**Tech Stack:** React 18、TypeScript、TanStack Query、Vitest、JSDOM、CSS

---

## 文件结构

- Modify: `apps/web/src/components/mhxy-page.tsx` — 管理当前序列、快捷入口状态与快捷价格表单的数据组装。
- Modify: `apps/web/src/components/mhxy-page.test.ts` — 验证快捷表单上下文、人民币/游戏币提交与成功/失败状态。
- Modify: `apps/web/src/styles.css` — 为快捷入口、紧凑表单及窄屏布局提供样式。

### Task 1: 用失败测试定义完整快捷记录行为

**Files:**
- Modify: `apps/web/src/components/mhxy-page.test.ts:439`

- [ ] **Step 1: 添加打开快捷表单的测试助手**

在 `switchTab` 助手后加入：

```tsx
async function openQuickPriceForm(container: HTMLElement) {
  const details = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
  expect(details).not.toBeNull();
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
  return details;
}
```

- [ ] **Step 2: 添加人民币快捷提交与空状态测试**

```tsx
it("adds an RMB snapshot from the active price series without repeated context", async () => {
  const container = await renderPage();
  await switchTab(container, "物价记录");
  const details = await openQuickPriceForm(container);
  const form = details.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;

  expect(form.textContent).toContain("高级连击 · 藏宝阁（兽决）");
  expect(form.querySelector('[name="itemName"]')).toBeNull();
  expect(form.querySelector('[name="serverName"]')).toBeNull();
  change(form.querySelector('[name="price"]') as HTMLInputElement, "338");
  change(form.querySelector('[name="capturedAt"]') as HTMLInputElement, "2026-06-29T09:30");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  expect(createMhxyPriceSnapshot).toHaveBeenCalledWith({
    itemName: "高级连击",
    serverName: "藏宝阁（兽决）",
    currency: "rmb",
    rmbUnitPrice: 338,
    capturedAt: "2026-06-29T09:30"
  });
  expect(details.open).toBe(false);
});

it("does not show quick entry before any price series exists", async () => {
  const dashboard = await fetchMhxyDashboard();
  vi.mocked(fetchMhxyDashboard).mockResolvedValueOnce({ ...dashboard, priceSnapshots: [] });
  const container = await renderPage();
  await switchTab(container, "物价记录");

  expect(container.querySelector(".mhxy-price-quick-add")).toBeNull();
  expect(container.querySelector(".mhxy-price-add")).not.toBeNull();
});
```

- [ ] **Step 3: 添加游戏币汇率测试**

```tsx
it("requires and submits the exchange rate for a quick game coin snapshot", async () => {
  const container = await renderPage();
  await switchTab(container, "物价记录");
  const details = await openQuickPriceForm(container);
  const form = details.querySelector('[data-form="quick-price-snapshot"]') as HTMLFormElement;
  await act(async () => change(form.querySelector('[name="currency"]') as HTMLSelectElement, "gameCoin"));

  const rate = form.querySelector('[name="rate"]') as HTMLInputElement;
  expect(rate.required).toBe(true);
  expect(rate.min).toBe("0.000001");
  change(form.querySelector('[name="price"]') as HTMLInputElement, "4200");
  change(rate, "0.081");
  change(form.querySelector('[name="capturedAt"]') as HTMLInputElement, "2026-06-29T10:00");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  expect(createMhxyPriceSnapshot).toHaveBeenCalledWith({
    itemName: "高级连击",
    serverName: "藏宝阁（兽决）",
    currency: "gameCoin",
    gameCoinUnitPriceWan: 4200,
    rmbPerGameCoinWan: 0.081,
    capturedAt: "2026-06-29T10:00"
  });
});
```

- [ ] **Step 4: 添加切换上下文与失败保留测试**

```tsx
it("closes and resets quick entry when switching the observed item", async () => {
  const container = await renderPage();
  await switchTab(container, "物价记录");
  let details = await openQuickPriceForm(container);
  change(details.querySelector('[name="price"]') as HTMLInputElement, "999");
  const itemButton = Array.from(container.querySelectorAll("[data-price-item]"))
    .find((button) => button.textContent?.includes("高级必杀"));
  await act(async () => itemButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  details = container.querySelector(".mhxy-price-quick-add") as HTMLDetailsElement;
  expect(details.open).toBe(false);
  details = await openQuickPriceForm(container);
  expect(details.textContent).toContain("高级必杀 · 藏宝阁（兽决）");
  expect((details.querySelector('[name="price"]') as HTMLInputElement).value).toBe("");
});

it("keeps quick price inputs open when submission fails", async () => {
  vi.mocked(createMhxyPriceSnapshot).mockRejectedValueOnce(new Error("保存失败"));
  const container = await renderPage();
  await switchTab(container, "物价记录");
  const details = await openQuickPriceForm(container);
  const price = details.querySelector('[name="price"]') as HTMLInputElement;
  change(price, "337");
  await act(async () => details.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  expect(details.open).toBe(true);
  expect(price.value).toBe("337");
  expect(container.textContent).toContain("保存失败");
});
```

- [ ] **Step 5: 运行测试并确认正确失败**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: FAIL，首个新增测试报告 `.mhxy-price-quick-add` 不存在；失败来自缺少功能而非测试语法错误。

- [ ] **Step 6: 提交测试红灯**

```bash
git add apps/web/src/components/mhxy-page.test.ts docs/superpowers/plans/2026-06-29-mhxy-quick-price-entry.md
git commit -m "test(mhxy): define quick price entry behavior"
```

### Task 2: 实现当前序列快捷表单

**Files:**
- Modify: `apps/web/src/components/mhxy-page.tsx:453-672`

- [ ] **Step 1: 增加快捷入口状态并在切换道具时关闭**

在 `PriceTrendWorkspace` 中加入：

```tsx
const [quickFormOpen, setQuickFormOpen] = useState(false);
```

观察列表按钮改为：

```tsx
onClick={() => {
  setSelectedKey(item.key);
  setQuickFormOpen(false);
}}
```

- [ ] **Step 2: 在趋势标题身份区加入快捷入口**

把 `.mhxy-price-trend__heading` 的左侧内容替换为：

```tsx
<div className="mhxy-price-trend__identity">
  <div>
    <span>{activeSeries.sourceName}</span>
    <h3>{activeSeries.itemName}</h3>
    <small>最新采集于 {latest.capturedAt.slice(0, 10)}</small>
  </div>
  <details
    className="mhxy-price-quick-add"
    open={quickFormOpen}
    onToggle={(event) => setQuickFormOpen(event.currentTarget.open)}
  >
    <summary>＋ 记录新价格</summary>
    <QuickSnapshotForm
      key={activeSeries.key}
      itemName={activeSeries.itemName}
      sourceName={activeSeries.sourceName}
      submit={submit}
      pending={pending}
      onSaved={() => setQuickFormOpen(false)}
    />
  </details>
</div>
```

- [ ] **Step 3: 新增快捷表单组件**

在 `SnapshotForm` 前新增：

```tsx
function QuickSnapshotForm({ itemName, sourceName, submit, pending, onSaved }: {
  itemName: string;
  sourceName: string;
  submit: (input: MhxyPriceSnapshotInput) => Promise<unknown>;
  pending: boolean;
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState<MhxyTradeCurrency>("rmb");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      itemName,
      serverName: sourceName,
      currency,
      ...(currency === "rmb"
        ? { rmbUnitPrice: Number(data.get("price")) }
        : { gameCoinUnitPriceWan: Number(data.get("price")), rmbPerGameCoinWan: Number(data.get("rate")) }),
      capturedAt: String(data.get("capturedAt"))
    } as MhxyPriceSnapshotInput;
    try {
      await submit(input);
      form.reset();
      setCurrency("rmb");
      onSaved();
    } catch {
      // The parent renders the mutation error; inputs stay available for retry.
    }
  }

  return (
    <form className="mhxy-price-quick-form" data-form="quick-price-snapshot" onSubmit={handleSubmit}>
      <p className="mhxy-price-quick-form__context">{itemName} · {sourceName}</p>
      <label>货币形式<select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value as MhxyTradeCurrency)}><option value="rmb">人民币</option><option value="gameCoin">游戏币</option></select></label>
      <label>{currency === "rmb" ? "人民币单价" : "游戏币单价（万）"}<input name="price" type="number" min="0" step="any" required /></label>
      {currency === "gameCoin" ? <label>当时兑换比例（必填）<input name="rate" type="number" min="0.000001" step="any" required /></label> : null}
      <label>采集时间<input name="capturedAt" type="datetime-local" defaultValue={localDateTime()} required /></label>
      <button type="submit" disabled={pending}>保存新价格</button>
    </form>
  );
}
```

- [ ] **Step 4: 运行组件测试并确认绿灯**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS，人民币、游戏币、空状态、切换上下文、失败保留以及原有价格趋势测试全部通过。

- [ ] **Step 5: 提交行为实现**

```bash
git add apps/web/src/components/mhxy-page.tsx
git commit -m "feat(mhxy): add quick price entry for active item"
```

### Task 3: 完成视觉、响应式和全量验证

**Files:**
- Modify: `apps/web/src/styles.css:3058-3103`
- Modify: `apps/web/src/styles.css:3266-3316`

- [ ] **Step 1: 防止表单裁切并修正身份区选择器**

把 `.mhxy-price-trend` 的 `overflow: hidden` 改为 `overflow: visible`。把 `.mhxy-price-trend__heading > div:first-child` 替换为：

```css
.mhxy-price-trend__identity > div {
  display: grid;
  gap: 3px;
}
```

- [ ] **Step 2: 添加快捷入口与表单样式**

```css
.mhxy-price-trend__identity {
  display: flex;
  align-items: end;
  gap: 14px;
  min-width: 0;
}

.mhxy-price-quick-add { position: relative; }

.mhxy-price-quick-add summary {
  list-style: none;
  border: 1px solid rgba(66, 214, 176, 0.48);
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(66, 214, 176, 0.12);
  color: var(--market-jade);
  font-size: 0.76rem;
  cursor: pointer;
}

.mhxy-price-quick-add summary::-webkit-details-marker { display: none; }
.mhxy-price-quick-add summary:focus-visible { outline: 2px solid rgba(66, 214, 176, 0.25); outline-offset: 2px; }

.mhxy-price-quick-form {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 12;
  display: grid;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 72px));
  gap: 10px;
  padding: 16px;
  border: 1px solid rgba(66, 214, 176, 0.34);
  border-radius: 16px;
  background: #101d2e;
  box-shadow: 0 22px 64px rgba(0, 0, 0, 0.44);
}

.mhxy-price-quick-form__context { margin: 0; color: var(--market-paper); font-weight: 650; }
.mhxy-price-quick-form label { display: grid; gap: 5px; color: var(--market-mist); font-size: 0.74rem; }
.mhxy-price-quick-form input,
.mhxy-price-quick-form select { width: 100%; box-sizing: border-box; border: 1px solid var(--market-line); border-radius: 9px; padding: 9px 10px; background: var(--market-ink); color: var(--market-paper); }
.mhxy-price-quick-form input:focus,
.mhxy-price-quick-form select:focus { border-color: var(--market-jade); outline: 2px solid rgba(66, 214, 176, 0.15); }
.mhxy-price-quick-form button { border: 0; border-radius: 9px; padding: 10px 12px; background: var(--market-jade); color: #07140f; font-weight: 750; cursor: pointer; }
```

- [ ] **Step 3: 添加窄屏与减少动效规则**

在 `@media (max-width: 640px)` 中加入：

```css
.mhxy-price-trend__heading,
.mhxy-price-trend__identity { flex-direction: column; }
.mhxy-price-trend__identity { width: 100%; align-items: stretch; }
.mhxy-price-quick-form { position: static; width: 100%; margin-top: 10px; }
```

把 `.mhxy-price-quick-add summary` 加入 `@media (prefers-reduced-motion: reduce)` 的现有选择器列表。

- [ ] **Step 4: 运行组件测试**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS，无错误或警告。

- [ ] **Step 5: 运行类型检查与 Web 构建**

Run: `npm run typecheck`

Expected: PASS，TypeScript 无诊断。

Run: `npm run build:web`

Expected: PASS，Vite 成功生成 `dist`，无构建错误。

- [ ] **Step 6: 检查最终差异**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出；状态仅包含计划内文件，或在逐任务提交后为空。

- [ ] **Step 7: 提交样式**

```bash
git add apps/web/src/styles.css
git commit -m "style(mhxy): polish quick price entry"
```
