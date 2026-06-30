# 梦幻西游物价道具编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许用户在当前价格走势中批量修改道具名和来源，并在目标走势已存在时通过应用内二次确认后原子合并。

**Architecture:** 新增共享的价格序列身份、更新输入和结果类型，由 Control Plane 服务按“原来源 + 原道具名”一次更新全部快照。Web 端在当前趋势内维护按序列键隔离的编辑状态，普通重命名直接提交，目标序列存在时先展示确认弹窗，再携带 `confirmMerge: true` 提交。

**Tech Stack:** TypeScript、Zod、Fastify、React 18、TanStack Query、Vitest、JSDOM、CSS

---

## 文件结构

- Modify: `packages/shared-types/src/index.ts` — 定义价格序列身份、批量更新输入和返回结果。
- Modify: `apps/control-plane/src/services/mhxy-validation.ts` — 校验序列身份、空道具名和确认标记。
- Modify: `apps/control-plane/src/services/mhxy-service.ts` — 原子重命名或确认合并价格序列。
- Modify: `apps/control-plane/src/services/mhxy-service.test.ts` — 服务层重命名、拒绝合并、确认合并和边界测试。
- Modify: `apps/control-plane/src/app.ts` — 注册 `PATCH /api/mhxy/price-series`。
- Modify: `apps/control-plane/src/mhxy-api.test.ts` — 路由正常更新、空名称和确认合并测试。
- Modify: `apps/web/src/api.ts` — 暴露价格序列更新请求。
- Modify: `apps/web/src/api.test.ts` — 验证 PATCH 路径、方法和请求体。
- Modify: `apps/web/src/components/mhxy-page.tsx` — 编辑表单、选中状态迁移和合并确认弹窗。
- Modify: `apps/web/src/components/mhxy-page.test.ts` — 编辑、取消、确认、切换和失败状态测试。
- Modify: `apps/web/src/styles.css` — 编辑入口、表单、弹窗及响应式样式。

### Task 1: 价格序列原子更新服务

**Files:**
- Modify: `packages/shared-types/src/index.ts:361-395`
- Modify: `apps/control-plane/src/services/mhxy-validation.ts:20-48`
- Modify: `apps/control-plane/src/services/mhxy-service.ts:460-500,939-950`
- Test: `apps/control-plane/src/services/mhxy-service.test.ts`

- [ ] **Step 1: 写入服务层失败测试**

在 `mhxy-service.test.ts` 中加入：

