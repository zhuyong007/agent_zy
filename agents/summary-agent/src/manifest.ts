import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "summary-agent",
  name: "总结 Agent",
  description: "生成每日、每周、每月、每年个人总结草稿，保留长期复盘记录",
  version: "0.1.0",
  capabilities: ["summary.generate-draft", "summary.observe"],
  triggers: ["user", "system"],
  modulePath: "agents/summary-agent/src/index.ts",
  manifestPath: "agents/summary-agent/src/manifest.ts",
  tags: ["总结", "复盘", "日志", "每日总结", "周总结", "月总结", "年总结", "生活记录"]
});
