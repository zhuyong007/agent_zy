# 梦幻西游角色资产类型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“角色”加入梦幻西游资产交易类型，并把对应页签统一命名为“资产交易记录”。

**Architecture:** 沿用现有 `assetFlips` 数据流，只扩展资产类别联合类型、API 校验和服务层规范化，不新增存储集合。前端集中映射资产类别文案，并在角色资产下隐藏、清空不适用的“归属角色”字段；所有现有盈亏和汇总算法继续复用。

**Tech Stack:** TypeScript、React 18、TanStack Query、Fastify、Zod、Vitest、jsdom

---

## 文件结构

- `packages/shared-types/src/index.ts`：资产类别公共类型。
- `apps/control-plane/src/services/mhxy-validation.ts`：HTTP 输入的 Zod 校验。
- `apps/control-plane/src/services/mhxy-service.ts`：资产规范化、数据集导入和业务错误文案。
- `apps/control-plane/src/mhxy-api.test.ts`：角色资产 API 全流程测试。
- `apps/control-plane/src/services/mhxy-service.test.ts`：全量数据导入和通用资产错误测试。
- `apps/web/src/components/mhxy-page.tsx`：页签、类别展示和角色表单交互。
- `apps/web/src/components/mhxy-page.test.ts`：页面命名、角色类别和字段清理测试。

执行前先检查上述文件的现有未提交差异；保留已有三页签和物价趋势改动，只在其基础上追加本计划内容。

### Task 1: 扩展角色资产的类型、校验和 API 流程

**Files:**
- Modify: `packages/shared-types/src/index.ts:437`
- Modify: `apps/control-plane/src/services/mhxy-validation.ts:62-77`
- Modify: `apps/control-plane/src/services/mhxy-service.ts:55-61`
- Test: `apps/control-plane/src/mhxy-api.test.ts`

- [ ] **Step 1: 写一个通过 API 创建、售出并汇总角色资产的失败测试**

在 `apps/control-plane/src/mhxy-api.test.ts` 的资产交易用例附近加入：

