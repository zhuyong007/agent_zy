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
  const visualStyleRule = input.visualStyle?.trim()
    ? input.visualStyle.trim()
    : "由你根据内容判断，但必须保持统一，不要在同一项目里混用真实、动漫、插画等不同画面风格类型";
  const visualFocusRule = input.visualFocus?.trim()
    ? `用户指定必须强相关的静态画面元素：${input.visualFocus.trim()}`
    : "用户没有指定额外静态画面元素，请严格围绕概念本身延展，不要生成与用户输入无关的奇观内容。";
  const negativePromptRule = input.negativePrompt?.trim()
    ? `用户指定不要出现的内容：${input.negativePrompt.trim()}`
    : "不要加入用户没有要求的怪物化、惊悚化、科幻化、文字水印、夸张瞳孔变化或无关符号。";

  return `请为以下视频概念生成电影镜头设计方案。

概念：${input.concept}
风格偏好：${input.style?.trim() || "由你根据内容判断，偏电影感和高级审美"}
画面风格类型：${visualStyleRule}
节奏偏好：${input.pace?.trim() || "由情绪自然决定"}
镜头数量要求：${shotCountRule}
静态画面要求：${visualFocusRule}
禁止内容：${negativePromptRule}

输出字段必须是：
{
  "title": "视频标题",
  "concept": "概念",
  "mood": "核心情绪",
  "script": "短视频文案，像电影台词或内心独白，不鸡汤",
  "style": "整体美术/摄影风格",
  "pace": "节奏描述",
  "scenePlan": {
    "sceneCount": 1到3之间的数字,
    "maxDurationSeconds": 15,
    "scenes": [
      {
        "id": "scene-1",
        "name": "场景名称",
        "anchor": "场景锚点：固定地点、关键道具、人物位置、光线方向和环境质感",
        "role": "这个场景在15秒视频里的叙事作用"
      }
    ]
  },
  "referenceAssets": {
    "characters": [
      {
        "id": "character-1",
        "name": "人物名称",
        "description": "固定人物设定：年龄感、脸型、发型、服装、体态、材质、色彩和识别特征",
        "views": {
          "front": {
            "zh": "人物正面三视图参考图提示词：纯色或极简背景，完整正面站姿，清楚描述同一脸型、发型、服装、比例、材质、色彩和识别特征，不写运镜或动作变化。",
            "en": "Front character reference sheet prompt with a plain background, full front standing pose, same face shape, hairstyle, costume, proportions, materials, colors, and identifying features; no camera movement or changing action."
          },
          "side": {
            "zh": "人物侧面三视图参考图提示词：纯色或极简背景，完整侧面站姿，保持与正面完全一致的人物、服装、比例、材质和色彩。",
            "en": "Side character reference sheet prompt with a plain background, full side standing pose, preserving the same character, costume, proportions, materials, and colors."
          },
          "back": {
            "zh": "人物背面三视图参考图提示词：纯色或极简背景，完整背面站姿，保持同一服装背部结构、发型后轮廓、比例、材质和色彩。",
            "en": "Back character reference sheet prompt with a plain background, full back standing pose, preserving the costume back structure, rear hairstyle silhouette, proportions, materials, and colors."
          }
        }
      }
    ],
    "props": [
      {
        "id": "prop-1",
        "name": "物品名称",
        "description": "固定物品设定：形状、材质、色彩、磨损、尺寸感和识别特征",
        "views": {
          "front": {
            "zh": "物品正面三视图参考图提示词：纯色或极简背景，清楚描述形状、材质、色彩、磨损、尺寸感和识别特征。",
            "en": "Front prop reference sheet prompt with a plain background, clearly describing shape, material, color, wear, scale, and identifying features."
          },
          "side": {
            "zh": "物品侧面三视图参考图提示词：纯色或极简背景，保持同一形状、材质、色彩、磨损和尺寸感。",
            "en": "Side prop reference sheet prompt with a plain background, preserving the same shape, material, color, wear, and scale."
          },
          "back": {
            "zh": "物品背面三视图参考图提示词：纯色或极简背景，保持同一背部结构、材质、色彩、磨损和识别特征。",
            "en": "Back prop reference sheet prompt with a plain background, preserving the same rear structure, material, color, wear, and identifying features."
          }
        }
      }
    ],
    "scenes": [
      {
        "id": "scene-ref-1",
        "name": "场景名称",
        "description": "固定场景设定：地点、空间布局、关键道具位置、光线方向、色彩、天气和环境质感",
        "prompt": {
          "zh": "场景参考图提示词：只生成一张场景基准图，不需要三视图；明确地点、空间布局、关键道具位置、光线方向、色彩、天气、材质和环境质感。",
          "en": "Scene reference image prompt: generate one baseline scene image only, no three-view sheet; define location, spatial layout, key prop positions, light direction, color, weather, materials, and atmosphere."
        }
      }
    ]
  },
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
      "sceneId": "scene-1",
      "sceneAnchor": "必须引用 scenePlan 中同一个场景锚点，说明本镜头如何复用该场景",
      "characterRefs": ["character-1"],
      "propRefs": ["prop-1"],
      "sceneRef": "scene-ref-1",
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
        "zh": "300-500 字中文静态单帧画面提示词，只描述这一帧里已经可见的画面状态：场景、人物外观、固定姿态、视线落点、光线、色彩、材质、焦段观感、景深、空气感、环境细节、时间、天气、构图、前景/中景/背景、画面噪点、胶片质感和画面中可见元素；不要写摄影机运动、运镜、推进、摇移、跟拍、转场、声音、情绪说明或任何动态变化。",
        "en": "Detailed English static single-frame prompt with equivalent visual detail only; describe visible state and fixed pose, not camera movement, transitions, sound, emotion, or any changing action."
      }
    }
  ]
}

硬性要求：
- 最终视频时长按 15 秒以内设计；scenePlan.sceneCount 必须是 1-3，绝对不要一张分镜图一个新场景。
- 如果镜头中出现人物，必须在 referenceAssets.characters 里生成对应人物的正面、侧面、背面三视图参考图提示词；如果没有人物，characters 返回空数组。
- 如果镜头中出现物品或关键道具，必须在 referenceAssets.props 里生成对应物品的正面、侧面、背面三视图参考图提示词；如果没有物品，props 返回空数组。
- 如果镜头中出现可复用场景，必须在 referenceAssets.scenes 里生成对应场景参考图提示词；场景只需要一张参考图，不需要三视图。
- 分镜图必须基于已生成的人物、物品、场景参考图来写：每个 storyboard 项用 characterRefs、propRefs、sceneRef 引用对应 referenceAssets 的 id，并在 prompt.zh/prompt.en 中保持这些参考图的人物脸型、服装、物品形状、场景布局、光线方向和材质一致。
- storyboard 可以有多个镜头，但必须复用 scenePlan 里的 1-3 个场景；同一场景内只改变机位、焦段、人物动作、视线、光影细节和情绪，不要让场景漂移。
- 每个 storyboard 项都必须有 sceneId 和 sceneAnchor，sceneId 必须来自 scenePlan.scenes。
- storyboard 至少 4 个分镜，简单概念也要有完整情绪递进。
- continuity 必须先建立整条视频的动作线、空间线、情绪线、视觉线和声音线；分镜必须服务于这条连续线，不要写成互不相干的漂亮画面。
- 每个 storyboard 项都必须有 handoff，说明这一镜如何自然接到下一镜；最后一镜的 handoff 写如何收束或留白。
- 每个分镜画面提示词都必须遵循这个画面风格类型；如果用户选择“动漫”，prompt.zh/prompt.en 要写清动漫质感、线条、上色和光影；如果用户选择“真实影像”，要保持实拍摄影、真实材质、自然皮肤和镜头质感。
- 单个分镜 prompt.zh 和 prompt.en 只描述静态单帧画面本身；不要写摄影机运动、运镜、推进、摇移、跟拍、转场、声音或情绪说明。镜头运动只写在 cameraMovement 字段和分镜串联视频提示词中。
- prompt.zh/prompt.en 禁止写“正在、开始、逐渐、急剧、收缩成、转头、走向、推近、拉远”等动态变化；例如不要写“中心瞳孔急剧收缩成针尖大小”，应写成“中心瞳孔呈针尖大小的静止状态”。
- 每个中文 prompt 必须是电影级镜头描述，不要写成“一个人站在雨里”这类简单提示。
- 不要声明会生成图片或视频，不要接入或提及正在调用任何生成 API。
- 英文 prompt 必须保留镜头语言，不要只翻译成简短关键词。`;
}
