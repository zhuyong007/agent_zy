import { nanoid } from "nanoid";

import type {
  BrowserAutomationObservation,
  BrowserAutomationRun,
  BrowserAutomationRunLog,
  BrowserAutomationRunStatus,
  BrowserAutomationTriggerRule,
  BrowserAutomationWorkflow,
  TaskRecord,
  TaskTrigger
} from "@agent-zy/shared-types";

import type { ControlPlaneStore } from "./store";
import { normalizeBrowserAutomationWorkflow } from "./browser-automation-workflow";

export interface BrowserAutomationExecutorResult {
  status: Extract<BrowserAutomationRunStatus, "completed" | "failed" | "stopped">;
  logs: BrowserAutomationRunLog[];
  lastObservation: BrowserAutomationObservation | null;
  extracted: Record<string, string>;
  error?: string | null;
}

export interface BrowserAutomationExecutor {
  runWorkflow(input: {
    workflow: BrowserAutomationWorkflow;
    runId: string;
    signal: AbortSignal;
  }): Promise<BrowserAutomationExecutorResult>;
}

export interface BrowserAutomationService {
  getState(): ReturnType<ControlPlaneStore["getState"]>["browserAutomation"];
  createWorkflow(input: unknown): BrowserAutomationWorkflow;
  updateWorkflow(id: string, input: unknown): BrowserAutomationWorkflow;
  deleteWorkflow(id: string): { ok: true };
  runWorkflow(id: string, input?: { trigger?: TaskTrigger; taskId?: string }): Promise<BrowserAutomationRun>;
  stopRun(id: string): { ok: true };
  createTriggerRule(input: unknown): BrowserAutomationTriggerRule;
  handleTaskCompleted(task: TaskRecord): Promise<BrowserAutomationRun[]>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | undefined {
  const text = asString(value);
  return text || undefined;
}

function nowDefault() {
  return new Date().toISOString();
}

function emptyBrowserAutomationState() {
  return {
    workflows: [],
    runs: [],
    triggerRules: [],
    lastUpdatedAt: null
  };
}

function createLog(input: Omit<BrowserAutomationRunLog, "id" | "createdAt">, now: string): BrowserAutomationRunLog {
  return {
    id: `browser-log-${nanoid()}`,
    createdAt: now,
    ...input
  };
}

function normalizeTriggerRule(
  input: unknown,
  now: string,
  existing?: Pick<BrowserAutomationTriggerRule, "id" | "createdAt">
): BrowserAutomationTriggerRule {
  const record = asRecord(input);
  const match = asRecord(record.match);
  const name = asString(record.name);
  const workflowId = asString(record.workflowId);

  if (!workflowId) {
    throw new Error("trigger rule workflowId is required");
  }

  return {
    id: existing?.id ?? (asString(record.id) || `browser-rule-${nanoid()}`),
    name: name || "未命名触发规则",
    workflowId,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    match: {
      ...(asOptionalString(match.agentId) ? { agentId: asOptionalString(match.agentId) } : {}),
      ...(asOptionalString(match.status) ? { status: asOptionalString(match.status) as any } : {}),
      ...(asOptionalString(match.trigger) ? { trigger: asOptionalString(match.trigger) as any } : {}),
      ...(asOptionalString(match.summaryIncludes) ? { summaryIncludes: asOptionalString(match.summaryIncludes) } : {})
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function matchesRule(rule: BrowserAutomationTriggerRule, task: TaskRecord) {
  if (!rule.enabled) {
    return false;
  }

  if (rule.match.agentId && task.agentId !== rule.match.agentId) {
    return false;
  }

  if (rule.match.status && task.status !== rule.match.status) {
    return false;
  }

  if (rule.match.trigger && task.trigger !== rule.match.trigger) {
    return false;
  }

  if (rule.match.summaryIncludes && !task.summary.includes(rule.match.summaryIncludes)) {
    return false;
  }

  return true;
}

export function createBrowserAutomationService(options: {
  store: ControlPlaneStore;
  executor: BrowserAutomationExecutor;
  now?: () => string;
}): BrowserAutomationService {
  const now = options.now ?? nowDefault;
  const controllers = new Map<string, AbortController>();

  function setState(patch: Partial<ReturnType<BrowserAutomationService["getState"]>>) {
    const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();

    return options.store.setBrowserAutomationState({
      ...current,
      ...patch,
      lastUpdatedAt: now()
    });
  }

  function upsertRun(run: BrowserAutomationRun) {
    const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();
    setState({
      runs: [run, ...current.runs.filter((item) => item.id !== run.id)].slice(0, 50)
    });

    return run;
  }

  return {
    getState() {
      return options.store.getState().browserAutomation ?? emptyBrowserAutomationState();
    },
    createWorkflow(input) {
      const workflow = normalizeBrowserAutomationWorkflow(input, now());
      const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();

      setState({
        workflows: [workflow, ...current.workflows.filter((item) => item.id !== workflow.id)]
      });

      return workflow;
    },
    updateWorkflow(id, input) {
      const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();
      const existing = current.workflows.find((item) => item.id === id);

      if (!existing) {
        throw new Error("browser automation workflow not found");
      }

      const workflow = normalizeBrowserAutomationWorkflow(
        {
          ...existing,
          ...asRecord(input),
          id
        },
        now(),
        existing
      );

      setState({
        workflows: current.workflows.map((item) => item.id === id ? workflow : item)
      });

      return workflow;
    },
    deleteWorkflow(id) {
      const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();

      setState({
        workflows: current.workflows.filter((item) => item.id !== id),
        triggerRules: current.triggerRules.filter((item) => item.workflowId !== id)
      });

      return { ok: true };
    },
    async runWorkflow(id, input = {}) {
      const workflow = (options.store.getState().browserAutomation ?? emptyBrowserAutomationState()).workflows.find((item) => item.id === id);

      if (!workflow) {
        throw new Error("browser automation workflow not found");
      }

      if (!workflow.enabled) {
        throw new Error("browser automation workflow is disabled");
      }

      const startedAt = now();
      const controller = new AbortController();
      const run: BrowserAutomationRun = {
        id: `browser-run-${nanoid()}`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: "running",
        trigger: input.trigger ?? "user",
        ...(input.taskId ? { taskId: input.taskId } : {}),
        startedAt,
        finishedAt: null,
        error: null,
        logs: [],
        lastObservation: null,
        extracted: {}
      };

      controllers.set(run.id, controller);
      upsertRun(run);

      try {
        const result = await options.executor.runWorkflow({
          workflow,
          runId: run.id,
          signal: controller.signal
        });
        const finishedRun: BrowserAutomationRun = {
          ...run,
          status: result.status,
          finishedAt: now(),
          error: result.error ?? null,
          logs: [...run.logs, ...result.logs],
          lastObservation: result.lastObservation,
          extracted: result.extracted
        };

        upsertRun(finishedRun);
        return finishedRun;
      } catch (error) {
        const message = error instanceof Error ? error.message : "browser automation run failed";
        const failedRun: BrowserAutomationRun = {
          ...run,
          status: controller.signal.aborted ? "stopped" : "failed",
          finishedAt: now(),
          error: message,
          logs: [
            ...run.logs,
            createLog({
              level: "error",
              message
            }, now())
          ],
          lastObservation: null,
          extracted: {}
        };

        upsertRun(failedRun);
        return failedRun;
      } finally {
        controllers.delete(run.id);
      }
    },
    stopRun(id) {
      controllers.get(id)?.abort();
      return { ok: true };
    },
    createTriggerRule(input) {
      const rule = normalizeTriggerRule(input, now());
      const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();

      if (!current.workflows.some((workflow) => workflow.id === rule.workflowId)) {
        throw new Error("trigger rule workflow not found");
      }

      setState({
        triggerRules: [rule, ...current.triggerRules.filter((item) => item.id !== rule.id)]
      });

      return rule;
    },
    async handleTaskCompleted(task) {
      const current = options.store.getState().browserAutomation ?? emptyBrowserAutomationState();
      const matched = current.triggerRules.filter((rule) => matchesRule(rule, task));
      const runs: BrowserAutomationRun[] = [];

      for (const rule of matched) {
        runs.push(await this.runWorkflow(rule.workflowId, {
          trigger: "system",
          taskId: task.id
        }));
      }

      return runs;
    }
  };
}
