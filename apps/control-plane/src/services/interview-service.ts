import { nanoid } from "nanoid";

import type {
  InterviewAnswer,
  InterviewDailyReport,
  InterviewDailySession,
  InterviewMastery,
  InterviewOverview,
  InterviewQuestion,
  InterviewQuestionType,
  InterviewSkillModule,
  InterviewState,
  InterviewWeakModule
} from "@agent-zy/shared-types";

import type { ModelRuntime } from "./model-runtime";
import type { ControlPlaneStore } from "./store";

const QUESTIONS_PER_MODULE = 3;
const MODULES_PER_DAY = 3;

export const INTERVIEW_SKILL_MODULES: InterviewSkillModule[] = [
  {
    id: "python-basics",
    label: "Python 基础",
    category: "基础高频",
    description: "语法、数据结构、异常处理、标准库和面向对象基础。",
    targetSkills: ["数据结构", "函数", "异常处理", "文件与包管理"],
    defaultWeight: 3,
    weaknessBoost: 2
  },
  {
    id: "typescript-basics",
    label: "JavaScript/TypeScript",
    category: "基础高频",
    description: "异步、类型建模、模块化和浏览器运行机制。",
    targetSkills: ["异步 Promise", "类型收窄", "模块化", "运行时错误"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "http-api",
    label: "HTTP/API",
    category: "基础高频",
    description: "REST 接口、状态码、幂等、分页、错误响应和 API 调试。",
    targetSkills: ["REST 设计", "错误码", "幂等", "接口调试"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "database-basics",
    label: "数据库基础",
    category: "基础高频",
    description: "表结构、索引、事务、查询优化和数据迁移。",
    targetSkills: ["索引", "事务", "建模", "迁移"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "git-linux-deploy",
    label: "Git/Linux/部署基础",
    category: "基础高频",
    description: "分支协作、常用命令、环境变量、进程管理和基础部署。",
    targetSkills: ["Git 分支", "环境变量", "进程管理", "部署回滚"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "frontend-react",
    label: "前端 React",
    category: "全栈模块",
    description: "组件状态、请求缓存、表单交互、错误态和可测试 UI。",
    targetSkills: ["组件状态", "React Query", "表单", "前端测试"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "backend-service",
    label: "后端服务设计",
    category: "全栈模块",
    description: "服务分层、输入校验、持久化、日志和错误处理。",
    targetSkills: ["服务分层", "输入校验", "错误处理", "日志"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "auth-security",
    label: "鉴权与安全",
    category: "全栈模块",
    description: "认证授权、密钥管理、输入安全和数据权限边界。",
    targetSkills: ["鉴权", "授权", "密钥管理", "输入安全"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "llm-api",
    label: "LLM API 调用",
    category: "AI 模块",
    description: "模型配置、消息结构、JSON 输出、超时、重试和成本控制。",
    targetSkills: ["消息结构", "JSON 输出", "超时重试", "成本控制"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "rag",
    label: "RAG",
    category: "AI 模块",
    description: "切分、向量检索、召回、重排、上下文注入和答案校验。",
    targetSkills: ["切分", "向量检索", "召回评估", "上下文注入"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "agent-workflow",
    label: "Agent 工作流",
    category: "AI 模块",
    description: "工具调用、任务拆解、状态机、人机确认和失败恢复。",
    targetSkills: ["工具调用", "状态机", "任务拆解", "失败恢复"],
    defaultWeight: 2,
    weaknessBoost: 1
  },
  {
    id: "production-ai",
    label: "AI 应用实战",
    category: "实战模块",
    description: "线上排障、可观测性、数据隐私、延迟和可靠性。",
    targetSkills: ["可观测性", "线上排障", "数据隐私", "可靠性"],
    defaultWeight: 2,
    weaknessBoost: 1
  }
];

const QUESTION_BANK: Record<string, Array<{
  type: InterviewQuestionType;
  prompt: string;
  targetSkill: string;
  expectedPoints: string[];
  referenceAnswer: string;
  rubric: string[];
}>> = {
  "python-basics": [
    {
      type: "short-answer",
      prompt: "Python 中如何处理接口调用失败后的重试？请说明超时、异常捕获和日志策略。",
      targetSkill: "异常处理",
      expectedPoints: ["设置超时", "捕获明确异常", "有限重试", "记录日志"],
      referenceAnswer: "为请求设置超时，捕获网络/状态异常，使用有限次数重试和退避策略，并记录请求上下文、失败原因和最终结果。",
      rubric: ["是否说明超时", "是否限制重试次数", "是否记录可排障日志"]
    },
    {
      type: "code",
      prompt: "写一个 Python 函数，把列表中的字典按 `id` 去重，保留最后一次出现的记录，并保持最终顺序。",
      targetSkill: "数据结构",
      expectedPoints: ["使用 dict 去重", "保留最后记录", "保持顺序"],
      referenceAnswer: "可以遍历列表写入 dict，再按原列表中最后出现后的插入顺序输出；或先反向遍历收集未见 id，再反转结果。",
      rubric: ["去重逻辑正确", "保留最后一次", "顺序符合要求"]
    },
    {
      type: "short-answer",
      prompt: "Python 项目中为什么要区分业务异常和系统异常？你会如何组织错误类型？",
      targetSkill: "错误建模",
      expectedPoints: ["业务异常可预期", "系统异常需告警", "错误类型分层", "对外响应稳定"],
      referenceAnswer: "业务异常用于表达可预期的校验/状态问题，系统异常代表依赖或代码故障；可定义基础业务错误并派生错误码，对外返回稳定消息，对系统异常记录日志并告警。",
      rubric: ["区分异常性质", "说明错误类型组织", "说明对外响应和日志"]
    }
  ],
  "typescript-basics": [
    {
      type: "short-answer",
      prompt: "TypeScript 中接口响应为什么不能直接 `as` 成目标类型就使用？应该在哪里做运行时校验？",
      targetSkill: "类型安全",
      expectedPoints: ["编译期类型不等于运行时校验", "边界处校验", "错误处理"],
      referenceAnswer: "类型断言只影响编译器，不验证真实数据；应在 API 边界用 schema 或显式校验解析，失败时返回可理解错误。",
      rubric: ["说明类型断言风险", "指出边界校验", "包含错误处理"]
    },
    {
      type: "code",
      prompt: "写一个 TypeScript 类型或函数，安全读取接口返回里的 `items` 数组，缺失时返回空数组。",
      targetSkill: "运行时保护",
      expectedPoints: ["Array.isArray", "默认值", "避免抛错"],
      referenceAnswer: "使用 `Array.isArray(data?.items) ? data.items : []`，必要时继续校验元素结构。",
      rubric: ["能处理 undefined", "能处理非数组", "返回类型清晰"]
    },
    {
      type: "short-answer",
      prompt: "Promise 并发请求时，`Promise.all` 和 `Promise.allSettled` 的选择依据是什么？",
      targetSkill: "异步控制",
      expectedPoints: ["失败传播", "部分成功", "结果聚合"],
      referenceAnswer: "`Promise.all` 适合任一失败整体失败的强依赖任务；`allSettled` 适合批处理、部分成功可接受并需要汇总失败原因的场景。",
      rubric: ["说明失败行为", "说明适用场景", "包含结果处理"]
    }
  ]
};

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayNumber(date: string) {
  return Number(date.replaceAll("-", ""));
}

function ensureQuestionTemplates(module: InterviewSkillModule) {
  return QUESTION_BANK[module.id] ?? module.targetSkills.slice(0, QUESTIONS_PER_MODULE).map((skill, index) => ({
    type: index % 2 === 0 ? "short-answer" as const : "code" as const,
    prompt: `围绕「${module.label}」中的「${skill}」，请回答一个中级 AI 全栈开发面试中会追问的真实工程问题，并说明你的处理步骤。`,
    targetSkill: skill,
    expectedPoints: [skill, "工程取舍", "错误处理"],
    referenceAnswer: `应结合 ${module.description}，说明核心实现、边界条件、错误处理和可验证方式。`,
    rubric: ["是否贴近真实工程", "是否覆盖边界", "是否能落地验证"]
  }));
}

function clampScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    return match ? JSON.parse(match[0]) as Record<string, unknown> : {};
  }
}

function moduleById(id: string) {
  return INTERVIEW_SKILL_MODULES.find((module) => module.id === id);
}

function scoreValue(answer: InterviewAnswer) {
  return answer.finalScore ?? answer.manualScore ?? answer.aiScore;
}

export function createInterviewService(options: {
  store: ControlPlaneStore;
  modelRuntime: Pick<ModelRuntime, "generateText">;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());

  function getState(): InterviewState {
    const current = options.store.getState().interview;
    return {
      skillModules: INTERVIEW_SKILL_MODULES,
      sessions: current?.sessions ?? [],
      lastUpdatedAt: current?.lastUpdatedAt ?? null
    };
  }

  function save(next: InterviewState) {
    return options.store.setInterviewState({
      ...next,
      skillModules: INTERVIEW_SKILL_MODULES,
      lastUpdatedAt: now().toISOString()
    });
  }

  function buildReport(session: InterviewDailySession): InterviewDailyReport {
    const scoredAnswers = session.answers.filter((answer) => scoreValue(answer) !== null);
    const totalScore = scoredAnswers.reduce((sum, answer) => sum + (scoreValue(answer) ?? 0), 0);
    const moduleScores = session.moduleIds.map((moduleId) => {
      const module = moduleById(moduleId);
      const questionIds = new Set(session.questions.filter((question) => question.moduleId === moduleId).map((question) => question.id));
      const answers = scoredAnswers.filter((answer) => questionIds.has(answer.questionId));
      const scoreSum = answers.reduce((sum, answer) => sum + (scoreValue(answer) ?? 0), 0);
      return {
        moduleId,
        label: module?.label ?? moduleId,
        completedCount: answers.length,
        averageScore: answers.length ? Math.round(scoreSum / answers.length) : null
      };
    });
    const weakPoints = moduleScores
      .filter((module) => module.averageScore === null || module.averageScore < 80)
      .map((module) => module.label);
    const completedCount = session.answers.length;
    const averageScore = scoredAnswers.length ? Math.round(totalScore / scoredAnswers.length) : null;

    return {
      id: `interview-report-${session.date}`,
      date: session.date,
      sessionId: session.id,
      completedCount,
      totalCount: session.questions.length,
      averageScore,
      moduleScores,
      weakPoints,
      summary: completedCount
        ? `今天已完成 ${completedCount}/${session.questions.length} 题，平均分 ${averageScore ?? "-"}。`
        : "今天还未开始答题。",
      nextSuggestions: weakPoints.length
        ? weakPoints.slice(0, 3).map((label) => `明天优先复习 ${label}`)
        : ["保持当前节奏，增加一道真实项目追问题。"],
      updatedAt: now().toISOString()
    };
  }

  function selectModules(date: string, state: InterviewState) {
    const previousScores = new Map<string, number[]>();
    for (const session of state.sessions) {
      for (const answer of session.answers) {
        const question = session.questions.find((item) => item.id === answer.questionId);
        const score = scoreValue(answer);
        if (!question || score === null) continue;
        previousScores.set(question.moduleId, [...(previousScores.get(question.moduleId) ?? []), score]);
      }
    }

    const scored = INTERVIEW_SKILL_MODULES.map((module, index) => {
      const scores = previousScores.get(module.id) ?? [];
      const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
      const weakness = module.id === "python-basics" || average === null || average < 80 ? module.weaknessBoost : 0;
      const rotation = (dayNumber(date) + index * 7) % INTERVIEW_SKILL_MODULES.length;
      return {
        module,
        priority: module.defaultWeight + weakness - rotation / 100
      };
    });

    return scored
      .sort((left, right) => right.priority - left.priority)
      .slice(0, MODULES_PER_DAY)
      .map((item) => item.module.id);
  }

  function createQuestions(date: string, sessionId: string, moduleIds: string[]): InterviewQuestion[] {
    return moduleIds.flatMap((moduleId) => {
      const module = moduleById(moduleId)!;
      return ensureQuestionTemplates(module).slice(0, QUESTIONS_PER_MODULE).map((template, index) => ({
        id: `interview-question-${date}-${moduleId}-${index + 1}`,
        sessionId,
        date,
        moduleId,
        type: template.type,
        difficulty: index === 0 ? "basic" : "middle",
        prompt: template.prompt,
        targetSkill: template.targetSkill,
        expectedPoints: template.expectedPoints,
        referenceAnswer: template.referenceAnswer,
        rubric: template.rubric,
        createdAt: now().toISOString()
      }));
    });
  }

  function replaceSession(session: InterviewDailySession) {
    const state = getState();
    save({
      ...state,
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)]
    });
    return session;
  }

  async function getOrCreateDailySession(input: { force?: boolean } = {}) {
    const state = getState();
    const date = localDate(now());
    const existing = state.sessions.find((session) => session.date === date);
    if (existing && !input.force) {
      return existing;
    }

    const sessionId = `interview-session-${date}`;
    const moduleIds = selectModules(date, state);
    const base: InterviewDailySession = {
      id: sessionId,
      date,
      moduleIds,
      questions: createQuestions(date, sessionId, moduleIds),
      answers: [],
      report: {
        id: `interview-report-${date}`,
        date,
        sessionId,
        completedCount: 0,
        totalCount: moduleIds.length * QUESTIONS_PER_MODULE,
        averageScore: null,
        moduleScores: [],
        weakPoints: moduleIds.map((moduleId) => moduleById(moduleId)?.label ?? moduleId),
        summary: "今天还未开始答题。",
        nextSuggestions: ["先完成今日轮换模块题目。"],
        updatedAt: now().toISOString()
      },
      status: "active",
      createdAt: now().toISOString(),
      updatedAt: now().toISOString()
    };
    base.report = buildReport(base);
    return replaceSession(base);
  }

  function findQuestion(questionId: string) {
    const state = getState();
    for (const session of state.sessions) {
      const question = session.questions.find((item) => item.id === questionId);
      if (question) return { state, session, question };
    }
    return null;
  }

  async function submitAnswer(input: { questionId?: unknown; answerText?: unknown }) {
    const questionId = typeof input.questionId === "string" ? input.questionId : "";
    const answerText = typeof input.answerText === "string" ? input.answerText.trim() : "";
    if (!questionId || !answerText) {
      throw new Error("questionId and answerText are required");
    }

    let found = findQuestion(questionId);
    if (!found) {
      await getOrCreateDailySession();
      found = findQuestion(questionId);
    }
    if (!found) {
      throw new Error("interview question not found");
    }

    const { state, session, question } = found;
    const module = moduleById(question.moduleId);
    const timestamp = now().toISOString();
    const baseAnswer: InterviewAnswer = {
      id: `interview-answer-${nanoid()}`,
      questionId: question.id,
      sessionId: session.id,
      date: session.date,
      answerText,
      aiScore: null,
      manualScore: null,
      finalScore: null,
      feedback: "",
      strengths: [],
      gaps: [],
      mistakeTags: [],
      referenceAnswer: question.referenceAnswer,
      mastery: "未掌握",
      note: "",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    let parsed: Record<string, unknown>;
    try {
      const result = await options.modelRuntime.generateText({
        purpose: "general",
        responseFormat: "json",
        temperature: 0.2,
        maxTokens: 1200,
        systemPrompt: "你是 AI 全栈开发面试官。请严格输出 JSON。",
        prompt: [
          `岗位：中级实战 AI 全栈开发`,
          `能力模块：${module?.label ?? question.moduleId}`,
          `题目：${question.prompt}`,
          `评分标准：${question.rubric.join("；")}`,
          `参考答案：${question.referenceAnswer}`,
          `候选人答案：${answerText}`,
          "输出字段：score number, feedback string, strengths string[], gaps string[], mistakeTags string[], referenceAnswer string。"
        ].join("\n")
      });
      parsed = parseJsonObject(result.text);
    } catch (error) {
      const failedAnswer = {
        ...baseAnswer,
        feedback: error instanceof Error ? error.message : "模型评分失败",
        updatedAt: now().toISOString()
      };
      const nextSession = {
        ...session,
        answers: [failedAnswer, ...session.answers.filter((answer) => answer.questionId !== question.id)],
        updatedAt: now().toISOString()
      };
      nextSession.report = buildReport(nextSession);
      save({
        ...state,
        sessions: [nextSession, ...state.sessions.filter((item) => item.id !== session.id)]
      });
      throw new Error(`模型评分失败，答案已保存：${failedAnswer.id}`);
    }

    const aiScore = clampScore(parsed.score);
    const answer: InterviewAnswer = {
      ...baseAnswer,
      aiScore,
      finalScore: aiScore,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "已完成评分。",
      strengths: strings(parsed.strengths),
      gaps: strings(parsed.gaps),
      mistakeTags: strings(parsed.mistakeTags),
      referenceAnswer: typeof parsed.referenceAnswer === "string" && parsed.referenceAnswer.trim()
        ? parsed.referenceAnswer.trim()
        : question.referenceAnswer,
      mastery: aiScore !== null && aiScore >= 85 ? "掌握" : aiScore !== null && aiScore >= 70 ? "基本掌握" : "未掌握",
      updatedAt: now().toISOString()
    };
    const nextSession = {
      ...session,
      answers: [answer, ...session.answers.filter((item) => item.questionId !== question.id)],
      updatedAt: now().toISOString()
    };
    nextSession.report = buildReport(nextSession);
    save({
      ...state,
      sessions: [nextSession, ...state.sessions.filter((item) => item.id !== session.id)]
    });
    return answer;
  }

  function updateAnswer(id: string, patch: { manualScore?: unknown; mastery?: unknown; note?: unknown }) {
    const state = getState();
    for (const session of state.sessions) {
      const current = session.answers.find((answer) => answer.id === id);
      if (!current) continue;

      const manualScore = Object.hasOwn(patch, "manualScore")
        ? clampScore(patch.manualScore)
        : current.manualScore;
      const mastery = patch.mastery === "掌握" || patch.mastery === "基本掌握" || patch.mastery === "未掌握"
        ? patch.mastery as InterviewMastery
        : current.mastery;
      const updated = {
        ...current,
        manualScore,
        finalScore: manualScore ?? current.aiScore,
        mastery,
        note: typeof patch.note === "string" ? patch.note : current.note,
        updatedAt: now().toISOString()
      };
      const nextSession = {
        ...session,
        answers: [updated, ...session.answers.filter((answer) => answer.id !== id)],
        updatedAt: now().toISOString()
      };
      nextSession.report = buildReport(nextSession);
      save({
        ...state,
        sessions: [nextSession, ...state.sessions.filter((item) => item.id !== session.id)]
      });
      return updated;
    }

    throw new Error("interview answer not found");
  }

  function regenerateReport(date: string) {
    const state = getState();
    const session = state.sessions.find((item) => item.date === date);
    if (!session) {
      throw new Error("interview session not found");
    }
    const nextSession = {
      ...session,
      report: buildReport(session),
      updatedAt: now().toISOString()
    };
    save({
      ...state,
      sessions: [nextSession, ...state.sessions.filter((item) => item.id !== session.id)]
    });
    return nextSession.report;
  }

  function getWeakModules(state = getState()): InterviewWeakModule[] {
    const scores = new Map<string, number[]>();
    for (const session of state.sessions) {
      for (const answer of session.answers) {
        const question = session.questions.find((item) => item.id === answer.questionId);
        const score = scoreValue(answer);
        if (!question || score === null) continue;
        scores.set(question.moduleId, [...(scores.get(question.moduleId) ?? []), score]);
      }
    }

    return INTERVIEW_SKILL_MODULES.map((module) => {
      const moduleScores = scores.get(module.id) ?? [];
      const average = moduleScores.length
        ? Math.round(moduleScores.reduce((sum, value) => sum + value, 0) / moduleScores.length)
        : null;
      const defaultWeak = module.id === "python-basics";
      return {
        id: module.id,
        label: module.label,
        category: module.category,
        score: average,
        reason: average === null
          ? defaultWeak ? "默认弱项，优先训练。" : "尚未训练，等待轮换。"
          : average < 80 ? "近期得分偏低，需要复习。" : "保持巩固。"
      };
    }).sort((left, right) => {
      if (left.id === "python-basics") return -1;
      if (right.id === "python-basics") return 1;
      return (left.score ?? -1) - (right.score ?? -1);
    }).slice(0, 5);
  }

  function streakDays(state = getState()) {
    const completedDates = new Set(
      state.sessions.filter((session) => session.answers.length > 0).map((session) => session.date)
    );
    let cursor = now();
    let streak = 0;
    while (completedDates.has(localDate(cursor))) {
      streak += 1;
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function getOverview(): InterviewOverview {
    const state = getState();
    const today = localDate(now());
    const todaySession = state.sessions.find((session) => session.date === today) ?? null;
    const reports = state.sessions.map((session) => session.report).sort((left, right) => right.date.localeCompare(left.date));
    return {
      skillModules: INTERVIEW_SKILL_MODULES,
      weakModules: getWeakModules(state),
      todaySession,
      recentReports: reports.slice(0, 7),
      wrongAnswers: state.sessions.flatMap((session) =>
        session.answers.filter((answer) => (scoreValue(answer) ?? 100) < 80)
      ).slice(0, 12),
      todayReport: todaySession?.report ?? null,
      streakDays: streakDays(state),
      estimatedMinutes: todaySession ? Math.max(8, todaySession.questions.length * 8) : MODULES_PER_DAY * QUESTIONS_PER_MODULE * 8
    };
  }

  return {
    getOverview,
    getOrCreateDailySession,
    submitAnswer,
    updateAnswer,
    regenerateReport
  };
}

export type InterviewService = ReturnType<typeof createInterviewService>;
