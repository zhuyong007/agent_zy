# Structured Event Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local structured event logging and an operations page for diagnosing frontend, API, task, Agent, and model failures.

**Architecture:** Store append-only JSONL logs outside `AppState`. A control-plane logging service handles redaction, retention, filtering, and clearing; backend instrumentation and explicit frontend event reporting feed the same event stream.

**Tech Stack:** TypeScript, Fastify, React, TanStack Router, TanStack Query, Vitest

---

## Tasks

- [ ] Add shared event log types and TDD coverage for the JSONL service.
- [ ] Add the JSONL service with redaction, truncation, filtering, retention, corruption warnings, and clearing.
- [ ] Wire Fastify request logging and log management APIs.
- [ ] Instrument orchestrator, worker pool, and model runtime stages with task and request correlation.
- [ ] Add frontend API helpers, critical-operation reporting, `/logs`, fixed navigation, styles, and UI tests.
- [ ] Update `开发指南.md` and run full verification.