```ts
it("renames every snapshot in a price series without changing historical fields", () => {
  const service = createService();
  const first = service.createPriceSnapshot({
    itemName: "高级连击",
    serverName: "藏宝阁（兽决）",
    currency: "rmb",
    rmbUnitPrice: 340,
    capturedAt: "2026-05-01T10:00:00.000Z"
  });
  const second = service.createPriceSnapshot({
    itemName: "高级连击",
    serverName: "藏宝阁（兽决）",
    currency: "gameCoin",
    gameCoinUnitPriceWan: 4200,
    rmbPerGameCoinWan: 0.08,
    capturedAt: "2026-06-01T10:00:00.000Z"
  });

  const result = service.updatePriceSeries({
    current: { itemName: "高级连击", serverName: "藏宝阁（兽决）" },
    next: { itemName: "高级连击兽决", serverName: "藏宝阁" }
  });

  expect(result).toMatchObject({ updatedCount: 2, targetRecordCount: 0, merged: false });
  expect(result.records).toEqual([
    expect.objectContaining({
      id: first.id,
      itemName: "高级连击兽决",
      serverName: "藏宝阁",
      currency: "rmb",
      rmbUnitPrice: 340,
      capturedAt: first.capturedAt,
      createdAt: first.createdAt
    }),
    expect.objectContaining({
      id: second.id,
      itemName: "高级连击兽决",
      serverName: "藏宝阁",
      currency: "gameCoin",
      gameCoinUnitPriceWan: 4200,
      rmbPerGameCoinWan: 0.08,
      capturedAt: second.capturedAt,
      createdAt: second.createdAt
    })
  ]);
});

it("requires explicit confirmation before merging price series", () => {
  const service = createService();
  service.createPriceSnapshot({ itemName: "A", serverName: "来源", currency: "rmb", rmbUnitPrice: 10, capturedAt: "2026-06-01T10:00:00.000Z" });
  service.createPriceSnapshot({ itemName: "B", serverName: "来源", currency: "rmb", rmbUnitPrice: 20, capturedAt: "2026-06-02T10:00:00.000Z" });

  expect(() => service.updatePriceSeries({
    current: { itemName: "A", serverName: "来源" },
    next: { itemName: "B", serverName: "来源" }
  })).toThrow("目标价格序列已存在，请确认合并");
  expect(service.getDashboard().priceSnapshots.map((item) => item.itemName)).toEqual(["A", "B"]);

  const result = service.updatePriceSeries({
    current: { itemName: "A", serverName: "来源" },
    next: { itemName: "B", serverName: "来源" },
    confirmMerge: true
  });
  expect(result).toMatchObject({ updatedCount: 1, targetRecordCount: 1, merged: true });
  expect(service.getDashboard().priceSnapshots.map((item) => item.itemName)).toEqual(["B", "B"]);
});

it("keeps an empty source absent and skips a no-op price series update", () => {
  const service = createService();
  service.createPriceSnapshot({ itemName: "A", currency: "rmb", rmbUnitPrice: 10, capturedAt: "2026-06-01T10:00:00.000Z" });
  const result = service.updatePriceSeries({
    current: { itemName: " A ", serverName: " " },
    next: { itemName: "A", serverName: "" }
  });
  expect(result).toMatchObject({ updatedCount: 0, targetRecordCount: 0, merged: false });
  expect(result.records[0]).not.toHaveProperty("serverName");
});

it("rejects an update for a missing price series", () => {
  const service = createService();
  expect(() => service.updatePriceSeries({
    current: { itemName: "不存在" },
    next: { itemName: "新名称" }
  })).toThrow("价格序列不存在");
});
```

- [ ] **Step 2: 运行服务测试确认红灯**

Run: `npm test -- apps/control-plane/src/services/mhxy-service.test.ts`

Expected: FAIL，`updatePriceSeries is not a function`。

- [ ] **Step 3: 增加共享类型**

在 `MhxyPriceSnapshot` 后加入：

```ts
export interface MhxyPriceSeriesIdentity {
  itemName: string;
  serverName?: string;
}

export interface MhxyPriceSeriesUpdateInput {
  current: MhxyPriceSeriesIdentity;
  next: MhxyPriceSeriesIdentity;
  confirmMerge?: boolean;
}

export interface MhxyPriceSeriesUpdateResult {
  records: MhxyPriceSnapshot[];
  updatedCount: number;
  targetRecordCount: number;
  merged: boolean;
}
```

- [ ] **Step 4: 增加 Zod 校验**

在 `mhxy-validation.ts` 中加入：

```ts
const priceSeriesIdentitySchema = z.object({
  itemName: z.string().trim().min(1, "道具名不能为空"),
  serverName: z.string().optional()
}).strict();

export const mhxyPriceSeriesUpdateSchema = z.object({
  current: priceSeriesIdentitySchema,
  next: priceSeriesIdentitySchema,
  confirmMerge: z.boolean().optional()
}).strict();
```

- [ ] **Step 5: 实现序列身份规范化与匹配**

在 `mhxy-service.ts` 中导入 `MhxyPriceSeriesIdentity`、`MhxyPriceSeriesUpdateInput` 和 `MhxyPriceSeriesUpdateResult`，并在 `normalizeSnapshot` 后加入：

