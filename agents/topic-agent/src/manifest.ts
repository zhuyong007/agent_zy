import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "topic-agent",
  name: "选题 Agent",
  description: "每 3 小时推送适合 AI 自媒体创作的选题",
  version: "0.1.0",
  capabilities: ["topics.generate", "topics.history"],
  triggers: ["user", "schedule", "system"],
  modulePath: "agents/topic-agent/src/index.ts",
  manifestPath: "agents/topic-agent/src/manifest.ts",
  tags: ["选题", "自媒体", "内容", "AI", "视频", "公众号"]
});
