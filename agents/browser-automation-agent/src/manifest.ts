import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "browser-automation-agent",
  name: "浏览器自动化 Agent",
  description: "按结构化流程打开网页、识别页面状态并执行浏览器操作",
  version: "0.1.0",
  capabilities: ["browser.open", "browser.workflow", "browser.observe", "browser.operate"],
  triggers: ["user", "schedule", "system"],
  modulePath: "agents/browser-automation-agent/src/index.ts",
  manifestPath: "agents/browser-automation-agent/src/manifest.ts",
  tags: ["浏览器", "自动化", "Chrome", "网页", "流程"]
});
