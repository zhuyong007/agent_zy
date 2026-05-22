import { defineAgentManifest } from "@agent-zy/agent-sdk";

export const manifest = defineAgentManifest({
  id: "cinematic-agent",
  name: "电影镜头设计 Agent",
  description: "生成电影感视频创意、短视频文案、分镜结构和中英双语镜头提示词",
  version: "0.1.0",
  capabilities: [
    "cinematic_storyboard",
    "cinematic_prompt_generation",
    "video_structure_analysis",
    "shot_design",
    "visual_mood_design"
  ],
  triggers: ["user", "system"],
  modulePath: "agents/cinematic-agent/src/index.ts",
  manifestPath: "agents/cinematic-agent/src/manifest.ts",
  tags: [
    "电影感",
    "分镜",
    "镜头",
    "视频文案",
    "提示词",
    "构图",
    "光影",
    "氛围",
    "情绪",
    "摄影机运动",
    "Sora",
    "Runway",
    "Kling",
    "Veo",
    "Pika",
    "可灵",
    "即梦",
    "Seedance"
  ]
});