```ts
function normalizePriceSeriesIdentity(identity: MhxyPriceSeriesIdentity): MhxyPriceSeriesIdentity {
  const itemName = identity.itemName.trim();
  if (!itemName) throw new Error("道具名不能为空");
  const serverName = normalizeLabel(identity.serverName);
  return { itemName, ...(serverName ? { serverName } : {}) };
}

function matchesPriceSeries(snapshot: MhxyPriceSnapshot, identity: MhxyPriceSeriesIdentity) {
  return snapshot.itemName === identity.itemName &&
    (snapshot.serverName || undefined) === identity.serverName;
}
```

- [ ] **Step 6: 实现原子更新方法**

在 `createPriceSnapshot` 后加入：

```ts
updatePriceSeries(input: MhxyPriceSeriesUpdateInput): MhxyPriceSeriesUpdateResult {
  const current = normalizePriceSeriesIdentity(input.current);
  const next = normalizePriceSeriesIdentity(input.next);
  const snapshots = repository.readPriceSnapshots();
  const currentRecords = snapshots.filter((record) => matchesPriceSeries(record, current));
  if (currentRecords.length === 0) throw new Error("价格序列不存在");

  const sameIdentity = current.itemName === next.itemName && current.serverName === next.serverName;
  if (sameIdentity) {
    return { records: currentRecords, updatedCount: 0, targetRecordCount: 0, merged: false };
  }

  const targetRecords = snapshots.filter((record) => matchesPriceSeries(record, next));
  if (targetRecords.length > 0 && input.confirmMerge !== true) {
    throw new Error("目标价格序列已存在，请确认合并");
  }

  const updatedAt = nowIso();
  const updatedSnapshots = snapshots.map((record) => {
    if (!matchesPriceSeries(record, current)) return record;
    const { serverName: _serverName, ...withoutServerName } = record;
    return {
      ...withoutServerName,
      itemName: next.itemName,
      ...(next.serverName ? { serverName: next.serverName } : {}),
      updatedAt
    } as MhxyPriceSnapshot;
  });
  repository.writePriceSnapshots(updatedSnapshots);
  return {
    records: updatedSnapshots.filter((record) => matchesPriceSeries(record, next)),
    updatedCount: currentRecords.length,
    targetRecordCount: targetRecords.length,
    merged: targetRecords.length > 0
  };
},
```

- [ ] **Step 7: 运行服务测试并提交**

Run: `npm test -- apps/control-plane/src/services/mhxy-service.test.ts`

Expected: PASS。

```bash
git add packages/shared-types/src/index.ts apps/control-plane/src/services/mhxy-validation.ts apps/control-plane/src/services/mhxy-service.ts apps/control-plane/src/services/mhxy-service.test.ts
git commit -m "feat(mhxy): update price series atomically"
```

### Task 2: Control Plane 路由与 Web API

**Files:**
- Modify: `apps/control-plane/src/app.ts:35-55,1681-1695`
- Test: `apps/control-plane/src/mhxy-api.test.ts`
- Modify: `apps/web/src/api.ts:55-70,1544-1550`
- Test: `apps/web/src/api.test.ts:1-60`

- [ ] **Step 1: 写入路由和 Web API 失败测试**

在 `mhxy-api.test.ts` 的 MHXY 路由测试中创建三个不同道具的快照，然后加入：

```ts
for (const [itemName, rmbUnitPrice] of [["A", 10], ["B", 20], ["C", 30]] as const) {
  const response = await app.inject({
    method: "POST",
    url: "/api/mhxy/price-snapshots",
    payload: {
      itemName,
      serverName: "来源",
      currency: "rmb",
      rmbUnitPrice,
      capturedAt: "2026-06-01T10:00:00.000Z"
    }
  });
  expect(response.statusCode).toBe(200);
}

const renamed = await app.inject({
  method: "PATCH",
  url: "/api/mhxy/price-series",
  payload: {
    current: { itemName: "C", serverName: "来源" },
    next: { itemName: "D", serverName: "新来源" }
  }
});
expect(renamed.statusCode).toBe(200);
expect(renamed.json()).toMatchObject({ updatedCount: 1, targetRecordCount: 0, merged: false });

const rejectedMerge = await app.inject({
  method: "PATCH",
  url: "/api/mhxy/price-series",
  payload: {
    current: { itemName: "A", serverName: "来源" },
    next: { itemName: "B", serverName: "来源" }
  }
});
expect(rejectedMerge.statusCode).toBe(400);
expect(rejectedMerge.json().message).toContain("确认合并");

const merged = await app.inject({
  method: "PATCH",
  url: "/api/mhxy/price-series",
  payload: {
    current: { itemName: "A", serverName: "来源" },
    next: { itemName: "B", serverName: "来源" },
    confirmMerge: true
  }
});
expect(merged.statusCode).toBe(200);
expect(merged.json()).toMatchObject({ updatedCount: 1, targetRecordCount: 1, merged: true });

const invalid = await app.inject({
  method: "PATCH",
  url: "/api/mhxy/price-series",
  payload: { current: { itemName: "B" }, next: { itemName: "   " } }
});
expect(invalid.statusCode).toBe(400);
expect(invalid.json().message).toContain("道具名不能为空");
```

