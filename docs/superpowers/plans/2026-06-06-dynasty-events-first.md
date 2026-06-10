# Dynasty Events-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dynasty-mode “王朝兴衰录” generation focus on major events while treating people only as brief event context.

**Architecture:** Keep the existing four-module payload and UI unchanged. Strengthen the dynasty generation prompt in `history-agent`, and protect the content boundary with prompt assertions in the existing dynasty-mode agent test.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Constrain 王朝兴衰录 To Major Events

**Files:**
- Modify: `agents/history-agent/src/index.test.ts`
- Modify: `agents/history-agent/src/index.ts`

- [ ] **Step 1: Write the failing prompt assertions**

Add assertions to the existing `generates a dynasty four-module payload from dynasty metadata` test:

```ts
expect(prompt).toContain("按时间顺序选择 5-8 个真正改变王朝走向的重大事件");
expect(prompt).toContain("每张卡片聚焦一个事件");
expect(prompt).toContain("人物只作为事件参与者简要出现");
expect(prompt).toContain("避免与“皇帝图鉴”和“风云人物”重复");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- agents/history-agent/src/index.test.ts -t "generates a dynasty four-module payload from dynasty metadata"`

Expected: FAIL because the current prompt does not contain the new event-first constraints.

- [ ] **Step 3: Update the dynasty module prompt**

Replace the “王朝兴衰录” module instruction with a rule that:

- Uses 5-8 major events in chronological order.
- Makes each card focus on one event.
- Explains event background, process, result, and impact on the dynasty trajectory.
- Mentions people only briefly as event participants.
- Forbids biographies, achievement lists, and emperor lists.
- Avoids overlap with “皇帝图鉴” and “风云人物”.

- [ ] **Step 4: Run focused and broader verification**

Run:

```powershell
npm test -- agents/history-agent/src/index.test.ts
npm run typecheck
```

Expected: Both commands exit with code 0.

