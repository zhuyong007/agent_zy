import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "classic-shot-agent",
  name: "经典镜头复刻 Agent",
  description: "拆解有明确出处的经典电影镜头，生成适合 AI 视频工具的连贯分镜提示词",
  version: "0.1.0",
  capabilities: [
    "classic_shot_recreation",
    "film_reference_analysis",
    "ai_video_storyboard_prompt",
    "long_take_continuity_design"
  ],
  triggers: ["user", "system"],
  modulePath: "agents/classic-shot-agent/src/index.ts",
  manifestPath: "agents/classic-shot-agent/src/manifest.ts",
  tags: [
    "经典电影镜头",
    "经典镜头",
    "复刻",
    "电影出处",
    "镜头拆解",
    "长镜头",
    "连贯镜头",
    "分镜提示词",
    "AI 视频",
    "剪映",
    "即梦",
    "可灵",
    "Runway",
    "Seedance"
  ]
});