在 `api.test.ts` 导入 `updateMhxyPriceSeries` 并加入：

```ts
it("patches a complete MHXY price series identity", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [], updatedCount: 2, targetRecordCount: 0, merged: false })
  });
  vi.stubGlobal("fetch", fetchMock);
  const input = {
    current: { itemName: "高级连击", serverName: "旧来源" },
    next: { itemName: "高级连击兽决", serverName: "新来源" }
  };

  await updateMhxyPriceSeries(input);

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/mhxy/price-series"),
    expect.objectContaining({ method: "PATCH", body: JSON.stringify(input) })
  );
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm test -- apps/control-plane/src/mhxy-api.test.ts apps/web/src/api.test.ts`

Expected: FAIL，路由返回 404，Web API 导出不存在。

- [ ] **Step 3: 注册 Control Plane 路由**

在 `app.ts` 导入 `mhxyPriceSeriesUpdateSchema`，并在快照 POST 后加入：

```ts
app.patch("/api/mhxy/price-series", async (request, reply) =>
  mhxyAction(reply, () =>
    mhxyService.updatePriceSeries(
      parseMhxyInput(mhxyPriceSeriesUpdateSchema, request.body ?? {})
    )
  )
);
```

- [ ] **Step 4: 暴露 Web API**

在 `api.ts` 导入 `MhxyPriceSeriesUpdateInput`、`MhxyPriceSeriesUpdateResult`，并加入：

```ts
export const updateMhxyPriceSeries = (input: MhxyPriceSeriesUpdateInput) =>
  mhxyJsonRequest<MhxyPriceSeriesUpdateResult>("/api/mhxy/price-series", "PATCH", input);
```

- [ ] **Step 5: 运行测试并提交**

Run: `npm test -- apps/control-plane/src/mhxy-api.test.ts apps/web/src/api.test.ts`

Expected: PASS。

```bash
git add apps/control-plane/src/app.ts apps/control-plane/src/mhxy-api.test.ts apps/web/src/api.ts apps/web/src/api.test.ts
git commit -m "feat(mhxy): expose price series update API"
```

### Task 3: 当前道具编辑与合并确认

**Files:**
- Modify: `apps/web/src/components/mhxy-page.tsx:1-230,683-965`
- Test: `apps/web/src/components/mhxy-page.test.ts:1-230,532-790`

- [ ] **Step 1: 补充 API mock 和编辑测试**

在组件测试 API mock 中加入 `updateMhxyPriceSeries: vi.fn()`，并导入该 mock。加入：

