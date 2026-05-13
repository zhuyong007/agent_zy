# 历史知识模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为历史知识模块增加本地知识点去重存档，并重设计首页历史知识卡片的五档尺寸展示。

**Architecture:** 后端在 `history-agent` 内新增本地档案读写与选题策略，保持现有通知和 payload 结构不变。前端只改首页历史知识卡片的渲染层次与局部样式，继续沿用现有五档尺寸规则，不影响 `/history` 详情页和全局主题。

**Tech Stack:** TypeScript, Vitest, React, TanStack Query, CSS

---

### Task 1: 为历史知识档案补测试与去重策略

**Files:**
- Modify: `agents/history-agent/src/index.test.ts`
- Modify: `agents/history-agent/src/index.ts`

- [ ] **Step 1: 先写失败测试，覆盖首次落档、跳过重复主题、全部用尽后的回退**

```ts
it("creates a topic archive entry after a successful generation", async () => {
  // arrange temp archive path + successful model response
  // assert archive file contains topic and counters after execute
});

it("prefers an unused topic when the requested topic already exists in the archive", async () => {
  // arrange archive with today's topic already used
  // assert execute picks another topic from HISTORY_TOPICS
});

it("falls back to the least recently generated topic when all topics are archived", async () => {
  // arrange archive containing all topics with different lastGeneratedAt values
  // assert execute picks the oldest one
});
```

- [ ] **Step 2: 运行 history-agent 单测，确认新增测试先失败**

Run: `npm test -- agents/history-agent/src/index.test.ts`
Expected: FAIL，提示缺少档案读写或重复选题策略。

- [ ] **Step 3: 在 agent 中实现最小归档能力**

```ts
function loadTopicArchive(path: string): HistoryTopicArchive { ... }
function selectTopic(localDate: string, archive: HistoryTopicArchive): string { ... }
function writeTopicArchive(path: string, archive: HistoryTopicArchive): void { ... }
function recordGeneratedTopic(archive: HistoryTopicArchive, topic: string, at: string): HistoryTopicArchive { ... }
```

- [ ] **Step 4: 再跑 history-agent 单测，确认变绿**

Run: `npm test -- agents/history-agent/src/index.test.ts`
Expected: PASS

### Task 2: 为档案写入失败补错误行为测试

**Files:**
- Modify: `agents/history-agent/src/index.test.ts`
- Modify: `agents/history-agent/src/index.ts`

- [ ] **Step 1: 先写失败测试，覆盖写档失败时任务失败且不返回通知**

```ts
it("fails the task when persisting the topic archive fails", async () => {
  // arrange unwritable archive path or mocked write failure
  // assert status === "failed" and notifications are undefined
});
```

- [ ] **Step 2: 运行定向单测，确认先失败**

Run: `npm test -- agents/history-agent/src/index.test.ts -t "fails the task when persisting the topic archive fails"`
Expected: FAIL

- [ ] **Step 3: 在执行路径里把写档失败视为任务失败**

```ts
const nextArchive = recordGeneratedTopic(...);
writeTopicArchive(...); // throw => catch => failed result
```

- [ ] **Step 4: 重跑 history-agent 单测，确认通过**

Run: `npm test -- agents/history-agent/src/index.test.ts`
Expected: PASS

### Task 3: 为首页历史卡片五档尺寸补前端规则测试

**Files:**
- Modify: `apps/web/src/history-view.test.ts`
- Modify: `apps/web/src/history-view.ts`

- [ ] **Step 1: 先写失败测试，明确五档尺寸的内容能力**

```ts
expect(getHistoryHomePreviewRule("medium")).toMatchObject({
  visibleCards: 3,
  showCaption: true,
  showStats: false,
  showPrompts: false
});
```

- [ ] **Step 2: 运行前端 helper 单测，确认规则测试仍能兜住展示密度**

