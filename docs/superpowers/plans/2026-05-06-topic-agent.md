# AI 自媒体选题 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scheduled topic-selection sub-agent that pushes AI self-media ideas to the dashboard and keeps a browsable history page.

**Architecture:** Extend shared domain state with `TopicState`, implement topic generation inside a new `topic-agent`, and expose it through the existing control-plane orchestrator, scheduler, dashboard stream, and React router. The first version is deterministic and uses existing news state plus evergreen fallback topics.

**Tech Stack:** TypeScript, Fastify, React, TanStack Router, TanStack Query, Vitest, existing agent runtime.

---

### Task 1: Domain Types And Topic Agent

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/agent-sdk/src/index.ts`
- Create: `agents/topic-agent/package.json`
- Create: `agents/topic-agent/src/manifest.ts`
- Create: `agents/topic-agent/src/index.ts`
- Create: `agents/topic-agent/src/index.test.ts`

- [ ] Write tests for news-based topic generation, evergreen fallback generation, history retention, and duplicate avoidance.
- [ ] Run `npm test -- agents/topic-agent/src/index.test.ts` and confirm the missing agent/types fail.
- [ ] Add shared topic types and allow `AgentExecutionResult.domainUpdates.topics`.
- [ ] Implement `topic-agent` with deterministic scoring and stable IDs.
- [ ] Run `npm test -- agents/topic-agent/src/index.test.ts` and confirm it passes.

### Task 2: Control Plane Integration

**Files:**
- Modify: `apps/control-plane/src/app.ts`
- Modify: `apps/control-plane/src/services/orchestrator.ts`
- Modify: `apps/control-plane/src/services/scheduler.ts`
- Modify: `apps/control-plane/src/services/store.ts`
- Modify: `apps/control-plane/src/app.test.ts`
- Modify: `packages/router-core/src/index.ts`

- [ ] Add tests for `GET /api/topics`, `POST /api/topics/generate`, and `DEFAULT_TOPIC_INTERVAL_MS`.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts` and confirm the missing API/default fail.
- [ ] Register `topic-agent`, persist `topics`, expose topic API helpers, and add scheduler support.
- [ ] Add router keywords for “选题 / 自媒体 / 内容”.
- [ ] Run `npm test -- apps/control-plane/src/app.test.ts` and confirm it passes.

### Task 3: Frontend Dashboard And Topics Page

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/dashboard-page.tsx`
- Create: `apps/web/src/components/topic-page.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add typed topic API helpers.
- [ ] Add “选题” navigation and home module for the latest pushed ideas.
- [ ] Add `/topics` page with current ideas, history, source links, and manual generation.
- [ ] Style the feature consistently with the existing dense control-plane UI.
- [ ] Run `npm run typecheck` and `npm run build:web`.

### Task 4: Final Verification

**Files:**
- All modified files.

- [ ] Run `npm test -- agents/topic-agent/src/index.test.ts apps/control-plane/src/app.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:web`.
- [ ] Summarize files changed and verification evidence.
