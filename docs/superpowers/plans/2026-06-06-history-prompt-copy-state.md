# History Prompt Copy State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep copied image-prompt buttons visibly marked for the current history-page session.

**Architecture:** Add a dedicated `Set<string>` state for image-prompt copy keys while retaining the existing transient `copiedKey` state for non-prompt copy actions. Apply a copied modifier class to prompt buttons and clear the set when the selected history notification changes.

**Tech Stack:** React, TypeScript, CSS, Vitest, jsdom

---

### Task 1: Persist Image Prompt Copy Feedback

**Files:**
- Modify: `apps/web/src/components/history-page.test.ts`
- Modify: `apps/web/src/components/history-page.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing UI test**

Extend the existing history copy test to click the first two image prompt buttons and assert both:

```ts
expect(firstPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
expect(secondPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
expect(firstPromptButton?.textContent).toContain("已复制");
expect(secondPromptButton?.textContent).toContain("已复制");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- apps/web/src/components/history-page.test.ts -t "copies caption and image prompt text from the selected history item"
```

Expected: FAIL because the first prompt button loses copied state or no copied modifier class exists.

- [ ] **Step 3: Add persistent prompt-copy state**

In `HistoryPage`:

- Add `copiedPromptKeys` as `Set<string>` state.
- Add `handlePromptCopy` that writes to the clipboard and adds the key to the set.
- Clear the set when `selectedNotification?.id` changes.
- Route cover-prompt, ordinary card-prompt, and dynasty card-prompt buttons through `handlePromptCopy`.
- Render “已复制” and `history-copy-button--copied` for keys present in the set.

- [ ] **Step 4: Add copied button styling**

Add `.history-copy-button--copied` styling using the existing accent variables, including hover behavior that preserves the copied color.

- [ ] **Step 5: Run focused and broader verification**

Run:

```powershell
npm test -- apps/web/src/components/history-page.test.ts
npm run typecheck
```

Expected: Both commands exit with code 0.

