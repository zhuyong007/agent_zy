import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createControlPlaneApp } from "./app";
import type { BrowserAutomationExecutor } from "./services/browser-automation-service";

describe("browser automation API", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-browser-automation-api-"));
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
  const app = createControlPlaneApp({
    dataDir,
    startSchedulers: false,
    browserAutomationExecutor: executor
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns the built-in wait workflow and runs a created workflow", async () => {
    const initialResponse = await app.inject({
      method: "GET",
      url: "/api/browser-automation"
    });
    const initial = initialResponse.json();

    expect(initial.workflows[0]).toMatchObject({
      id: "browser-workflow-wait-example",
      name: "等待网页状态示例"
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/browser-automation/workflows",
      payload: {
        name: "打开示例页",
        steps: [
          {
            id: "open",
            type: "openUrl",
            url: "https://example.com"
          }
        ]
      }
    });
    const workflow = createResponse.json();

    const runResponse = await app.inject({
      method: "POST",
      url: `/api/browser-automation/workflows/${workflow.id}/run`,
      payload: {}
    });
    const run = runResponse.json();

    expect(run).toMatchObject({
      workflowId: workflow.id,
      status: "completed"
    });
    expect(run.logs[0].message).toBe("ran openUrl");
  });

  it("runs a workflow when a matching task completion event is emitted", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/browser-automation/workflows",
      payload: {
        name: "记账后打开网页",
        steps: [
          {
            id: "open",
            type: "openUrl",
            url: "https://example.com"
          }
        ]
      }
    });
    const workflow = createResponse.json();

    await app.inject({
      method: "POST",
      url: "/api/browser-automation/trigger-rules",
      payload: {
        name: "ledger completed",
        workflowId: workflow.id,
        enabled: true,
        match: {
          agentId: "ledger-agent",
          status: "completed"
        }
      }
    });

    await app.inject({
      method: "POST",
      url: "/api/ledger/record",
      payload: {
        message: "今天午餐花了 32 元"
      }
    });

    await vi.waitFor(() => {
      expect(executor.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: expect.objectContaining({
            id: workflow.id
          })
        })
      );
    });
  });
});
