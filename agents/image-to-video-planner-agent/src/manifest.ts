import type { AgentManifest } from "@agent-zy/agent-sdk";

export const manifest: AgentManifest = {
  id: "image-to-video-planner-agent",
  name: "图片转视频策划",
  description: "分阶段分析图片、规划视频关键帧、审核补帧并生成最终视频提示词",
  version: "0.1.0",
  capabilities: ["vision-analysis", "video-planning", "keyframe-review"],
  triggers: ["user"],
  modulePath: "@agent-zy/image-to-video-planner-agent",
  manifestPath: "@agent-zy/image-to-video-planner-agent/manifest",
  tags: ["image", "video", "planner"]
};
