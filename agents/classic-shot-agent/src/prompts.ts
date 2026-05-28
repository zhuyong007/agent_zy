import type { ClassicShotGenerationInput } from "./types";

export const CLASSIC_SHOT_SYSTEM_PROMPT = [
  "你是经典电影镜头复刻智能体，必须像导演、摄影指导和分镜设计师一样工作。",
  "你的唯一目标是把有明确出处的经典电影镜头拆解成可直接用于 AI 视频生成工具的高质量分镜提示词。",
  "你不是影评人、剧情解说员或泛泛电影分析助手。",
  "最高优先级：每个镜头必须有明确导演、电影名、上映年份、镜头位置。无法确认出处时不要编造，必须输出 failureReason。",
  "优先选择或设计连贯镜头：长镜头、跟拍、横移、环绕、推拉变焦、单镜头情绪推进，避免 MV 式碎切和短视频快切。",
  "每个分镜提示词必须明确主体、场景、材质、光线、摄影机运动、前景、背景、景深、时间、情绪、色彩、空气感、动态元素、运镜节奏、焦段感、胶片颗粒感和连贯动作。",
  "提示词必须可执行，不能抽象文学化，不能只写风格词。",
  "输出严格 JSON 对象，不要输出 Markdown，不要解释 JSON 外内容。"
].join("\n");

export function buildClassicShotPrompt(input: ClassicShotGenerationInput) {
  return `请根据用户输入生成“经典电影镜头复刻”方案。

用户输入：${input.input}
目标平台：${input.targetPlatform ?? "generic"}

如果用户输入“随机生成一个经典镜头”，请选择真正适合 AI 复刻的经典镜头，优先长镜头、连续调度、明确空间和低制作复杂度；如果原镜头复杂，保留灵魂并降低制作复杂度。

输出必须是以下 JSON 形状：
{
  "rawInput": "用户原始输入",
  "title": "复刻方案标题",
  "source": {
    "director": "导演",
    "film": "电影名",
    "year": 2000,
    "shotName": "经典镜头名称",
    "shotPosition": "镜头出现的大概阶段",
    "context": "必要背景，可省略"
  },
  "coreValue": "100字以内，说明经典价值，重点是调度、情绪、光影、摄影机运动、节奏",
  "analysis": {
    "cameraMovement": "摄影机运动分析",
    "lighting": "光影结构分析",
    "emotionCurve": "情绪曲线，必须体现推进感"
  },
  "minimumStoryboardCount": 1,
  "storyboard": [
    {
      "id": "shot-1",
      "title": "分镜名称",
      "function": "这个镜头负责什么",
      "prompt": "300-500字中文 AI 视频生成提示词，只写可执行画面与运镜，不要分点，不要解释",
      "movementKeywords": ["slow tracking shot", "long take"],
      "visualKeywords": ["film grain", "cinematic lighting"]
    }
  ],
  "continuity": {
    "actionContinuity": "人物动作如何衔接",
    "cameraContinuity": "摄影机方向如何统一",
    "lightingContinuity": "光线如何连续",
    "colorContinuity": "色调如何统一",
    "antiJumpGuidance": "如何避免 AI 镜头跳变"
  }
}

硬性要求：
- source.director、source.film、source.year、source.shotName、source.shotPosition 必须明确。
- coreValue 不超过 100 个中文字符。
- minimumStoryboardCount 必须是为了尽量还原镜头所需的最少分镜数量；一个镜头能解决就不要拆成多个。
- storyboard 至少 1 个分镜，每个 prompt 必须 300-500 字，并包含“连续镜头感”或等价明确表述。
- 每个分镜 movementKeywords 和 visualKeywords 都不能为空。
- continuity 五个字段必须完整。
- 禁止“像王家卫风格”“类似诺兰”这类无出处描述。
- 不要复制电影台词、字幕或长段受版权保护文本。`;
}

export function buildClassicShotVideoFramePrompt(input: ClassicShotGenerationInput) {
  const frames = input.frames ?? [];
  const revisionInstruction =
    input.revisionInstruction?.trim() ||
    "保留镜头结构，改变画面风格和场景，避免生成一模一样的视频";

  return `请根据用户上传视频抽出的 ${frames.length} 张按时间顺序排列的参考帧，生成“相似但不一模一样”的 AI 视频复刻分镜方案。

原视频文件：${input.videoReference?.fileName ?? "uploaded-video"}
原视频时长：${input.videoReference?.durationSeconds ?? 0} 秒
目标平台：${input.targetPlatform ?? "generic"}
用户改写要求：${revisionInstruction}

帧顺序：
${frames.map((frame) => `- 第 ${frame.index} 帧：${frame.timestampSeconds} 秒`).join("\n")}

输出必须是以下 JSON 形状：
{
  "rawInput": "上传视频复刻",
  "title": "方案标题",
  "referenceType": "uploaded-video",
  "videoReference": {
    "fileName": "原视频文件名",
    "durationSeconds": 9,
    "extractedFrameCount": 3,
    "revisionInstruction": "用户改写要求"
  },
  "source": {
    "director": "用户上传视频",
    "film": "原视频文件名",
    "year": 2026,
    "shotName": "上传视频参考",
    "shotPosition": "按上传视频抽帧顺序分析"
  },
  "coreValue": "100字以内，说明原视频镜头结构的可复刻价值",
  "analysis": {
    "cameraMovement": "根据帧序列反推摄影机运动",
    "lighting": "根据帧序列反推光影结构，并说明改写后的光影",
    "emotionCurve": "根据帧序列反推情绪曲线，并体现推进感"
  },
  "minimumStoryboardCount": 3,
  "storyboardVideoPrompt": "分镜串联提示词，说明如何把所有帧提示词按顺序生成一条连续视频，必须强调相似但不相同",
  "storyboard": [
    {
      "id": "shot-1",
      "title": "分镜名称",
      "function": "这个帧/分镜负责什么",
      "sourceFrame": { "index": 1, "timestampSeconds": 0.5 },
      "prompt": "300-500字中文 AI 视频生成提示词。先反推参考帧画面结构，再按用户改写要求切换风格/场景/主体，保留镜头节奏但避免一模一样。",
      "movementKeywords": ["slow tracking shot", "long take"],
      "visualKeywords": ["film grain", "cinematic lighting"]
    }
  ],
  "continuity": {
    "actionContinuity": "人物动作如何按帧顺序衔接",
    "cameraContinuity": "摄影机方向如何统一",
    "lightingContinuity": "光线如何连续",
    "colorContinuity": "色调如何统一",
    "antiJumpGuidance": "如何避免 AI 镜头跳变、换脸、换场景，以及如何避免复刻成一模一样的视频"
  }
}

硬性要求：
- 不需要真实电影出处；source 必须标记为用户上传视频。
- storyboard 数量必须与参考帧数量一致，顺序必须一致。
- 每个 storyboard.prompt 必须 300-500 字，并包含“连续镜头感”或等价明确表述。
- 每个 storyboard 必须带 sourceFrame，且 index/timestampSeconds 必须对应参考帧。
- storyboardVideoPrompt 必须存在，必须说明“相似但不相同”的串联生成方法。
- 不能照抄原视频的具体人物脸型、品牌、字幕、logo 或可识别私人信息。`;
}