```tsx
it("edits the active price item name and source", async () => {
  const dashboard = await fetchMhxyDashboard();
  const renamedSnapshots = dashboard.priceSnapshots.map((snapshot) =>
    snapshot.itemName === "高级连击" && snapshot.serverName === "藏宝阁（兽决）"
      ? { ...snapshot, itemName: "高级连击兽决", serverName: "藏宝阁" }
      : snapshot
  );
  vi.mocked(fetchMhxyDashboard)
    .mockResolvedValueOnce(dashboard)
    .mockResolvedValueOnce({ ...dashboard, priceSnapshots: renamedSnapshots });
  vi.mocked(updateMhxyPriceSeries).mockResolvedValueOnce({
    records: renamedSnapshots.filter((snapshot) => snapshot.itemName === "高级连击兽决"),
    updatedCount: 3,
    targetRecordCount: 0,
    merged: false
  });
  const container = await renderPage();
  await switchTab(container, "物价记录");
  const editor = container.querySelector(".mhxy-price-series-edit") as HTMLDetailsElement;
  await setDetailsOpen(editor, true);
  const form = editor.querySelector('[data-form="price-series-edit"]') as HTMLFormElement;
  expect((form.querySelector('[name="itemName"]') as HTMLInputElement).value).toBe("高级连击");
  expect((form.querySelector('[name="serverName"]') as HTMLInputElement).value).toBe("藏宝阁（兽决）");

  await act(async () => {
    change(form.querySelector('[name="itemName"]') as HTMLInputElement, "高级连击兽决");
    change(form.querySelector('[name="serverName"]') as HTMLInputElement, "藏宝阁");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(updateMhxyPriceSeries).toHaveBeenCalledWith({
    current: { itemName: "高级连击", serverName: "藏宝阁（兽决）" },
    next: { itemName: "高级连击兽决", serverName: "藏宝阁" },
    confirmMerge: false
  });
  await vi.waitFor(() => {
    expect((container.querySelector("[data-price-trend]") as HTMLElement).textContent)
      .toContain("高级连击兽决");
  });
});
```

- [ ] **Step 2: 写入合并确认和取消测试**

```tsx
it("requires an in-app confirmation before merging price items", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const container = await renderPage();
  await switchTab(container, "物价记录");
  const editor = container.querySelector(".mhxy-price-series-edit") as HTMLDetailsElement;
  await setDetailsOpen(editor, true);
  const form = editor.querySelector('[data-form="price-series-edit"]') as HTMLFormElement;
  change(form.querySelector('[name="itemName"]') as HTMLInputElement, "高级必杀");

  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  expect(updateMhxyPriceSeries).not.toHaveBeenCalled();
  const dialog = container.querySelector('[role="dialog"][aria-label="确认合并价格走势"]') as HTMLElement;
  expect(dialog.textContent).toContain("3 条");
  expect(dialog.textContent).toContain("1 条");
  const cancel = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent === "取消");
  await act(async () => cancel?.click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect((form.querySelector('[name="itemName"]') as HTMLInputElement).value).toBe("高级必杀");

  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const confirm = Array.from(container.querySelectorAll('[role="dialog"] button'))
    .find((button) => button.textContent === "确定合并");
  await act(async () => confirm?.click());
  expect(updateMhxyPriceSeries).toHaveBeenCalledWith({
    current: { itemName: "高级连击", serverName: "藏宝阁（兽决）" },
    next: { itemName: "高级必杀", serverName: "藏宝阁（兽决）" },
    confirmMerge: true
  });
  expect(confirmSpy).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});
```

- [ ] **Step 3: 写入切换、失败和空来源测试**