```ts
it("creates, sells, and summarizes role asset flips", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-mhxy-api-"));
  const app = createControlPlaneApp({ dataDir, startSchedulers: false });
  await app.ready();

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/mhxy/asset-flips",
      payload: {
        category: "role",
        name: "175 大唐官府",
        buyAt: "2026-06-01T10:00:00.000Z",
        buyPriceRmb: 5000,
        serverName: "长安城"
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      category: "role",
      status: "holding",
      buyPriceRmb: 5000
    });

    const sold = await app.inject({
      method: "PATCH",
      url: `/api/mhxy/asset-flips/${created.json().id}`,
      payload: {
        sellAt: "2026-06-03T10:00:00.000Z",
        sellPriceRmb: 5600
      }
    });
    expect(sold.statusCode).toBe(200);
    expect(sold.json()).toMatchObject({ status: "sold", profitRmb: 600 });

    const dashboard = (await app.inject({ method: "GET", url: "/api/mhxy" })).json();
    expect(dashboard.assetFlips).toEqual([
      expect.objectContaining({ category: "role", name: "175 大唐官府" })
    ]);
    expect(dashboard.assetFlipSummary).toMatchObject({
      holdingCount: 0,
      soldCount: 1,
      realizedProfitRmb: 600
    });
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行测试并确认 Zod 拒绝 `role`**

Run: `npm test -- apps/control-plane/src/mhxy-api.test.ts`

Expected: FAIL，创建请求返回 400 而不是 200，错误指向 `category` 枚举。

- [ ] **Step 3: 最小化扩展公共类型、Zod 枚举和服务校验**

将公共类型改为：

```ts
export type MhxyAssetFlipCategory = "role" | "summon" | "equipment";
```

将 Zod 字段改为：

```ts
category: z.enum(["role", "summon", "equipment"]),
```

将 `normalizeAssetFlip` 的类别校验改为：

```ts
if (!(["role", "summon", "equipment"] as const).includes(input.category)) {
  throw new Error("资产类型必须是角色、召唤兽或装备");
}
```

- [ ] **Step 4: 运行 API 测试并确认角色资产复用现有盈亏逻辑**

Run: `npm test -- apps/control-plane/src/mhxy-api.test.ts`

Expected: PASS，角色资产创建为 `holding`，补充卖出字段后为 `sold` 且盈亏为 600。

- [ ] **Step 5: 提交后端类别扩展**

```powershell
git add -- packages/shared-types/src/index.ts apps/control-plane/src/services/mhxy-validation.ts apps/control-plane/src/services/mhxy-service.ts apps/control-plane/src/mhxy-api.test.ts
git commit -m "feat: add mhxy role asset category"
```

### Task 2: 覆盖角色资产导入并统一服务层资产文案

**Files:**
- Modify: `apps/control-plane/src/services/mhxy-service.ts:557-613,836-850`
- Test: `apps/control-plane/src/services/mhxy-service.test.ts`

- [ ] **Step 1: 写角色资产全量导入和通用错误文案的失败测试**

在 `apps/control-plane/src/services/mhxy-service.test.ts` 加入：

```ts
it("imports role asset flips and reports generic asset errors", () => {
  const service = createService();
  const timestamp = "2026-06-01T10:00:00.000Z";

  const dashboard = service.replaceAllData({
    trades: [],
    priceSnapshots: [],
    inventoryTransfers: [],
    inventoryTargets: [],
    gameCoinPurchases: [],
    assetFlips: [
      {
        id: "role-1",
        category: "role",
        name: "175 龙宫",
        buyAt: timestamp,
        purchaseCurrency: "rmb",
        buyPriceRmb: 4200,
        status: "holding",
        profitRmb: null,
        serverName: "长安城",
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]
  });

  expect(dashboard.assetFlips).toEqual([
    expect.objectContaining({ category: "role", name: "175 龙宫", buyPriceRmb: 4200 })
  ]);
  expect(dashboard.assetFlipSummary).toMatchObject({
    holdingCount: 1,
    holdingCostRmb: 4200
  });
  expect(() => service.updateAssetFlip("missing", {})).toThrow("资产记录不存在");
  expect(() => service.deleteAssetFlip("missing")).toThrow("资产记录不存在");
});
```

- [ ] **Step 2: 运行服务测试并确认旧的“召唤兽装备记录”文案导致失败**

Run: `npm test -- apps/control-plane/src/services/mhxy-service.test.ts`

Expected: FAIL，导入部分通过，但缺失记录仍抛出“召唤兽装备记录不存在”。

- [ ] **Step 3: 把数据集和 CRUD 错误统一为通用资产文案**

在 `normalizeDataSet` 中使用：

```ts
[input.assetFlips, "资产记录"],
```

并将资产元数据标签改为：

```ts
assertRecordMetadata(record, "资产记录");
```

将更新、删除时的缺失记录错误改为：

```ts
if (!existing) throw new Error("资产记录不存在");
```

```ts
if (!records.some((record) => record.id === id)) throw new Error("资产记录不存在");
```

- [ ] **Step 4: 运行服务测试并确认导入、汇总和错误文案通过**

Run: `npm test -- apps/control-plane/src/services/mhxy-service.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交数据兼容和文案调整**

```powershell
git add -- apps/control-plane/src/services/mhxy-service.ts apps/control-plane/src/services/mhxy-service.test.ts
git commit -m "test: cover mhxy role asset imports"
```

### Task 3: 更新资产交易页签和角色资产表单

**Files:**
- Modify: `apps/web/src/components/mhxy-page.tsx:5-13,83,208-221,298-389`
- Test: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 更新页面测试，先锁定新名称和三种类别**

把所有 `switchTab(container, "角色召唤兽及装备交易记录")` 改为：

```ts
await switchTab(container, "资产交易记录");
```

把三页签断言和资产标题断言改为：

```ts
expect(labels).toEqual(["跨服交易记录", "资产交易记录", "物价记录"]);
expect(container.textContent).toContain("角色 / 召唤兽 / 装备人民币盈亏");
```

在 `fetchMhxyDashboard` 的 `assetFlips` 测试数据中加入一条角色资产，以覆盖列表标签：

```ts
{
  id: "asset-role-1",
  category: "role",
  name: "175 大唐官府",
  buyAt: "2026-06-05T10:00:00.000Z",
  purchaseCurrency: "rmb",
  buyPriceRmb: 5000,
  status: "holding",
  profitRmb: null,
  serverName: "长安城",
  createdAt: "2026-06-05T10:00:00.000Z",
  updatedAt: "2026-06-05T10:00:00.000Z"
}
```

并在资产列表断言中使用新的通用 `aria-label`，验证角色类别文本：

```ts
const inventory = container.querySelector('[aria-label="资产当前库存"]') as HTMLElement;
const history = container.querySelector('[aria-label="资产交易历史"]') as HTMLElement;
expect(inventory.textContent).toContain("175 大唐官府");
expect(inventory.textContent).toContain("角色 · 长安城");
expect(history.textContent).toContain("160 项链");
```

在资产页用例中补充类别选项断言：

```ts
const category = container.querySelector('[name="category"]') as HTMLSelectElement;
expect(Array.from(category.options).map((option) => [option.value, option.textContent])).toEqual([
  ["role", "角色"],
  ["summon", "召唤兽"],
  ["equipment", "装备"]
]);
```

- [ ] **Step 2: 写角色类型隐藏并清空“归属角色”的失败测试**

在 `apps/web/src/components/mhxy-page.test.ts` 加入：

```ts
it("hides and clears the owner character when submitting a role asset", async () => {
  const container = await renderPage();
  await switchTab(container, "资产交易记录");
  const form = container.querySelector('[data-form="asset-flip"]') as HTMLFormElement;

  expect(form.textContent).toContain("归属角色");
  await act(async () => {
    change(form.querySelector('[name="characterName"]') as HTMLInputElement, "商人甲");
    change(form.querySelector('[name="category"]') as HTMLSelectElement, "role");
  });
  expect(form.querySelector('[name="characterName"]')).toBeNull();

  await act(async () => {
    change(form.querySelector('[name="name"]') as HTMLInputElement, "175 大唐官府");
    change(form.querySelector('[name="buyPriceRmb"]') as HTMLInputElement, "5000");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(createMhxyAssetFlip).toHaveBeenCalledWith(
    expect.objectContaining({
      category: "role",
      name: "175 大唐官府",
      characterName: undefined
    })
  );
});
```

- [ ] **Step 3: 运行页面测试并确认新名称、角色选项和条件字段尚未实现**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: FAIL，找不到“资产交易记录”、`role` 选项或角色类型下仍显示 `characterName`。

- [ ] **Step 4: 集中定义类别文案并实现角色类别切换**

在类型导入中加入 `MhxyAssetFlipCategory`，并在组件外定义：

```ts
const assetCategoryLabels: Record<MhxyAssetFlipCategory, string> = {
  role: "角色",
  summon: "召唤兽",
  equipment: "装备"
};
```

在组件中加入专用切换函数：

```ts
function setAssetCategory(category: MhxyAssetFlipCategory) {
  setAssetFlip((current) => ({
    ...current,
    category,
    characterName: category === "role" ? undefined : current.characterName
  }));
}
```

类别选择器改为：

```tsx
<label>
  类型
  <select
    name="category"
    value={assetFlip.category}
    onChange={(event) => setAssetCategory(event.target.value as MhxyAssetFlipCategory)}
  >
    <option value="role">角色</option>
    <option value="summon">召唤兽</option>
    <option value="equipment">装备</option>
  </select>
</label>
```

- [ ] **Step 5: 更新页签、标题、列表标签和条件字段**

页签和页内标题分别使用：

```tsx
资产交易记录
```

```tsx
<h2>角色 / 召唤兽 / 装备人民币盈亏</h2>
```

资产列表的类别文本统一使用：

```tsx
<small>
  {assetCategoryLabels[item.category]} · {item.serverName || "未填区服"}
  {item.category === "role" ? "" : ` · ${item.characterName || "未填归属角色"}`}
</small>
```

表单只对召唤兽和装备显示归属字段：

```tsx
{assetFlip.category !== "role" ? (
  <label>
    归属角色
    <input
      name="characterName"
      value={assetFlip.characterName ?? ""}
      onChange={(event) => assetField("characterName", event.target.value)}
    />
  </label>
) : null}
```

把资产区域的 `aria-label` 改为“资产记录”“资产当前库存”“资产交易历史”，空状态改为：

```tsx
<p className="mhxy-empty">当前没有持有中的资产。</p>
```

```tsx
<p className="mhxy-empty">还没有已售出的资产记录。</p>
```

- [ ] **Step 6: 运行页面测试并确认所有现有资产交互保持通过**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS，包括三页签隔离、资产编辑、人民币盈亏、删除确认和新增角色类别用例。

- [ ] **Step 7: 提交页面改动**

```powershell
git add -- apps/web/src/components/mhxy-page.tsx apps/web/src/components/mhxy-page.test.ts
git commit -m "feat: add role assets to mhxy trading"
```

### Task 4: 全量验证

**Files:**
- Verify: `packages/shared-types/src/index.ts`
- Verify: `apps/control-plane/src/services/mhxy-validation.ts`
- Verify: `apps/control-plane/src/services/mhxy-service.ts`
- Verify: `apps/web/src/components/mhxy-page.tsx`

- [ ] **Step 1: 运行梦幻西游相关测试**

Run: `npm test -- apps/control-plane/src/mhxy-api.test.ts apps/control-plane/src/services/mhxy-service.test.ts apps/web/src/components/mhxy-page.test.ts`

Expected: PASS，三个测试文件全部通过。

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `npm run typecheck`

Expected: PASS，无 TypeScript 错误。

- [ ] **Step 3: 构建 Web 应用**

Run: `npm run build:web`

Expected: PASS，Vite 成功生成生产构建。

- [ ] **Step 4: 检查最终差异范围**

Run: `git diff --check`

Expected: 无输出；最终差异只包含计划列出的角色资产改动以及执行前已经存在的用户改动。