Run: `npm test -- apps/web/src/history-view.test.ts`
Expected: PASS 或 FAIL；若 FAIL，先把规则调到 spec 定义。

- [ ] **Step 3: 只在必要时微调规则定义，保持五档差异清晰**

```ts
export const HISTORY_HOME_PREVIEW_RULES = {
  max: { ... },
  large: { ... },
  medium: { ... },
  smaller: { ... },
  small: { ... }
};
```

- [ ] **Step 4: 重跑 helper 测试**

Run: `npm test -- apps/web/src/history-view.test.ts`
Expected: PASS

### Task 4: 重构首页历史知识卡片结构并补渲染测试

**Files:**
- Modify: `apps/web/src/components/dashboard-page.tsx`
- Modify: `apps/web/src/components/dashboard-page.tsx`（历史卡片相关 JSX）

- [ ] **Step 1: 先写失败测试或扩展现有渲染测试，覆盖无数据态和有数据态的核心文案**

```ts
it("renders the history home card with archive metadata and card preview", () => {
  // render dashboard page with a history-post notification
  // assert topic, archive count, preview card title exist
});
```

- [ ] **Step 2: 运行相关 dashboard 测试，确认先失败**

Run: `npm test -- apps/web/src/components/dashboard-page.tsx`
Expected: 若无对应测试文件，则改跑现有 dashboard 相关测试并看到新增断言失败。

- [ ] **Step 3: 只调整首页历史卡片 JSX 层次，不改数据逻辑**

```tsx
<article className={`history-panel history-panel--${size}`}>
  <div className="history-panel__rail" />
  <div className="history-panel__hero">...</div>
  <div className="history-panel__content">...</div>
</article>
```

- [ ] **Step 4: 重跑 dashboard 相关测试**

Run: `npm test -- apps/web/src/chat-workspace.test.ts apps/web/src/history-view.test.ts`
Expected: PASS；若有更贴切的 dashboard 测试入口，则以该入口为准。

### Task 5: 实现首页历史卡片的五档尺寸样式

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 先在样式里限定首页历史卡片作用域，只改 `.history-panel` 及其子元素**

```css
.history-panel {
  /* module-only shell */
}

.history-panel--max { ... }
.history-panel--large { ... }
.history-panel--medium { ... }
.history-panel--smaller { ... }
.history-panel--small { ... }
```

- [ ] **Step 2: 实现“策展档案卡”视觉**

```css
.history-panel::before { /* 编目刻度线/光带 */ }
.history-panel__lead strong { /* 强标题 */ }
.history-panel__item { /* 拆卡层次 */ }
.history-panel__caption { /* 正文摘录 */ }
```

- [ ] **Step 3: 为五档尺寸分别实现可读布局和隐藏策略**

```css
.history-panel--small .history-panel__caption { display: none; }
.history-panel--smaller .history-panel__stats { display: none; }
.history-panel--medium .history-panel__item p { ... }
```

- [ ] **Step 4: 运行相关前端测试，确认样式改动未破坏逻辑**

Run: `npm test -- apps/web/src/history-view.test.ts apps/web/src/home-layout.test.ts`
Expected: PASS

### Task 6: 做最终验证

**Files:**
- Modify: `agents/history-agent/src/index.ts`
- Modify: `agents/history-agent/src/index.test.ts`
- Modify: `apps/web/src/components/dashboard-page.tsx`
- Modify: `apps/web/src/history-view.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 跑后端相关测试**

Run: `npm test -- agents/history-agent/src/index.test.ts`
Expected: PASS

- [ ] **Step 2: 跑前端相关测试**

Run: `npm test -- apps/web/src/history-view.test.ts apps/web/src/home-layout.test.ts`
Expected: PASS

- [ ] **Step 3: 跑一轮聚合验证**

Run: `npm test -- agents/history-agent/src/index.test.ts apps/web/src/history-view.test.ts apps/web/src/home-layout.test.ts`
Expected: PASS
