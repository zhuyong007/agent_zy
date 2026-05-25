# History Xiaohongshu Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual Xiaohongshu analytics sync for the history module and use real post metrics as optional feedback for future history content generation.

**Architecture:** Store a `historyXhs` analytics state inside the existing control-plane state and dashboard payload. Add a backend sync endpoint that delegates to a Playwright-based scraping service, then renders the synced overview on `/history`. The history agent receives a compact analytics summary in `state.historyXhs` and asks the model to decide whether the data volume is sufficient before adapting future prompts.

**Tech Stack:** TypeScript, Fastify, React, TanStack Query, Vitest, optional Playwright dynamic import.

---

### Task 1: Shared Types And Store State

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/control-plane/src/services/store.ts`
- Test: `apps/control-plane/src/services/store.test.ts`

- [ ] Add `HistoryXhsPostMetrics`, `HistoryXhsOverview`, and `HistoryXhsState` types.
- [ ] Add `historyXhs` to `AppState` and `DashboardData`.
- [ ] Initialize and normalize empty history analytics state in the store.
- [ ] Add store methods to read and replace history analytics.
- [ ] Write a failing store test that sets history analytics, reloads the store, and expects metrics to persist.
- [ ] Run `npm test -- apps/control-plane/src/services/store.test.ts -t "persists history xiaohongshu analytics"`.
- [ ] Implement the store changes until the test passes.

### Task 2: Xiaohongshu Sync Service And API

**Files:**
- Create: `apps/control-plane/src/services/history-xhs-service.ts`
- Modify: `apps/control-plane/src/services/orchestrator.ts`
- Modify: `apps/control-plane/src/app.ts`
- Test: `apps/control-plane/src/app.test.ts`

- [ ] Define `HistoryXhsService` with `sync(): Promise<HistoryXhsState>`.
- [ ] Implement default service using dynamic `import("playwright")`; open `https://creator.xiaohongshu.com/statistics/data-analysis`, wait briefly, scrape visible text, parse common metrics, and return a structured state or a clear failure message.
- [ ] Allow `createControlPlaneApp` to inject a fake `historyXhsService` for tests.
- [ ] Add `POST /api/history/xhs/sync`.
- [ ] Write a failing app test using an injected fake service and expect the response/dashboard `historyXhs` state to update.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts -t "syncs history xiaohongshu analytics"`.
- [ ] Implement until the test passes.

### Task 3: Web API And History Page Overview

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/components/history-page.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/api.test.ts`
- Test: `apps/web/src/components/history-page.test.ts`

- [ ] Add `syncHistoryXhsAnalytics()` API client.
- [ ] Add history page overview section with total views, likes, collects, comments, post count, last sync time, sync status, and a "获取小红书数据" button.
- [ ] Wire the button to the sync endpoint and update dashboard query data.
- [ ] Write a failing API test that posts to `/api/history/xhs/sync`.
- [ ] Write a failing page test that renders overview metrics and clicks the sync button.
- [ ] Run the two focused tests and implement until they pass.

### Task 4: Generation Feedback From Metrics

**Files:**
- Modify: `agents/history-agent/src/index.ts`
- Test: `agents/history-agent/src/index.test.ts`

- [ ] Build a compact analytics summary from `input.state.historyXhs.posts`.
- [ ] Include it in the model prompt only when posts exist.
- [ ] Instruct the model to decide whether the sample size is sufficient and only adapt content strategy when data is reliable.
- [ ] Write a failing agent test that provides multiple post metrics and asserts the generation prompt includes real views/likes and the model-judged threshold instruction.
- [ ] Run `npm test -- agents/history-agent/src/index.test.ts -t "uses xiaohongshu analytics feedback"`.
- [ ] Implement until the test passes.

### Task 5: Verification

**Files:**
- No new files.

- [ ] Run `npm test -- apps/control-plane/src/services/store.test.ts`.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts -t "history|xiaohongshu"`.
- [ ] Run `npm test -- apps/web/src/api.test.ts apps/web/src/components/history-page.test.ts`.
- [ ] Run `npm test -- agents/history-agent/src/index.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `git diff --check`.
