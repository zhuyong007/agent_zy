import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlPlaneStore } from "./store";
import {
  createBrowserAutomationService,
  type BrowserAutomationExecutor
} from "./browser-automation-service";

function createFixture() {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-browser-automation-"));
  const store = createControlPlaneStore(dataDir);
  const runWorkflow: BrowserAutomationExecutor["runWorkflow"] = vi.fn(
    async ({ workflow }: Parameters<BrowserAutomationExecutor["runWorkflow"]>[0]) => ({
    status: "completed" as const,
    logs: workflow.steps.map((step) => ({
      id: `log-${step.id}`,
      stepId: step.id,
      level: "info" as const,
      message: `ran ${step.type}`,
      createdAt: "2026-06-04T00:00:00.000Z"
    })),
    lastObservation: {
      url: "https://example.com/",
      title: "Example",
      text: "ready",
      capturedAt: "2026-06-04T00:00:00.000Z"
    },
    extracted: {}
  }));
  const executor: BrowserAutomationExecutor = {
    runWorkflow
  };
  const service = createBrowserAutomationService({
    store,
    executor,
    now: () => "2026-06-04T00:00:00.000Z"
  });

  return { dataDir, store, executor, service };
}

describe("browser automation service", () => {
  const dataDirs: string[] = [];

  afterEach(() => {
    for (const dir of dataDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates workflows and executes runs with step logs", async () => {
    const fixture = createFixture();
    dataDirs.push(fixture.dataDir);

    const workflow = fixture.service.createWorkflow({
      name: "打开示例页",
      steps: [
        {
          id: "open",
          type: "openUrl",
          url: "https://example.com"
        }
      ]
    });
    const run = await fixture.service.runWorkflow(workflow.id, {
      trigger: "user"
    });

    expect(run).toMatchObject({
      workflowId: workflow.id,
      status: "completed",
      trigger: "user"
    });
    expect(run.logs.map((log) => log.message)).toEqual(["ran openUrl"]);
    expect(fixture.executor.runWorkflow).toHaveBeenCalledOnce();
  });

  it("starts a workflow when a completed task matches a trigger rule", async () => {
    const fixture = createFixture();
    dataDirs.push(fixture.dataDir);
    const workflow = fixture.service.createWorkflow({
      name: "任务后触发",
      steps: [
        {
          id: "open",
          type: "openUrl",
          url: "https://example.com"
        }
      ]
    });
    fixture.service.createTriggerRule({
      name: "新闻完成后打开",
      workflowId: workflow.id,
      enabled: true,
      match: {
        agentId: "news-agent",
        status: "completed"
      }
    });

    const run = await fixture.service.handleTaskCompleted({
      id: "task-1",
      agentId: "news-agent",
      status: "completed",
      summary: "刷新热点",
      trigger: "schedule",
      input: {},
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
      history: []
    });

    expect(run).toHaveLength(1);
    expect(run[0]?.workflowId).toBe(workflow.id);
  });
});
