# 梦幻西游交易三 Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将梦幻西游交易页拆为跨服交易、角色召唤兽及装备交易、物价记录三个互相隔离的工作区。

**Architecture:** 保留现有单页组件、React Query 数据流和后端模型，只扩展工作区状态并重组 JSX。角色资产页从现有 `assetFlips` 按 `holding`/`sold` 派生库存与历史，人民币统计直接使用服务端现有汇总字段。

**Tech Stack:** React 18、TypeScript、TanStack Query、Vitest、jsdom

---

### Task 1: 用组件测试锁定三 Tab 与角色资产人民币口径

**Files:**
- Modify: `apps/web/src/components/mhxy-page.test.ts`
- Test: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 写三 Tab 与内容隔离测试**

新增测试，断言页面包含“跨服交易记录”“角色召唤兽及装备交易记录”“物价记录”三个按钮；切换后分别检查交易表单、资产表单和价格快照表单只在所属 Tab 出现。

- [ ] **Step 2: 写角色库存与历史口径测试**

切换到角色资产 Tab，断言“当前库存”只包含 mock 中的 `asset-1`，而“交易历史”只包含 `asset-2`；同时断言“库存价值”为 `¥1,200.00`，“总盈亏”为 `¥300.00`。

- [ ] **Step 3: 写人民币表单测试**

断言资产表单不存在 `purchaseCurrency` 和 `gameCoinCost` 字段，提交新资产时 API 收到 `purchaseCurrency: "rmb"` 与人民币买入价。

- [ ] **Step 4: 运行测试并确认按预期失败**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: FAIL，原因是页面仍只有两个旧 Tab，价格快照仍在主账本中，角色资产仍包含游戏币维度。

### Task 2: 实现三个工作区并隔离内容

**Files:**
- Modify: `apps/web/src/components/mhxy-page.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 扩展工作区状态与 Tab**

将 `workspace` 类型改为 `"crossServer" | "roleAssets" | "prices"`，默认值为 `crossServer`，并渲染三个使用最终中文名称的按钮。

- [ ] **Step 2: 重组跨服交易与物价区块**

跨服交易工作区保留交易表单、当前库存、交易记录、库存转移表单和记录；把 `SnapshotForm` 与价格快照历史完整移动到 `prices` 工作区。

- [ ] **Step 3: 将角色资产固定为人民币**

删除角色工作区的游戏币成本池 UI、购买方式选择和游戏币成本预览。`emptyAssetFlip` 固定 `purchaseCurrency: "rmb"`，资产编辑器只渲染 `buyPriceRmb` 输入。

- [ ] **Step 4: 拆分角色库存与历史**

从 `dashboard.assetFlips` 派生 `holdingAssetFlips` 与 `soldAssetFlips`；分别渲染“当前库存”和“交易历史”，并将摘要标签改为“库存价值”“当前库存”“总盈亏”“已售出”。

- [ ] **Step 5: 分隔角色库存与历史区域**

在 `apps/web/src/styles.css` 中让角色资产列表使用纵向网格间距，并为交易历史增加顶部分隔线，使两套数据在同一列表卡片中仍有清晰边界。

- [ ] **Step 6: 运行组件测试并确认通过**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS，组件测试全部通过。

### Task 3: 全量验证

**Files:**
- Verify: `apps/web/src/components/mhxy-page.tsx`
- Verify: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 运行 TypeScript 检查**

Run: `npm run typecheck`

Expected: exit code 0，无 TypeScript 错误。

- [ ] **Step 2: 运行 Web 构建**

Run: `npm run build:web`

Expected: exit code 0，Vite 构建成功。

- [ ] **Step 3: 检查差异与需求逐项对应**

Run: `git diff --check` 和 `git diff -- apps/web/src/components/mhxy-page.tsx apps/web/src/components/mhxy-page.test.ts`

Expected: 无空白错误；差异仅包含三 Tab、角色人民币库存/历史口径及对应测试。
