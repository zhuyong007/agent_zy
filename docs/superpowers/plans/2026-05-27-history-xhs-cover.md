# History Xhs Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted Xiaohongshu-style cover plan to generated history posts and expose copy actions on the history page.

**Architecture:** Extend the shared history payload with an optional `cover` object. The history agent validates model-provided cover data and derives a fallback cover when missing or incomplete. The web history page renders the cover section only when the selected payload contains cover data.

**Tech Stack:** TypeScript, React, TanStack Query, Vitest, Fastify inject tests.

---

### Task 1: Shared Type And Agent Cover Generation

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `agents/history-agent/src/index.ts`
- Test: `agents/history-agent/src/index.test.ts`

- [ ] Add tests that expect generated history notifications to include `payload.cover` when the model returns it.
- [ ] Add a test that expects `payload.cover` to be derived when the model omits it.
- [ ] Run `npm test -- agents/history-agent/src/index.test.ts` and verify the new tests fail because `cover` is missing.
- [ ] Add `HistoryPostCover` and optional `HistoryPostPayload.cover`.
- [ ] Add `validateCover`, `buildFallbackCover`, and include `cover` in `validatePayload`.
- [ ] Update the model prompt to require `cover`.
- [ ] Re-run `npm test -- agents/history-agent/src/index.test.ts` and verify pass.

### Task 2: Control Plane Fixture Coverage

**Files:**
- Modify: `apps/control-plane/src/app.test.ts`

- [ ] Update the manual history generation fixture to include `cover`.
- [ ] Assert the API response includes the cover title and prompt under notification payload.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts -- -t "generates a history post from the manual generation endpoint"` and verify pass.

### Task 3: History Page Cover UI

**Files:**
- Modify: `apps/web/src/components/history-page.tsx`
- Modify: `apps/web/src/components/history-page.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Add test fixture cover data to the selected history notification.
- [ ] Add assertions for visible cover title and copy buttons.
- [ ] Add copy assertions for cover text and cover prompt.
- [ ] Run `npm test -- apps/web/src/components/history-page.test.ts` and verify the new UI test fails before implementation.
- [ ] Render a `history-cover-card` section before “图文拆解” when `selectedPayload.cover` exists.
- [ ] Add local CSS for the cover section and day-theme colors.
- [ ] Re-run `npm test -- apps/web/src/components/history-page.test.ts` and verify pass.

### Task 4: Final Verification

**Files:**
- Verify only.

- [ ] Run `npm test -- agents/history-agent/src/index.test.ts apps/web/src/components/history-page.test.ts`.
- [ ] Run the focused control-plane history endpoint test.
- [ ] Run `git diff --stat` and summarize touched files.
