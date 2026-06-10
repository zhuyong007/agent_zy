import type {
  ImageAnalysisResult,
  KeyframeRequirement,
  VideoPlan
} from "@agent-zy/shared-types";

export const IMAGE_TO_VIDEO_SYSTEM_PROMPT = [
  "你是分阶段视频策划助手，负责分析图片、设计短视频、规划和审核关键帧，并生成最终视频提示词。",
  "所有输出必须是中文严格 JSON，不要输出 Markdown、代码围栏或 JSON 外解释。",
  "描述必须具体可执行，优先保证主体、场景、构图、光影、风格和动作连续性。"
].join("\n");

const analysisShape = {
  imageId: "图片 ID",
  suitableForVideo: true,
  unsuitableReason: null,
  roleSuggestion: "首帧/中间帧/尾帧/风格参考",
  subjectDescription: "主体描述",
  sceneDescription: "场景描述",
  composition: "构图",
  lighting: "光影",
  mood: "情绪",
  style: "风格",
  motionPotential: "运动潜力",
  risks: ["风险"]
};
const planShape = {
  videoDuration: 8,
  coreConcept: "核心效果",
  visualStyle: "视觉风格",
  cameraMovement: "镜头运动",
  subjectMovement: "主体运动",
  sceneMovement: "场景运动",
  rhythm: "节奏",
  emotionalArc: "情绪变化",
  recommendedKeyframes: [{ keyframeId: "start", timestamp: 0, role: "首帧", reason: "作用" }],
  bgmSuggestion: "BGM",
  soundEffectSuggestion: "音效",
  reason: "方案理由"
};
const keyframesShape = {
  videoDuration: 8,
  keyframes: [{
    keyframeId: "end",
    timestamp: 8,
    role: "尾帧",
    requiredImageDescription: "所需画面",
    purpose: "作用",
    transitionRelation: "与前后帧关系",
    generationPrompt: "生图提示词",
    negativePrompt: "负面提示词",
    status: "PENDING"
  }]
};
const reviewShape = {
  keyframeId: "end",
  approved: false,
  score: 80,
  problems: ["具体问题"],
  improvementAdvice: "修改建议",
  revisedGenerationPrompt: "调整版生图提示词",
  revisedNegativePrompt: "调整版负面提示词"
};
const finalShape = {
  duration: 8,
  keyframeTimeline: [{ keyframeId: "start", timestamp: 0, description: "画面说明" }],
  promptText: "300-500 字最终视频提示词",
  negativePrompt: "禁止项",
  bgm: "BGM",
  soundEffects: ["音效"],
  usageNotes: "使用说明"
};

export function buildImageAnalysisRequest(imageId: string) {
  return `执行图片分析，图片 ID：${imageId}。判断主体、场景、构图、光影、情绪、风格、运动潜力、风险、是否适合视频，以及适合作为首帧、中间帧、尾帧或风格参考。\n严格按此 JSON 结构输出：${JSON.stringify(analysisShape)}`;
}

export function buildVideoPlanRequest(analysis: ImageAnalysisResult) {
  return `根据图片分析生成 4 到 15 秒视频方案。必须包含核心效果、镜头运动、主体运动、场景运动、节奏、情绪弧线、推荐关键帧、BGM、音效和理由。\n严格按此 JSON 结构输出：${JSON.stringify(planShape)}\n图片分析：${JSON.stringify(analysis)}`;
}

export function buildKeyframePlanRequest(analysis: ImageAnalysisResult, plan: VideoPlan) {
  return `根据图片分析和视频方案规划所有必要关键帧，并为待补关键帧生成可直接用于生图工具的提示词与负面提示词。关键帧时间点必须唯一且位于视频时长内。\n严格按此 JSON 结构输出：${JSON.stringify(keyframesShape)}\n图片分析：${JSON.stringify(analysis)}\n视频方案：${JSON.stringify(plan)}`;
}

export function buildKeyframeReviewRequest(
  analysis: ImageAnalysisResult,
  plan: VideoPlan,
  requirement: KeyframeRequirement
) {
  return `审核上传图片是否满足目标关键帧要求。检查主体、风格、场景、构图、动作衔接、视角、光影和明显变形；不通过时给出具体问题、修改建议和调整版提示词。\n严格按此 JSON 结构输出：${JSON.stringify(reviewShape)}\n图片分析：${JSON.stringify(analysis)}\n视频方案：${JSON.stringify(plan)}\n待审核关键帧：${JSON.stringify(requirement)}`;
}

export function buildFinalPromptRequest(
  analysis: ImageAnalysisResult,
  plan: VideoPlan,
  keyframes: KeyframeRequirement[]
) {
  return `基于全部已通过关键帧生成 300-500 字中文视频生成提示词。明确总时长、每张图时间点、镜头和主体运动、场景和光影变化、情绪、转场、连续性、稳定性、禁止项、BGM 和音效。\n严格按此 JSON 结构输出：${JSON.stringify(finalShape)}\n图片分析：${JSON.stringify(analysis)}\n视频方案：${JSON.stringify(plan)}\n关键帧：${JSON.stringify(keyframes)}`;
}

export function buildJsonRepairRequest(rawOutput: string, validationIssue: string, originalRequirement = "") {
  return `修复下面的模型输出，使其成为满足字段要求的严格 JSON。不要输出解释。\n原阶段要求：${originalRequirement.slice(0, 5000)}\n校验问题：${validationIssue}\n原输出：${rawOutput.slice(0, 8000)}`;
}
