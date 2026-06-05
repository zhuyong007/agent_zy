import { defineAgent, getModelClient } from "@agent-zy/agent-sdk";
import type { AgentExecutionRequest, AgentExecutionResult } from "@agent-zy/agent-sdk";
import type { BrowserAutomationWorkflow } from "@agent-zy/shared-types";

import { createDesktopBrowserAutomationExecutor } from "../../../apps/control-plane/src/services/browser-automation-desktop-executor";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asWorkflow(value: unknown): BrowserAutomationWorkflow | null {
  const record = asRecord(value);

  return typeof record.id === "string" && Array.isArray(record.steps)
    ? value as BrowserAutomationWorkflow
    : null;
}

export const agent = defineAgent({
  async execute(input: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const workflow = asWorkflow(input.meta?.workflow);

    if (!workflow) {
      return {
        status: "failed",
        summary: "浏览器流程缺少 workflow 元数据",
        assistantMessage: "请通过浏览器自动化 API 启动已保存的结构化流程。"
      };
    }

    const modelClient = getModelClient();
    const executor = createDesktopBrowserAutomationExecutor({
      modelRuntime: {
        chat(request) {
          return modelClient.chat(request);
        },
        generateText(request) {
          return modelClient.generateText(request);
        },
        embedding(request) {
          return modelClient.embedding(request);
        },
        testConnection() {
          return Promise.resolve({ ok: true, message: "agent model client available" });
        },
        execute() {
          return Promise.reject(new Error("agent model client does not support generic execute"));
        }
      }
    });
    const controller = new AbortController();
    const result = await executor.runWorkflow({
      workflow,
      runId: input.taskId,
      signal: controller.signal
    });

    return {
      status: result.status === "completed" ? "completed" : "failed",
      summary: result.status === "completed" ? `浏览器流程已完成：${workflow.name}` : result.error ?? "浏览器流程执行失败",
      assistantMessage:
        result.status === "completed"
          ? `已完成浏览器流程「${workflow.name}」。`
          : `浏览器流程「${workflow.name}」执行失败：${result.error ?? "未知错误"}`
    };
  }
});

export default agent;
