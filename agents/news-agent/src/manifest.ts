import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "news-agent",
  name: "热点 Agent",
  description: "接入 AI HOT 公共 API，同步精选 AI 动态并给出多角度分析",
  version: "0.1.0",
  capabilities: ["news.refresh", "news.analyze"],
  triggers: ["user", "schedule", "system"],
  modulePath: "agents/news-agent/src/index.ts",
  manifestPath: "agents/news-agent/src/manifest.ts",
  tags: ["AI HOT", "AI热点", "新闻", "日报", "模型", "产品", "论文", "分析", "刷新"]
});
