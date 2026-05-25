import type { CinematicGenerationInput } from "./types";

export const CINEMATIC_SYSTEM_PROMPT = [
  "你是电影镜头设计智能体，不是绘图工具、视频生成器或自动剪辑器。",
  "你的职责是像导演、摄影指导和分镜师一样思考：结构、节奏、构图、景别、焦段、光影、色彩、空气感、情绪递进、镜头隐喻和留白。",
  "学习电影语言、光影和节奏，不直接复刻任何具体电影内容。",
  "文案避免营销号、鸡汤、解说腔和 PPT 分镜腔。",
  "只输出严格 JSON 对象，不要输出 Markdown，不要解释 JSON 外的内容。"
].join("\n");

export function buildCinematicPrompt(input: CinematicGenerationInput) {
  const shotCountRule =
    typeof input.targetShotCount === "number" && input.targetShotCount > 0
      ? `用户期望约 ${input.targetShotCount} 个分镜；如情绪表达明显不足，可在合理范围内微调。`
      : "请根据概念自动判断合理分镜数量，通常 5 到 9 个镜头，必须包含建立、递进、高潮或留白、结尾收束。";

  return `请为以下视频概念生成电影镜头设计方案。

概念：${input.concept}
风格偏好：${input.style?.trim() || "由你根据内容判断，偏电影感和高级审美"}
节奏偏好：${input.pace?.trim() || "由情绪自然决定"}
镜头数量要求：${shotCountRule}

输出字段必须是：
{
  "title": "视频标题",
  "concept": "概念",
  "mood": "核心情绪",
  "script": "短视频文案，像电影台词或内心独白，不鸡汤",
  "style": "整体美术/摄影风格",
  "pace": "节奏描述",
  "continuity": {
    "actionLine": "连续动作线：主角/主体从第一个镜头到最后一个镜头发生了什么动作变化，必须能把所有分镜串成同一场戏",
    "spatialLine": "空间连续性：人物、场景、道具、方位、前景/中景/背景如何保持同一空间关系",
    "emotionalLine": "情绪递进线：每个分镜之间的情绪因果，不是并列罗列",
    "visualLine": "视觉连续性：光线方向、色彩、天气、材质、镜头质感如何贯穿",
    "audioLine": "声音连续性：环境声、动作声或音乐如何把镜头连接起来"
  },
  "targetShotCount": 数字,
  "tags": ["标签"],
  "storyboard": [
    {
      "id": "shot-1",
      "title": "分镜名称",
      "purpose": "分镜目标",
      "duration": "时长建议",
      "cameraMovement": "摄影机运动",
      "shotType": "镜头类型",
      "composition": "构图",
      "transition": "转场建议",
      "audioHint": "音乐/环境音建议",
      "emotionalBeat": "情绪变化",
      "handoff": "本镜头如何接到下一镜：使用动作延续、视线方向、声音先行、光影变化、同一物体/构图匹配或转场钩子，不要只写转场名称",
      "prompt": {
        "zh": "300-500 字中文视频提示词，必须包含场景、人物、光线、色彩、材质、摄影机运动、焦段、景深、空气感、环境细节、时间、天气、构图、镜头节奏、情绪、美术风格、动态元素、前景/中景/背景、画面噪点、胶片感、呼吸感、慢动作或推进/摇移/留白、情绪隐喻。",
        "en": "Detailed English video prompt with equivalent cinematic detail, ready for AI video/image tools."
      }
    }
  ]
}

硬性要求：
- storyboard 至少 4 个分镜，简单概念也要有完整情绪递进。
- continuity 必须先建立整条视频的动作线、空间线、情绪线、视觉线和声音线；分镜必须服务于这条连续线，不要写成互不相干的漂亮画面。
- 每个 storyboard 项都必须有 handoff，说明这一镜如何自然接到下一镜；最后一镜的 handoff 写如何收束或留白。
- 每个中文 prompt 必须是电影级镜头描述，不要写成“一个人站在雨里”这类简单提示。
- 不要声明会生成图片或视频，不要接入或提及正在调用任何生成 API。
- 英文 prompt 必须保留镜头语言，不要只翻译成简短关键词。`;
}
