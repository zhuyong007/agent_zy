import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "schedule-agent",
  name: "日程 Agent",
  description: "规划每天待办、推荐时间窗口、晚间回顾完成情况",
  version: "0.1.0",
  capabilities: ["schedule.plan", "schedule.review"],
  triggers: ["user", "schedule"],
  modulePath: "agents/schedule-agent/src/index.ts",
  manifestPath: "agents/schedule-agent/src/manifest.ts",
  tags: ["日程", "待办", "计划", "今天", "回顾", "完成"]
});
