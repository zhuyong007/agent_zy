# 梦幻西游物价趋势观察台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把物价记录从表单加全量列表改成以单一道具价格走势为核心的行情观察台。

**Architecture:** 在 `MhxyPage` 内按来源和道具聚合现有快照，维护当前选择并计算首末涨跌、最低、最高和 SVG 坐标。沿用现有查询与删除 mutation，不改后端模型；添加表单收进原生折叠入口。

**Tech Stack:** React 18、TypeScript、SVG、CSS、Vitest、jsdom

---

### Task 1: 锁定趋势优先的行为

**Files:**
- Modify: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 扩充多期、多道具快照 fixture**

为“高级连击”提供 2026-01-31、2026-04-13、2026-05-30 三期价格，并增加“高级必杀”快照。

- [ ] **Step 2: 写默认趋势与历史隔离测试**

断言页面存在 `data-price-trend`，默认趋势标题为“高级连击”，历史仅包含它的三期数据。

- [ ] **Step 3: 写道具切换测试**

点击“高级必杀”观察项，断言趋势标题和历史切换到高级必杀。

- [ ] **Step 4: 写次要添加入口测试**

断言“添加记录”位于未展开的 `details`，而趋势区始终存在。

- [ ] **Step 5: 运行红灯测试**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: FAIL，因为旧页面没有趋势区、道具观察按钮或折叠添加入口。

### Task 2: 实现趋势观察台

**Files:**
- Modify: `apps/web/src/components/mhxy-page.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 聚合价格序列**

把 `dashboard.priceSnapshots` 按 `serverName + itemName` 聚合，按 `capturedAt` 升序排列，并计算最新价、首末差、百分比、最低与最高。

- [ ] **Step 2: 实现观察列表与选择状态**

用按钮呈现每个道具的最新价和涨跌，选择后只把该序列传给主趋势区。

- [ ] **Step 3: 实现 SVG 价格丝线**

在固定 `viewBox` 中生成网格、折线、面积渐变、节点价格与日期标签，并处理单点和等价区间。

- [ ] **Step 4: 实现当前道具历史与次要添加入口**

历史区只渲染当前序列；把 `SnapshotForm` 放进默认关闭的 `details`，保留原提交逻辑。

- [ ] **Step 5: 实现局部视觉系统与响应式样式**

用 `.mhxy-market-*` 类实现设计令牌、两栏布局、数据字体、键盘焦点、移动端堆叠和 reduced-motion。

- [ ] **Step 6: 运行绿灯测试**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS，物价记录相关测试和既有测试全部通过。

### Task 3: 完整验证

**Files:**
- Verify: `apps/web/src/components/mhxy-page.tsx`
- Verify: `apps/web/src/components/mhxy-page.test.ts`
- Verify: `apps/web/src/styles.css`

- [ ] **Step 1: 类型检查**

Run: `npm run typecheck`

Expected: exit code 0。

- [ ] **Step 2: Web 构建**

Run: `npm run build:web`

Expected: exit code 0。

- [ ] **Step 3: 差异检查**

Run: `git diff --check`

Expected: 无空白错误。
