import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "history-agent",
  name: "历史知识 Agent",
  description: "每天生成一个历史知识点的小红书推文策划与生图提示词",
  version: "0.1.0",
  capabilities: ["history.generatePost"],
  triggers: ["user", "schedule"],
  modulePath: "agents/history-agent/src/index.ts",
  manifestPath: "agents/history-agent/src/manifest.ts",
  tags: ["历史", "知识点", "小红书", "推文", "生图", "提示词"]
});