```tsx
it("closes price item editing when switching series and preserves failed inputs", async () => {
  vi.mocked(updateMhxyPriceSeries).mockRejectedValueOnce(new Error("保存失败"));
  const container = await renderPage();
  await switchTab(container, "物价记录");
  let editor = container.querySelector(".mhxy-price-series-edit") as HTMLDetailsElement;
  await setDetailsOpen(editor, true);
  const form = editor.querySelector("form") as HTMLFormElement;
  change(form.querySelector('[name="itemName"]') as HTMLInputElement, "失败后保留");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(editor.open).toBe(true);
  expect((form.querySelector('[name="itemName"]') as HTMLInputElement).value).toBe("失败后保留");

  const other = Array.from(container.querySelectorAll("[data-price-item]"))
    .find((button) => button.textContent?.includes("高级必杀"));
  await act(async () => other?.click());
  editor = container.querySelector(".mhxy-price-series-edit") as HTMLDetailsElement;
  expect(editor.open).toBe(false);
});

it("submits an empty source without the display placeholder", async () => {
  const dashboard = await fetchMhxyDashboard();
  const noSource = { ...dashboard.priceSnapshots[0] };
  delete noSource.serverName;
  vi.mocked(fetchMhxyDashboard).mockResolvedValueOnce({ ...dashboard, priceSnapshots: [noSource] });
  const container = await renderPage();
  await switchTab(container, "物价记录");
  const editor = container.querySelector(".mhxy-price-series-edit") as HTMLDetailsElement;
  await setDetailsOpen(editor, true);
  const form = editor.querySelector("form") as HTMLFormElement;
  expect((form.querySelector('[name="serverName"]') as HTMLInputElement).value).toBe("");
  change(form.querySelector('[name="itemName"]') as HTMLInputElement, "新名称");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(updateMhxyPriceSeries).toHaveBeenCalledWith({
    current: { itemName: "高级连击" },
    next: { itemName: "新名称" },
    confirmMerge: false
  });
});
```

- [ ] **Step 4: 运行组件测试确认红灯**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: FAIL，编辑入口和 API mock 调用不存在。

- [ ] **Step 5: 接入 mutation 和工作区 props**

在 `MhxyPage` 导入共享更新类型和 `updateMhxyPriceSeries`，创建：

```tsx
const priceSeriesMutation = useMutation({
  mutationFn: (input: MhxyPriceSeriesUpdateInput) => updateMhxyPriceSeries(input),
  onSuccess: () => void refresh()
});
```

将 mutation error 加入页面错误集合，并向 `PriceTrendWorkspace` 传入：

```tsx
updateSeries={(input) => priceSeriesMutation.mutateAsync(input)}
updatePending={priceSeriesMutation.isPending}
```

- [ ] **Step 6: 实现序列键和编辑组件**

提取与聚合一致的键函数：

```tsx
function priceSeriesKey(identity: MhxyPriceSeriesIdentity) {
  return JSON.stringify([identity.serverName || null, identity.itemName.trim()]);
}
```

新增 `PriceSeriesEditor`，按 `activeSeries.key` 设置 key。组件 props 必须包含当前 `PriceSeries`、全部 `PriceSeries[]`、`pending`、`updateSeries` 和 `onSelectedKey`。组件使用本地 `open`、`itemName`、`serverName` 和 `mergeTarget` 状态；每次渲染从输入值创建：

```tsx
const nextIdentity: MhxyPriceSeriesIdentity = {
  itemName: itemName.trim(),
  ...(serverName.trim() ? { serverName: serverName.trim() } : {})
};

async function save(next: MhxyPriceSeriesIdentity, confirmMerge: boolean) {
  try {
    await updateSeries({
      current: {
        itemName: current.itemName,
        ...(current.serverName ? { serverName: current.serverName } : {})
      },
      next,
      confirmMerge
    });
    onSelectedKey(priceSeriesKey(next));
    setMergeTarget(null);
    setOpen(false);
  } catch {
    // The page error area renders the mutation error; preserve this editor.
  }
}

const target = series.find((item) =>
  item.key === priceSeriesKey(nextIdentity) && item.key !== current.key
);
if (target) {
  setMergeTarget(target);
  return;
}
await save(nextIdentity, false);
```

`save` 必须在成功后执行 `setSelectedKey(priceSeriesKey(next))`、关闭编辑状态；catch 只保留输入。确认弹窗渲染：

```tsx
{mergeTarget ? <div className="mhxy-price-merge-backdrop">
  <section role="dialog" aria-modal="true" aria-label="确认合并价格走势" className="mhxy-price-merge-dialog">
    <h3>合并价格走势？</h3>
    <p>当前 {current.records.length} 条历史将并入目标已有 {mergeTarget.records.length} 条历史。</p>
    <strong>{itemName.trim()} · {serverName.trim() || "未分类来源"}</strong>
    <div>
      <button type="button" onClick={() => setMergeTarget(null)}>取消</button>
      <button type="button" disabled={pending} onClick={() => void save(nextIdentity, true)}>确定合并</button>
    </div>
  </section>
</div> : null}
```

