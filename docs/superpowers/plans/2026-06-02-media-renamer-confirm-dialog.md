# Media Renamer Confirm Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the photo renamer to process photos and common videos while replacing the native execution confirmation with an in-app dialog.

**Architecture:** Keep the existing API route names for compatibility. Split capture-time selection by media extension inside the service: image EXIF, video `ffprobe` metadata, then mtime fallback. Keep the existing preview, validation, two-stage rename, rollback, and undo pipeline shared by both media kinds.

**Tech Stack:** TypeScript, React, Vitest, Node.js `child_process`, local `ffprobe`

---

### Task 1: Video Capture Time

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/control-plane/src/services/photo-renamer-service.ts`
- Test: `apps/control-plane/src/services/photo-renamer-service.test.ts`

- [ ] Add failing tests that preview a video using injected metadata and preview another video using mtime fallback.
- [ ] Run `npm test -- apps/control-plane/src/services/photo-renamer-service.test.ts` and verify video files are ignored before implementation.
- [ ] Add video extensions, `video-metadata`, and a default `ffprobe` reader for `creation_time`.
- [ ] Route images and videos through their matching metadata readers, with mtime fallback.
- [ ] Re-run the service tests and verify they pass.

### Task 2: In-App Confirmation Dialog

**Files:**
- Modify: `apps/web/src/components/photo-renamer-page.tsx`
- Modify: `apps/web/src/components/photo-renamer-page.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Replace the page test's native confirm stub with failing assertions for opening, cancelling, and confirming an in-app dialog.
- [ ] Run `npm test -- apps/web/src/components/photo-renamer-page.test.ts` and verify the dialog assertion fails.
- [ ] Add modal state, accessible dialog markup, cancel behavior, Escape handling, and theme-variable styles.
- [ ] Re-run the page test and verify it passes.

### Task 3: Product Copy And Documentation

**Files:**
- Modify: `apps/web/src/components/tools-page.tsx`
- Modify: `apps/web/src/components/photo-renamer-page.tsx`
- Modify: `apps/control-plane/src/app.ts`
- Modify: `开发指南.md`

- [ ] Update user-facing copy from photo-only language to photo-and-video language while retaining compatibility route names.
- [ ] Document video formats, `ffprobe` priority, and mtime fallback.

### Task 4: Verification

- [ ] Run `npm test -- apps/control-plane/src/services/photo-renamer-service.test.ts apps/web/src/components/photo-renamer-page.test.ts`.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:web`.
- [ ] Run `git diff --check`.
