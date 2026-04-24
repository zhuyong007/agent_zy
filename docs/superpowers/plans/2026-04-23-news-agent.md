# Hot News Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hot news sub-agent, API surface, scheduled incremental refresh, manual analysis flow, and `/news` frontend page.

**Architecture:** Extend the shared news domain state, keep news behavior in the news agent, expose targeted control-plane endpoints, and render a dedicated three-column React workspace. The first implementation uses deterministic local fetch/summarize/analyze logic with stable seams for future real RSS and LLM integrations.

**Tech Stack:** TypeScript, Fastify, React, TanStack Router, TanStack Query, Vitest, existing agent runtime.

---

### Task 1: News Domain Types And Agent Behavior

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `agents/news-agent/src/index.ts`
- Create: `agents/news-agent/src/index.test.ts`

- [ ] Write failing tests for incremental refresh, source count clustering, and analysis caching.
- [ ] Run `npm test -- agents/news-agent/src/index.test.ts` and verify the tests fail because the behavior is missing.
- [ ] Extend shared news types with sources, raw items, categories, importance, analysis, and refresh metadata.
- [ ] Implement news agent operations for `refresh`, `add-source`, and `analyze`.
- [ ] Run `npm test -- agents/news-agent/src/index.test.ts` and verify the tests pass.

### Task 2: Control Plane API And Scheduler

**Files:**
- Modify: `apps/control-plane/src/orchestrator.ts`
- Modify: `apps/control-plane/src/app.ts`
- Modify: `apps/control-plane/src/services/scheduler.ts`
- Modify: `apps/control-plane/src/app.test.ts`

- [ ] Write failing API tests for adding a source, refreshing news, analyzing an item, and the 30-minute scheduler default.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts` and verify the new tests fail.
- [ ] Add orchestrator helpers to run news source, refresh, and analyze tasks.
- [ ] Add Fastify endpoints under `/api/news`.
- [ ] Change scheduler default news interval to 30 minutes and export the default for testing.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts` and verify the tests pass.

### Task 3: Frontend News Page

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/router.tsx`
- Create: `apps/web/src/components/news-page.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add typed API helpers for `GET /api/news`, `POST /api/news/sources`, `POST /api/news/refresh`, and `POST /api/news/items/:id/analyze`.
- [ ] Replace the `/news` placeholder with the dedicated page.
- [ ] Implement a three-column news workspace: sources, grouped digest, inspector with manual analysis.
- [ ] Add restrained, high-density app styling consistent with the existing command rail.
- [ ] Run `npm run typecheck` and `npm run build:web`.

### Task 4: Final Verification

**Files:**
- All modified files.

- [ ] Run `npm test -- agents/news-agent/src/index.test.ts apps/control-plane/src/app.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:web`.
- [ ] Summarize files changed, verification evidence, and any limitations.