编辑 `<details>` summary 为“编辑道具”，表单 `data-form="price-series-edit"` 包含预填的 `itemName/serverName`、保存和取消编辑按钮。在趋势身份区渲染：

```tsx
<div className="mhxy-price-trend__actions">
  <PriceSeriesEditor
    key={activeSeries.key}
    current={activeSeries}
    series={series}
    pending={updatePending}
    updateSeries={updateSeries}
    onSelectedKey={setSelectedKey}
  />
  <QuickSnapshotEntry
    key={`quick:${activeSeries.key}`}
    itemName={activeSeries.itemName}
    serverName={activeSeries.serverName}
    sourceName={activeSeries.sourceName}
    submit={submit}
    pending={pending}
  />
</div>
```

切换序列通过 `key={activeSeries.key}` 重建整个编辑组件。

- [ ] **Step 7: 运行组件测试并提交**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS。

```bash
git add apps/web/src/components/mhxy-page.tsx apps/web/src/components/mhxy-page.test.ts
git commit -m "feat(mhxy): edit and merge price items"
```

### Task 4: 样式与完整验证

**Files:**
- Modify: `apps/web/src/styles.css:3060-3450`

- [ ] **Step 1: 添加编辑操作和表单样式**

在现有价格趋势样式旁加入：

```css
.mhxy-price-trend__actions {
  display: flex;
  align-items: end;
  gap: 8px;
}

.mhxy-price-series-edit {
  position: relative;
}

.mhxy-price-series-edit summary {
  list-style: none;
  border: 1px solid var(--market-line);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--market-mist);
  cursor: pointer;
}

.mhxy-price-series-edit summary::-webkit-details-marker { display: none; }
.mhxy-price-series-edit summary:focus-visible { outline: 2px solid rgba(66, 214, 176, 0.25); outline-offset: 2px; }

.mhxy-price-series-edit-form {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 14;
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
```

- [ ] **Step 2: 添加应用内确认弹窗样式**

```css
.mhxy-price-merge-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(2, 9, 18, 0.72);
}

.mhxy-price-merge-dialog {
  display: grid;
  width: min(440px, 100%);
  gap: 14px;
  padding: 22px;
  border: 1px solid rgba(242, 179, 93, 0.42);
  border-radius: 18px;
  background: #101d2e;
  color: var(--market-paper);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
}

.mhxy-price-merge-dialog h3,
.mhxy-price-merge-dialog p { margin: 0; }
.mhxy-price-merge-dialog > div { display: flex; justify-content: flex-end; gap: 8px; }
```

- [ ] **Step 3: 添加响应式和减少动效规则**

在 `max-width: 980px` 中让 `.mhxy-price-trend__actions` 纵向、编辑表单 `position: static; width: 100%`。在 `max-width: 640px` 中让弹窗按钮纵向并占满宽度。把编辑 summary 和弹窗加入现有 reduced-motion 规则。

- [ ] **Step 4: 运行目标测试**

Run: `npm test -- apps/control-plane/src/services/mhxy-service.test.ts apps/control-plane/src/mhxy-api.test.ts apps/web/src/api.test.ts apps/web/src/components/mhxy-page.test.ts`

Expected: PASS。

- [ ] **Step 5: 运行类型检查、全量测试和构建**

Run: `npm run typecheck`

Expected: PASS。

Run: `npm test`

Expected: PASS，0 failures。

Run: `npm run build:web`

Expected: PASS；允许仓库已有 chunk-size warning，不允许新增构建错误。

- [ ] **Step 6: 检查差异并提交**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出，状态仅包含计划内样式和计划文档。

```bash
git add apps/web/src/styles.css docs/superpowers/plans/2026-06-30-mhxy-price-item-edit.md
git commit -m "style(mhxy): polish price item editing"
```
