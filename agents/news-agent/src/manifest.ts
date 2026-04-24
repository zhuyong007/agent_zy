import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "news-agent",
  name: "热点 Agent",
  description: "分钟级刷新热点并给出多角度分析",
  version: "0.1.0",
  capabilities: ["news.refresh", "news.analyze"],
  triggers: ["user", "schedule", "system"],
  modulePath: "agents/news-agent/src/index.ts",
  manifestPath: "agents/news-agent/src/manifest.ts",
  tags: ["热点", "新闻", "热搜", "分析", "刷新"]
});
