# 梦幻西游跨服与角色资产视觉优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把跨服交易与角色资产页改造成数据优先、录入次要的调度台和资产簿。

**Architecture:** 仅重组 `MhxyPage` 的 JSX 与局部样式，保留所有现有 state、mutation 和数据派生。录入表单放入原生折叠入口，库存、指标和历史始终渲染。

**Tech Stack:** React 18、TypeScript、CSS、Vitest、jsdom

---

### Task 1: 锁定次要录入与核心内容

**Files:**
- Modify: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 写跨服调度台结构测试**

断言 `data-cross-server-workspace` 存在，交易和转移表单分别位于默认关闭的 `.mhxy-cross-action` 中，库存、交易流水和转移轨迹始终渲染。

- [ ] **Step 2: 写角色资产簿结构测试**

切换角色资产 Tab，断言 `data-role-assets-workspace` 存在，资产表单位于默认关闭的 `.mhxy-asset-add` 中，角色当前库存与角色交易历史始终渲染。

- [ ] **Step 3: 运行红灯测试**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: FAIL，因为旧结构没有调度台、资产簿或折叠录入入口。

### Task 2: 重构两个页面结构

**Files:**
- Modify: `apps/web/src/components/mhxy-page.tsx`
- Test: `apps/web/src/components/mhxy-page.test.ts`

- [ ] **Step 1: 构建跨服调度台**

加入页内标题、四项主账本指标、两个折叠录入入口、库存主表和交易/转移双流水区。

- [ ] **Step 2: 构建角色资产簿**

把资产表单移动到标题区的折叠入口，保留四项人民币指标，并让持有与已售两区占满主内容宽度。

- [ ] **Step 3: 编辑时展开录入入口**

使用受控 `open` 状态确保点击编辑后对应折叠入口可见，取消编辑时恢复关闭。

- [ ] **Step 4: 运行绿灯测试**

Run: `npm test -- apps/web/src/components/mhxy-page.test.ts`

Expected: PASS。

### Task 3: 实现局部视觉系统

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 添加调度台样式**

实现路线蓝强调、指标带、库存路线、双流水、折叠表单浮层与移动端卡片布局。

- [ ] **Step 2: 添加资产簿样式**

实现人民币指标带、持有/已售双账页、状态色、折叠表单与移动端布局。

- [ ] **Step 3: 添加焦点和 reduced-motion**

为 summary、按钮和输入提供清晰焦点，并关闭用户不希望的动效。

### Task 4: 完整验证

**Files:**
- Verify: `apps/web/src/components/mhxy-page.tsx`
- Verify: `apps/web/src/components/mhxy-page.test.ts`
- Verify: `apps/web/src/styles.css`

- [ ] **Step 1:** Run `npm test -- apps/web/src/components/mhxy-page.test.ts`，预期全部通过。
- [ ] **Step 2:** Run `npm run typecheck`，预期 exit code 0。
- [ ] **Step 3:** Run `npm run build:web`，预期 exit code 0。
- [ ] **Step 4:** Run `git diff --check`，预期无空白错误。
